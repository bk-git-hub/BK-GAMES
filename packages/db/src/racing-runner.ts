import { asc, eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  racingActions,
  racingRaceEntries,
  racingRaces,
  racingTables,
} from "./schema.js";
import {
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
  roundEnded: RacingLifecycleRace | null;
};

export type RacingLifecycleRace = typeof racingRaces.$inferSelect & {
  entries: RacingLifecycleRaceEntry[];
};

export type RacingLifecycleRaceEntry = typeof racingRaceEntries.$inferSelect;

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
  const settled = await settleDueRunningRace(normalizedInput);
  const started = await startDueRacingRace(normalizedInput);

  return {
    started,
    settled,
    roundEnded,
  };
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
    const [race] = await tx
      .update(racingRaces)
      .set({
        status: "RUNNING",
        phase: "RUNNING",
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
      },
    });

    return {
      ...race,
      entries: await findRacingRaceEntries(tx, raceId),
    };
  });
}

async function settleDueRunningRace(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  const dueRace = await findDueRunningRace(input);

  if (!dueRace) {
    return null;
  }

  return settleRacingRace({
    raceId: dueRace.id,
    entries: buildDeterministicResult(dueRace),
  });
}

async function endDueSettledRace(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  return db.transaction(async (tx) => {
    const table = await lockRacingTableByCode(tx, input.tableCode);
    const raceId = await findDueSettledRaceIdForRoundEnd(
      tx,
      table,
      input.now,
    );

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

async function findDueRunningRace(
  input: Required<AdvanceRacingRaceLifecycleInput>,
) {
  return db.transaction(async (tx) => {
    const table = await lockRacingTableByCode(tx, input.tableCode);
    const raceId = await findDueRunningRaceIdForSettlement(
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
      and scheduled_start_at is not null
      and scheduled_start_at <= ${now}
    order by scheduled_start_at asc
    limit 1
    for update
  `);
  const [row] = getRows<RaceIdRow>(result);

  return row?.id ?? null;
}

async function findDueRunningRaceIdForSettlement(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: RacingRunnerTable,
  now: Date,
) {
  const settleAt = new Date(now.getTime() - getRaceRunDurationMs(table));
  const result = await tx.execute(sql<RaceIdRow>`
    select id
    from racing_races
    where table_id = ${table.id}
      and phase = 'RUNNING'
      and coalesce(scheduled_start_at, started_at) is not null
      and coalesce(scheduled_start_at, started_at) <= ${settleAt}
    order by coalesce(scheduled_start_at, started_at) asc
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
  const roundEndAt = new Date(now.getTime() - getRaceAndResultDurationMs(table));
  const result = await tx.execute(sql<RaceIdRow>`
    select id
    from racing_races
    where table_id = ${table.id}
      and status = 'SETTLED'
      and phase = 'SETTLED'
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

function buildDeterministicResult(
  race: RacingLifecycleRace & { table: RacingRunnerTable },
) {
  const entries = race.entries.map((entry) => ({
    raceEntryId: entry.id,
    score: deterministicScore(
      `${race.id}:${race.raceNo}:${entry.id}:${entry.number}`,
    ),
  }));
  const runDurationMs = getRaceRunDurationMs(race.table);
  const finishSpreadMs = Math.min(6_000, Math.max(1_000, runDurationMs / 5));
  const baseFinishMs = Math.max(1_000, runDurationMs - finishSpreadMs);

  return entries
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => ({
      raceEntryId: entry.raceEntryId,
      finalRank: index + 1,
      finishedAtMs: Math.round(
        baseFinishMs + (finishSpreadMs / entries.length) * index,
      ),
    }));
}

function getRaceAndResultDurationMs(table: RacingRunnerTable) {
  return (
    table.raceIntervalSeconds -
    table.bettingTimeoutSeconds -
    table.bettingCloseBeforeStartSeconds
  ) * 1000;
}

function getRaceRunDurationMs(table: RacingRunnerTable) {
  return Math.max(
    1_000,
    getRaceAndResultDurationMs(table) - table.roundEndDelaySeconds * 1000,
  );
}

function deterministicScore(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
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

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export type RacingRunnerErrorCode =
  | "TABLE_NOT_FOUND"
  | "RACE_NOT_FOUND";

export class RacingRunnerError extends Error {
  readonly code: RacingRunnerErrorCode;

  constructor(code: RacingRunnerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RacingRunnerError";
  }
}
