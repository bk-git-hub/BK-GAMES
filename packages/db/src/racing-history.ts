import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  racingHorses,
  racingRaceEntries,
  racingRaces,
  racingTables,
} from "./schema.js";

const defaultRaceHistoryLimit = 50;
const maxRaceHistoryLimit = 100;

export type ListRacingRaceResultsInput = {
  tableCode: string;
  from: Date;
  to: Date;
  limit?: number;
};

export type RacingHistoryRaceResult = {
  race: {
    id: string;
    raceNo: number;
    status: string;
    phase: string;
    scheduledStartAt: Date | null;
    bettingOpensAt: Date | null;
    bettingClosesAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    settledAt: Date | null;
    resultOrder: string[];
  };
  entries: RacingHistoryRaceEntryResult[];
};

export type RacingHistoryRaceEntryResult = {
  raceEntryId: string;
  horseId: string;
  name: string;
  silkColor: string;
  number: number;
  gateNo: number;
  lane: number;
  finalRank: number;
  finishedAtMs: number;
};

export async function listRacingRaceResultsForDate(
  input: ListRacingRaceResultsInput,
): Promise<RacingHistoryRaceResult[]> {
  const limit = normalizeHistoryLimit(input.limit);
  const raceDate = sql<Date>`coalesce(
    ${racingRaces.scheduledStartAt},
    ${racingRaces.startedAt},
    ${racingRaces.settledAt}
  )`;

  const races = await db
    .select({
      id: racingRaces.id,
      raceNo: racingRaces.raceNo,
      status: racingRaces.status,
      phase: racingRaces.phase,
      scheduledStartAt: racingRaces.scheduledStartAt,
      bettingOpensAt: racingRaces.bettingOpensAt,
      bettingClosesAt: racingRaces.bettingClosesAt,
      startedAt: racingRaces.startedAt,
      finishedAt: racingRaces.finishedAt,
      settledAt: racingRaces.settledAt,
      resultOrder: racingRaces.resultOrder,
    })
    .from(racingRaces)
    .innerJoin(racingTables, eq(racingRaces.tableId, racingTables.id))
    .where(
      and(
        eq(racingTables.code, input.tableCode),
        sql`${racingRaces.settledAt} is not null`,
        sql`${racingRaces.cancelledAt} is null`,
        sql`${raceDate} >= ${input.from}`,
        sql`${raceDate} < ${input.to}`,
      ),
    )
    .orderBy(sql`${racingRaces.raceNo} desc`)
    .limit(limit);

  const raceIds = races.map((race) => race.id);

  if (raceIds.length === 0) {
    return [];
  }

  const entryRows = await db
    .select({
      raceId: racingRaceEntries.raceId,
      raceEntryId: racingRaceEntries.id,
      horseId: racingRaceEntries.horseId,
      name: racingHorses.name,
      silkColor: racingHorses.silkColor,
      number: racingRaceEntries.number,
      gateNo: racingRaceEntries.gateNo,
      lane: racingRaceEntries.lane,
      finalRank: racingRaceEntries.finalRank,
      finishedAtMs: racingRaceEntries.finishedAtMs,
    })
    .from(racingRaceEntries)
    .innerJoin(racingHorses, eq(racingRaceEntries.horseId, racingHorses.id))
    .where(
      and(
        inArray(racingRaceEntries.raceId, raceIds),
        sql`${racingRaceEntries.finalRank} is not null`,
        sql`${racingRaceEntries.finishedAtMs} is not null`,
      ),
    )
    .orderBy(
      sql`${racingRaceEntries.raceId} asc, ${racingRaceEntries.finalRank} asc`,
    );

  const entriesByRaceId = new Map<string, RacingHistoryRaceEntryResult[]>();

  for (const row of entryRows) {
    if (row.finalRank === null || row.finishedAtMs === null) {
      continue;
    }

    const entries = entriesByRaceId.get(row.raceId) ?? [];
    entries.push({
      raceEntryId: row.raceEntryId,
      horseId: row.horseId,
      name: row.name,
      silkColor: row.silkColor,
      number: row.number,
      gateNo: row.gateNo,
      lane: row.lane,
      finalRank: row.finalRank,
      finishedAtMs: row.finishedAtMs,
    });
    entriesByRaceId.set(row.raceId, entries);
  }

  return races.map((race) => ({
    race: {
      id: race.id,
      raceNo: race.raceNo,
      status: race.status,
      phase: race.phase,
      scheduledStartAt: race.scheduledStartAt,
      bettingOpensAt: race.bettingOpensAt,
      bettingClosesAt: race.bettingClosesAt,
      startedAt: race.startedAt,
      finishedAt: race.finishedAt,
      settledAt: race.settledAt,
      resultOrder: Array.isArray(race.resultOrder) ? race.resultOrder : [],
    },
    entries: entriesByRaceId.get(race.id) ?? [],
  }));
}

function normalizeHistoryLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return defaultRaceHistoryLimit;
  }

  return Math.min(maxRaceHistoryLimit, Math.max(1, Math.trunc(limit)));
}
