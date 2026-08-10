import { asc, eq, sql } from "drizzle-orm";
import {
  buildRacingSimulationFinal,
  buildRacingSimulationSeed,
} from "@bk-games/shared";

import { db } from "./client.js";
import {
  racingActions,
  racingRaceEntries,
  racingRaces,
  racingTables,
} from "./schema.js";
import {
  cancelRacingRace,
  type CancelRacingRaceResult,
  settleRacingRace,
  type SettleRacingRaceResult,
} from "./racing-betting.js";

export type AdvanceRacingRaceLifecycleInput = {
  tableCode: string;
  now?: Date;
};

export type AdvanceRacingRaceLifecycleResult = {
  started: RacingLifecycleRace | null;
  settled: SettleRacingRaceResult | null;
  cancelled: CancelRacingRaceResult | null;
  roundEnded: RacingLifecycleRace | null;
};

export type RacingLifecycleRace = typeof racingRaces.$inferSelect & {
  entries: RacingLifecycleRaceEntry[];
};

export type RacingLifecycleRaceEntry = typeof racingRaceEntries.$inferSelect;

export type RacingClockInput = {
  tableCode: string;
  now?: Date;
};

export type RacingClockUpdate = {
  raceId: string;
  pausedAt: Date | null;
};

type RacingRunnerTable = typeof racingTables.$inferSelect;

type RaceIdRow = {
  id: string;
};

type ActionSequenceRow = {
  actionSequence: number;
};

const zero = BigInt(0);

export async function advanceRacingRaceLifecycle(
  input: AdvanceRacingRaceLifecycleInput,
): Promise<AdvanceRacingRaceLifecycleResult> {
  const normalizedInput = normalizeAdvanceInput(input);
  const roundEnded = await endDueSettledRace(normalizedInput);
  const resolved = await resolveDueRunningRace(normalizedInput);
  const started = await startDueRacingRace(normalizedInput);

  return {
    started,
    settled: resolved.settled,
    cancelled: resolved.cancelled,
    roundEnded,
  };
}

export async function pauseRacingRaceClock(
  input: RacingClockInput,
): Promise<RacingClockUpdate | null> {
  const normalized = normalizeClockInput(input);

  return db.transaction(async (tx) => {
    const race = await findCurrentRaceForClockUpdate(
      tx,
      normalized.tableCode,
    );

    if (!race || race.pausedAt) {
      return race
        ? { raceId: race.id, pausedAt: race.pausedAt }
        : null;
    }

    const [updated] = await tx
      .update(racingRaces)
      .set({
        pausedAt: normalized.now,
        updatedAt: normalized.now,
      })
      .where(eq(racingRaces.id, race.id))
      .returning({ id: racingRaces.id, pausedAt: racingRaces.pausedAt });

    return updated
      ? { raceId: updated.id, pausedAt: updated.pausedAt }
      : null;
  });
}

export async function resumeRacingRaceClock(
  input: RacingClockInput,
): Promise<RacingClockUpdate | null> {
  const normalized = normalizeClockInput(input);

  return db.transaction(async (tx) => {
    const race = await findCurrentRaceForClockUpdate(
      tx,
      normalized.tableCode,
    );

    if (!race || !race.pausedAt) {
      return race
        ? { raceId: race.id, pausedAt: race.pausedAt }
        : null;
    }

    const pausedDurationMs = Math.max(
      0,
      normalized.now.getTime() - race.pausedAt.getTime(),
    );
    const shift = (value: Date | null) =>
      value ? new Date(value.getTime() + pausedDurationMs) : null;
    const [updated] = await tx
      .update(racingRaces)
      .set({
        scheduledStartAt: shift(race.scheduledStartAt),
        bettingOpensAt: shift(race.bettingOpensAt),
        bettingClosesAt: shift(race.bettingClosesAt),
        startedAt: shift(race.startedAt),
        pausedAt: null,
        updatedAt: normalized.now,
      })
      .where(eq(racingRaces.id, race.id))
      .returning({ id: racingRaces.id, pausedAt: racingRaces.pausedAt });

    return updated
      ? { raceId: updated.id, pausedAt: updated.pausedAt }
      : null;
  });
}

async function startDueRacingRace(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  return db.transaction(async (tx) => {
    const table = await lockRacingTableByCode(tx, input.tableCode);
    const raceId = await findDueRaceIdForStart(tx, table.id, input.now);

    if (!raceId) {
      return null;
    }

    const now = input.now;
    const seed = buildRacingSimulationSeed({
      raceId,
      raceNo: await findRacingRaceNoById(tx, raceId),
    });
    const [race] = await tx
      .update(racingRaces)
      .set({
        status: "RUNNING",
        phase: "RUNNING",
        seed,
        seedLockedAt: now,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(racingRaces.id, raceId))
      .returning();

    if (!race) {
      throw new RacingRunnerError(
        "RACE_NOT_FOUND",
        `Race ${raceId} disappeared before start.`,
      );
    }

    await insertRacingAction(tx, {
      raceId,
      actionType: "RACE_START",
      commandId: `race-start:${raceId}`,
      payload: {
        scheduledStartAt: race.scheduledStartAt?.toISOString() ?? null,
        startedAt: now.toISOString(),
        seedLockedAt: now.toISOString(),
      },
    });

    return {
      ...race,
      entries: await findRacingRaceEntries(tx, raceId),
    };
  });
}

async function resolveDueRunningRace(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  const runningRace = await findRunningRaceForResolution(input);

  if (!runningRace) {
    return {
      settled: null,
      cancelled: null,
    };
  }

  const elapsedMs = input.now.getTime() - getRaceStartAt(runningRace).getTime();

  if (elapsedMs < 0) {
    return {
      settled: null,
      cancelled: null,
    };
  }

  const raceRunDurationMs = getRaceRunDurationMs(runningRace.table);

  try {
    const entries = buildSimulationResult(runningRace);
    const maxFinishedAtMs = Math.max(
      ...entries.map((entry) => entry.finishedAtMs),
    );

    if (elapsedMs < maxFinishedAtMs) {
      return {
        settled: null,
        cancelled: null,
      };
    }

    return {
      settled: await settleRacingRace({
        raceId: runningRace.id,
        entries,
      }),
      cancelled: null,
    };
  } catch (error) {
    if (!isSimulationUnfinishedError(error)) {
      throw error;
    }

    if (elapsedMs < raceRunDurationMs) {
      return {
        settled: null,
        cancelled: null,
      };
    }

    return {
      settled: null,
      cancelled: await cancelRacingRace({
        raceId: runningRace.id,
        reason: "RACING_SIMULATION_TIMEOUT",
      }),
    };
  }
}

async function endDueSettledRace(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  return db.transaction(async (tx) => {
    const table = await lockRacingTableByCode(tx, input.tableCode);
    const raceId = await findDueSettledRaceIdForRoundEnd(tx, table, input.now);

    if (!raceId) {
      return null;
    }

    const [race] = await tx
      .update(racingRaces)
      .set({
        phase: "ROUND_END",
        updatedAt: input.now,
      })
      .where(eq(racingRaces.id, raceId))
      .returning();

    if (!race) {
      throw new RacingRunnerError(
        "RACE_NOT_FOUND",
        `Race ${raceId} disappeared before round end.`,
      );
    }

    return {
      ...race,
      entries: await findRacingRaceEntries(tx, raceId),
    };
  });
}

async function findRunningRaceForResolution(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  return db.transaction(async (tx) => {
    const table = await lockRacingTableByCode(tx, input.tableCode);
    const raceId = await findRunningRaceIdForResolution(
      tx,
      table,
      input.now,
    );

    if (!raceId) {
      return null;
    }

    const race = await findRacingRaceById(tx, raceId);

    if (!race) {
      throw new RacingRunnerError(
        "RACE_NOT_FOUND",
        `Race ${raceId} disappeared before settlement.`,
      );
    }

    return {
      ...race,
      entries: await findRacingRaceEntries(tx, raceId),
      table,
    };
  });
}

async function findCurrentRaceForClockUpdate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableCode: string,
) {
  const result = await tx.execute(sql<{ id: string }>`
    select rr.id
    from racing_races rr
    inner join racing_tables rt on rt.id = rr.table_id
    where rt.code = ${tableCode}
      and rr.phase not in ('ROUND_END', 'CANCELLED')
    order by rr.race_no desc
    limit 1
    for update of rr
  `);
  const [row] = getRows<{ id: string }>(result);

  if (!row) {
    return null;
  }

  return findRacingRaceById(tx, row.id);
}

async function lockRacingTableByCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableCode: string,
): Promise<RacingRunnerTable> {
  const result = await tx.execute(sql<RacingRunnerTable>`
    select
      id,
      code,
      name,
      status,
      field_size as "fieldSize",
      min_bet as "minBet",
      max_bet as "maxBet",
      payout_rate_bps as "payoutRateBps",
      betting_timeout_seconds as "bettingTimeoutSeconds",
      race_interval_seconds as "raceIntervalSeconds",
      betting_close_before_start_seconds as "bettingCloseBeforeStartSeconds",
      tick_interval_ms as "tickIntervalMs",
      race_distance_m as "raceDistanceM",
      round_end_delay_seconds as "roundEndDelaySeconds",
      rules,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from racing_tables
    where code = ${tableCode}
    for update
  `);
  const [table] = getRows<RacingRunnerTable>(result);

  if (!table) {
    throw new RacingRunnerError(
      "TABLE_NOT_FOUND",
      `Racing table ${tableCode} was not found.`,
    );
  }

  return table;
}

async function findDueRaceIdForStart(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableId: string,
  now: Date,
) {
  const result = await tx.execute(sql<RaceIdRow>`
    select id
    from racing_races
    where table_id = ${tableId}
      and phase in ('WAITING', 'BETTING', 'LOCKING_BETS')
      and paused_at is null
      and scheduled_start_at is not null
      and scheduled_start_at <= ${now}
    order by scheduled_start_at asc
    limit 1
    for update
  `);
  const [row] = getRows<RaceIdRow>(result);

  return row?.id ?? null;
}

async function findRunningRaceIdForResolution(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: RacingRunnerTable,
  now: Date,
) {
  const result = await tx.execute(sql<RaceIdRow>`
    select id
    from racing_races
    where table_id = ${table.id}
      and phase = 'RUNNING'
      and paused_at is null
      and coalesce(scheduled_start_at, started_at) is not null
      and coalesce(started_at, scheduled_start_at) <= ${now}
    order by coalesce(started_at, scheduled_start_at) asc
    limit 1
    for update
  `);
  const [row] = getRows<RaceIdRow>(result);

  return row?.id ?? null;
}

async function findDueSettledRaceIdForRoundEnd(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: RacingRunnerTable,
  now: Date,
) {
  const roundEndAt = new Date(
    now.getTime() - getRaceAndResultDurationMs(table),
  );
  const result = await tx.execute(sql<RaceIdRow>`
    select id
    from racing_races
    where table_id = ${table.id}
      and status = 'SETTLED'
      and phase = 'SETTLED'
      and paused_at is null
      and coalesce(scheduled_start_at, settled_at) is not null
      and coalesce(scheduled_start_at, settled_at) <= ${roundEndAt}
    order by coalesce(scheduled_start_at, settled_at) asc
    limit 1
    for update
  `);
  const [row] = getRows<RaceIdRow>(result);

  return row?.id ?? null;
}

async function findRacingRaceById(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  raceId: string,
) {
  const [race] = await tx
    .select()
    .from(racingRaces)
    .where(eq(racingRaces.id, raceId))
    .limit(1);

  return race ?? null;
}

async function findRacingRaceNoById(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  raceId: string,
) {
  const [race] = await tx
    .select({ raceNo: racingRaces.raceNo })
    .from(racingRaces)
    .where(eq(racingRaces.id, raceId))
    .limit(1);

  if (!race) {
    throw new RacingRunnerError(
      "RACE_NOT_FOUND",
      `Race ${raceId} disappeared before seed lock.`,
    );
  }

  return race.raceNo;
}

async function findRacingRaceEntries(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  raceId: string,
) {
  return tx
    .select()
    .from(racingRaceEntries)
    .where(eq(racingRaceEntries.raceId, raceId))
    .orderBy(asc(racingRaceEntries.number));
}

async function insertRacingAction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    raceId: string;
    actionType: "RACE_START";
    commandId: string;
    payload: Record<string, unknown>;
  },
) {
  const actionSequence = await nextActionSequence(tx, input.raceId);

  await tx.insert(racingActions).values({
    raceId: input.raceId,
    actorType: "SYSTEM",
    actionType: input.actionType,
    actionSequence,
    commandId: input.commandId,
    amount: zero,
    payload: input.payload,
  });
}

async function nextActionSequence(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  raceId: string,
) {
  const result = await tx.execute(sql<ActionSequenceRow>`
    select coalesce(max(action_sequence), 0) + 1 as "actionSequence"
    from racing_actions
    where race_id = ${raceId}
  `);
  const [row] = getRows<ActionSequenceRow>(result);

  return Number(row?.actionSequence ?? 1);
}

function buildSimulationResult(
  race: RacingLifecycleRace & { table: RacingRunnerTable },
) {
  return buildRacingSimulationFinal({
    seed:
      race.seed ??
      buildRacingSimulationSeed({
        raceId: race.id,
        raceNo: race.raceNo,
      }),
    distanceM: race.distanceM,
    runDurationMs: getRaceRunDurationMs(race.table),
    tickIntervalMs: race.table.tickIntervalMs,
    entries: race.entries.map((entry) => ({
      raceEntryId: entry.id,
      number: entry.number,
    })),
  });
}

function getRaceAndResultDurationMs(table: RacingRunnerTable) {
  return (
    (table.raceIntervalSeconds -
      table.bettingTimeoutSeconds -
      table.bettingCloseBeforeStartSeconds) *
    1000
  );
}

function getRaceRunDurationMs(table: RacingRunnerTable) {
  return Math.max(
    1_000,
    getRaceAndResultDurationMs(table) - table.roundEndDelaySeconds * 1000,
  );
}

function getRaceStartAt(race: RacingLifecycleRace) {
  return race.startedAt ?? race.scheduledStartAt ?? new Date(0);
}

function isSimulationUnfinishedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith("Racing simulation did not finish entry ")
  );
}

function normalizeAdvanceInput(
  input: AdvanceRacingRaceLifecycleInput,
): Required<AdvanceRacingRaceLifecycleInput> {
  const tableCode = input.tableCode.trim();

  if (!tableCode) {
    throw new RacingRunnerError("TABLE_NOT_FOUND", "tableCode is required.");
  }

  return {
    tableCode,
    now: input.now ?? new Date(),
  };
}

function normalizeClockInput(input: RacingClockInput) {
  const tableCode = input.tableCode.trim();

  if (!tableCode) {
    throw new RacingClockError("tableCode is required.");
  }

  return {
    tableCode,
    now: input.now ?? new Date(),
  };
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export type RacingRunnerErrorCode = "TABLE_NOT_FOUND" | "RACE_NOT_FOUND";

export class RacingRunnerError extends Error {
  readonly code: RacingRunnerErrorCode;

  constructor(code: RacingRunnerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RacingRunnerError";
  }
}

export class RacingClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RacingClockError";
  }
}
