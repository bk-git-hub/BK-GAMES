import { eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import { racingRaces } from "./schema.js";

export type RacingClockInput = {
  tableCode: string;
  now?: Date;
};

export type RacingClockUpdate = {
  raceId: string;
  pausedAt: Date | null;
};

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

  const [race] = await tx
    .select()
    .from(racingRaces)
    .where(eq(racingRaces.id, row.id))
    .limit(1);

  return race ?? null;
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

export class RacingClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RacingClockError";
  }
}
