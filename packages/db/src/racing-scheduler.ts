import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  racingHorses,
  racingRaceEntries,
  racingRaces,
  racingTables,
  type JsonObject,
} from "./schema.js";

export type EnsureScheduledRacingRaceInput = {
  tableCode: string;
  now?: Date;
};

export type EnsureScheduledRacingRaceResult = {
  table: typeof racingTables.$inferSelect;
  race: typeof racingRaces.$inferSelect;
  entries: ScheduledRacingRaceEntry[];
  created: boolean;
};

export type ScheduledRacingRaceEntry = {
  raceEntryId: string;
  raceId: string;
  horseId: string;
  number: number;
  gateNo: number;
  lane: number;
  horseName: string;
  silkColor: string;
};

type LockedRacingTableRow = typeof racingTables.$inferSelect;

type RaceNoRow = {
  raceNo: number;
};

const noBetSeed = null;
const noBetSeedLockedAt = null;

export async function ensureScheduledRacingRace(
  input: EnsureScheduledRacingRaceInput,
): Promise<EnsureScheduledRacingRaceResult> {
  const normalizedInput = normalizeEnsureScheduledRaceInput(input);

  return db.transaction(async (tx) => {
    const table = await lockRacingTableByCode(
      tx,
      normalizedInput.tableCode,
    );
    const schedule = buildSchedule(table, normalizedInput.now);
    const existingRace = await findRaceByScheduledStart(
      tx,
      table.id,
      schedule.scheduledStartAt,
    );

    if (existingRace) {
      const race = await updateRaceSchedulePhaseIfNeeded(
        tx,
        existingRace,
        schedule.phase,
      );

      return {
        table,
        race,
        entries: await findScheduledRaceEntries(tx, race.id),
        created: false,
      };
    }

    const horses = await findActiveRacingHorses(tx, table.fieldSize);
    const raceNo = await nextRaceNo(tx, table.id);
    const [race] = await tx
      .insert(racingRaces)
      .values({
        tableId: table.id,
        raceNo,
        status: schedule.phase,
        seed: noBetSeed,
        seedLockedAt: noBetSeedLockedAt,
        distanceM: table.raceDistanceM,
        fieldSize: table.fieldSize,
        phase: schedule.phase,
        scheduledStartAt: schedule.scheduledStartAt,
        bettingOpensAt: schedule.bettingOpensAt,
        bettingClosesAt: schedule.bettingClosesAt,
        runtimeSnapshot: buildRuntimeSnapshot(table, schedule),
      })
      .returning();

    if (!race) {
      throw new RacingSchedulerError(
        "RACE_NOT_FOUND",
        `Failed to create racing race for table ${table.code}.`,
      );
    }

    await tx.insert(racingRaceEntries).values(
      horses.map((horse, index) => ({
        raceId: race.id,
        horseId: horse.id,
        number: index + 1,
        gateNo: index + 1,
        lane: index + 1,
      })),
    );

    return {
      table,
      race,
      entries: await findScheduledRaceEntries(tx, race.id),
      created: true,
    };
  });
}

async function lockRacingTableByCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableCode: string,
): Promise<LockedRacingTableRow> {
  const result = await tx.execute(sql<LockedRacingTableRow>`
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
  const [table] = getRows<LockedRacingTableRow>(result);

  if (!table) {
    throw new RacingSchedulerError(
      "TABLE_NOT_FOUND",
      `Racing table ${tableCode} was not found.`,
    );
  }

  return table;
}

async function findRaceByScheduledStart(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableId: string,
  scheduledStartAt: Date,
) {
  const [race] = await tx
    .select()
    .from(racingRaces)
    .where(
      and(
        eq(racingRaces.tableId, tableId),
        eq(racingRaces.scheduledStartAt, scheduledStartAt),
      ),
    )
    .limit(1);

  return race ?? null;
}

async function updateRaceSchedulePhaseIfNeeded(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  race: typeof racingRaces.$inferSelect,
  phase: ScheduledRacingPhase,
) {
  if (
    race.status === phase &&
    race.phase === phase &&
    !isTerminalRacePhase(race.phase)
  ) {
    return race;
  }

  if (isTerminalRacePhase(race.phase)) {
    return race;
  }

  const [updatedRace] = await tx
    .update(racingRaces)
    .set({
      status: phase,
      phase,
      updatedAt: new Date(),
    })
    .where(eq(racingRaces.id, race.id))
    .returning();

  if (!updatedRace) {
    throw new RacingSchedulerError(
      "RACE_NOT_FOUND",
      `Racing race ${race.id} disappeared during schedule sync.`,
    );
  }

  return updatedRace;
}

async function findActiveRacingHorses(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  fieldSize: number,
) {
  const horses = await tx
    .select()
    .from(racingHorses)
    .where(eq(racingHorses.isActive, true))
    .orderBy(asc(racingHorses.createdAt), asc(racingHorses.name))
    .limit(fieldSize);

  if (horses.length !== fieldSize) {
    throw new RacingSchedulerError(
      "RACE_ENTRY_NOT_FOUND",
      `Racing table requires ${fieldSize} active horses.`,
    );
  }

  return horses;
}

async function findScheduledRaceEntries(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  raceId: string,
): Promise<ScheduledRacingRaceEntry[]> {
  const rows = await tx
    .select({
      raceEntryId: racingRaceEntries.id,
      raceId: racingRaceEntries.raceId,
      horseId: racingRaceEntries.horseId,
      number: racingRaceEntries.number,
      gateNo: racingRaceEntries.gateNo,
      lane: racingRaceEntries.lane,
      horseName: racingHorses.name,
      silkColor: racingHorses.silkColor,
    })
    .from(racingRaceEntries)
    .innerJoin(racingHorses, eq(racingRaceEntries.horseId, racingHorses.id))
    .where(eq(racingRaceEntries.raceId, raceId))
    .orderBy(asc(racingRaceEntries.number));

  return rows;
}

async function nextRaceNo(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableId: string,
) {
  const result = await tx.execute(sql<RaceNoRow>`
    select coalesce(max(race_no), 0) + 1 as "raceNo"
    from racing_races
    where table_id = ${tableId}
  `);
  const [row] = getRows<RaceNoRow>(result);

  return Number(row?.raceNo ?? 1);
}

function buildSchedule(table: LockedRacingTableRow, now: Date) {
  const intervalMs = table.raceIntervalSeconds * 1000;
  const scheduledStartAt = new Date(
    (Math.floor(now.getTime() / intervalMs) + 1) * intervalMs,
  );
  const bettingOpensAt = new Date(
    scheduledStartAt.getTime() -
      (table.bettingTimeoutSeconds + table.bettingCloseBeforeStartSeconds) *
        1000,
  );
  const bettingClosesAt = new Date(
    scheduledStartAt.getTime() -
      table.bettingCloseBeforeStartSeconds * 1000,
  );

  return {
    scheduledStartAt,
    bettingOpensAt,
    bettingClosesAt,
    phase: getScheduledRacePhase(now, bettingOpensAt, bettingClosesAt),
  };
}

function getScheduledRacePhase(
  now: Date,
  bettingOpensAt: Date,
  bettingClosesAt: Date,
): ScheduledRacingPhase {
  if (now < bettingOpensAt) {
    return "WAITING";
  }

  if (now < bettingClosesAt) {
    return "BETTING";
  }

  return "LOCKING_BETS";
}

function buildRuntimeSnapshot(
  table: LockedRacingTableRow,
  schedule: ReturnType<typeof buildSchedule>,
): JsonObject {
  return {
    scheduler: "fixed-slot-v1",
    raceIntervalSeconds: table.raceIntervalSeconds,
    bettingTimeoutSeconds: table.bettingTimeoutSeconds,
    bettingCloseBeforeStartSeconds: table.bettingCloseBeforeStartSeconds,
    raceAndResultSeconds:
      table.raceIntervalSeconds -
      table.bettingTimeoutSeconds -
      table.bettingCloseBeforeStartSeconds,
    scheduledStartAt: schedule.scheduledStartAt.toISOString(),
    bettingOpensAt: schedule.bettingOpensAt.toISOString(),
    bettingClosesAt: schedule.bettingClosesAt.toISOString(),
  };
}

function normalizeEnsureScheduledRaceInput(
  input: EnsureScheduledRacingRaceInput,
): Required<EnsureScheduledRacingRaceInput> {
  const tableCode = input.tableCode.trim();

  if (!tableCode) {
    throw new RacingSchedulerError(
      "TABLE_NOT_FOUND",
      "tableCode is required.",
    );
  }

  return {
    tableCode,
    now: input.now ?? new Date(),
  };
}

function isTerminalRacePhase(phase: string) {
  return (
    phase === "RUNNING" ||
    phase === "FINISHING" ||
    phase === "SETTLING" ||
    phase === "SETTLED" ||
    phase === "ROUND_END" ||
    phase === "CANCELLED"
  );
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

type ScheduledRacingPhase = "WAITING" | "BETTING" | "LOCKING_BETS";

export type RacingSchedulerErrorCode =
  | "TABLE_NOT_FOUND"
  | "RACE_NOT_FOUND"
  | "RACE_ENTRY_NOT_FOUND";

export class RacingSchedulerError extends Error {
  readonly code: RacingSchedulerErrorCode;

  constructor(code: RacingSchedulerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RacingSchedulerError";
  }
}
