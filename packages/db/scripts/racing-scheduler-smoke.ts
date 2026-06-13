import { eq } from "drizzle-orm";

import {
  db,
  ensureScheduledRacingRace,
  pool,
  racingActions,
  racingBets,
  racingBetSelections,
  racingHorses,
  racingRaceEntries,
  racingRaces,
  racingTables,
  racingTicks,
} from "../src/index";

const runId = Date.now();
const tableCode = `racing-scheduler-smoke-${runId}`;
let createdHorseIds: string[] = [];

async function cleanup() {
  const races = await db
    .select({ id: racingRaces.id })
    .from(racingRaces)
    .innerJoin(racingTables, eq(racingRaces.tableId, racingTables.id))
    .where(eq(racingTables.code, tableCode));

  for (const race of races) {
    await db.delete(racingActions).where(eq(racingActions.raceId, race.id));
    await db
      .delete(racingBetSelections)
      .where(eq(racingBetSelections.raceId, race.id));
    await db.delete(racingBets).where(eq(racingBets.raceId, race.id));
    await db.delete(racingTicks).where(eq(racingTicks.raceId, race.id));
    await db
      .delete(racingRaceEntries)
      .where(eq(racingRaceEntries.raceId, race.id));
    await db.delete(racingRaces).where(eq(racingRaces.id, race.id));
  }

  await db.delete(racingTables).where(eq(racingTables.code, tableCode));

  for (const horseId of createdHorseIds) {
    await db.delete(racingHorses).where(eq(racingHorses.id, horseId));
  }
}

try {
  await cleanup();

  const [table] = await db
    .insert(racingTables)
    .values({
      code: tableCode,
      name: "Racing Scheduler Smoke Table",
      fieldSize: 6,
      minBet: BigInt(100),
      maxBet: BigInt(6000),
      payoutRateBps: 9_000,
      bettingTimeoutSeconds: 150,
      raceIntervalSeconds: 240,
      bettingCloseBeforeStartSeconds: 30,
    })
    .returning();

  if (!table) {
    throw new Error("Failed to create racing scheduler smoke table.");
  }

  const horses = await db
    .insert(racingHorses)
    .values(
      Array.from({ length: 6 }, (_, index) => ({
        name: `Racing Scheduler Smoke ${runId} Horse ${index + 1}`,
        silkColor: `#${(index + 2).toString().repeat(6).slice(0, 6)}`,
      })),
    )
    .returning();

  if (horses.length !== 6) {
    throw new Error("Failed to create racing scheduler smoke horses.");
  }

  createdHorseIds = horses.map((horse) => horse.id);

  const waiting = await ensureScheduledRacingRace({
    tableCode,
    now: new Date("2026-01-01T00:00:30.000Z"),
  });
  const waitingRetry = await ensureScheduledRacingRace({
    tableCode,
    now: new Date("2026-01-01T00:00:30.000Z"),
  });
  const scheduledStartMs = waiting.race.scheduledStartAt?.getTime();
  const bettingOpensMs = waiting.race.bettingOpensAt?.getTime();
  const bettingClosesMs = waiting.race.bettingClosesAt?.getTime();

  if (!scheduledStartMs || !bettingOpensMs || !bettingClosesMs) {
    throw new Error("Scheduled race did not include all timer fields.");
  }

  const betting = await ensureScheduledRacingRace({
    tableCode,
    now: new Date(bettingOpensMs + 1000),
  });
  const locking = await ensureScheduledRacingRace({
    tableCode,
    now: new Date(bettingClosesMs + 1000),
  });
  const next = await ensureScheduledRacingRace({
    tableCode,
    now: new Date(scheduledStartMs + 1000),
  });

  const summary = {
    tableCode,
    waitingRaceId: waiting.race.id,
    waitingCreated: waiting.created,
    waitingRetrySameRace: waiting.race.id === waitingRetry.race.id,
    waitingPhase: waiting.race.phase,
    bettingPhase: betting.race.phase,
    lockingPhase: locking.race.phase,
    sameRaceAcrossPreStartPhases:
      waiting.race.id === betting.race.id && betting.race.id === locking.race.id,
    nextRaceCreated: next.created,
    nextRaceNo: next.race.raceNo,
    nextRaceIsDifferent: next.race.id !== waiting.race.id,
    entryCount: waiting.entries.length,
    intervalSeconds:
      (next.race.scheduledStartAt!.getTime() -
        waiting.race.scheduledStartAt!.getTime()) /
      1000,
    bettingWindowSeconds: (bettingClosesMs - bettingOpensMs) / 1000,
    noBetLockSeconds: (scheduledStartMs - bettingClosesMs) / 1000,
  };

  if (
    !summary.waitingCreated ||
    !summary.waitingRetrySameRace ||
    summary.waitingPhase !== "WAITING" ||
    summary.bettingPhase !== "BETTING" ||
    summary.lockingPhase !== "LOCKING_BETS" ||
    !summary.sameRaceAcrossPreStartPhases ||
    !summary.nextRaceCreated ||
    summary.nextRaceNo !== 2 ||
    !summary.nextRaceIsDifferent ||
    summary.entryCount !== 6 ||
    summary.intervalSeconds !== 240 ||
    summary.bettingWindowSeconds !== 150 ||
    summary.noBetLockSeconds !== 30
  ) {
    throw new Error(
      `Unexpected racing scheduler smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
