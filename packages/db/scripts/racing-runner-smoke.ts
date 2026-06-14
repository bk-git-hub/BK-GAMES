import { eq } from "drizzle-orm";

import {
  advanceRacingRaceLifecycle,
  applyWalletMutation,
  authUsers,
  db,
  ensureUserGameAccount,
  placeRacingBet,
  pointLedgers,
  pool,
  racingActions,
  racingBets,
  racingBetSelections,
  racingHorses,
  racingRaceEntries,
  racingRaces,
  racingTables,
  racingTicks,
  userProfiles,
  wallets,
} from "../src/index";

const runId = Date.now();
const userId = `racing-runner-smoke-${runId}`;
const tableCode = `racing-runner-smoke-${runId}`;
const email = `${userId}@example.com`;
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

  await db.delete(pointLedgers).where(eq(pointLedgers.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
  await db.delete(authUsers).where(eq(authUsers.id, userId));
}

try {
  await cleanup();
  await db.insert(authUsers).values({
    id: userId,
    name: "Racing Runner Smoke",
    email,
  });
  await ensureUserGameAccount({ userId, displayName: "Racing Runner Smoke" });
  await applyWalletMutation({
    userId,
    category: "REWARD",
    type: "DAILY_REWARD",
    delta: 10_000n,
    referenceType: "racing_runner_smoke",
    referenceId: userId,
    idempotencyKey: `racing:runner-smoke:fund:${userId}`,
  });

  const [table] = await db
    .insert(racingTables)
    .values({
      code: tableCode,
      name: "Racing Runner Smoke Table",
      fieldSize: 6,
      minBet: 100n,
      maxBet: 6_000n,
      payoutRateBps: 9_000,
      bettingTimeoutSeconds: 3,
      raceIntervalSeconds: 10,
      bettingCloseBeforeStartSeconds: 1,
      roundEndDelaySeconds: 2,
    })
    .returning();

  if (!table) {
    throw new Error("Failed to create racing runner smoke table.");
  }

  const horses = await db
    .insert(racingHorses)
    .values(
      Array.from({ length: 6 }, (_, index) => ({
        name: `Racing Runner Smoke ${runId} Horse ${index + 1}`,
        silkColor: `#${(index + 3).toString().repeat(6).slice(0, 6)}`,
      })),
    )
    .returning();

  if (horses.length !== 6) {
    throw new Error("Failed to create racing runner smoke horses.");
  }

  createdHorseIds = horses.map((horse) => horse.id);

  const now = new Date();
  const futureStart = new Date(now.getTime() + 10_000);
  const [race] = await db
    .insert(racingRaces)
    .values({
      tableId: table.id,
      raceNo: 1,
      status: "BETTING",
      phase: "BETTING",
      distanceM: 1200,
      fieldSize: horses.length,
      scheduledStartAt: futureStart,
      bettingOpensAt: new Date(now.getTime() - 1_000),
      bettingClosesAt: new Date(futureStart.getTime() - 1_000),
    })
    .returning();

  if (!race) {
    throw new Error("Failed to create racing runner smoke race.");
  }

  const entries = await db
    .insert(racingRaceEntries)
    .values(
      horses.map((horse, index) => ({
        raceId: race.id,
        horseId: horse.id,
        number: index + 1,
        gateNo: index + 1,
        lane: index + 1,
      })),
    )
    .returning();

  if (entries.length !== 6) {
    throw new Error("Failed to create racing runner smoke entries.");
  }

  await placeRacingBet({
    raceId: race.id,
    userId,
    amount: 100n,
    commandId: `runner-smoke-win-${runId}`,
    betType: "WIN",
    selections: [entries[0]!.id],
  });

  const dueStartAt = new Date(now.getTime() - 7_000);

  await db
    .update(racingRaces)
    .set({
      status: "LOCKING_BETS",
      phase: "LOCKING_BETS",
      scheduledStartAt: dueStartAt,
      bettingClosesAt: new Date(dueStartAt.getTime() - 1_000),
      updatedAt: now,
    })
    .where(eq(racingRaces.id, race.id));

  const started = await advanceRacingRaceLifecycle({
    tableCode,
    now,
  });
  const settled = await advanceRacingRaceLifecycle({
    tableCode,
    now,
  });
  const roundEnded = await advanceRacingRaceLifecycle({
    tableCode,
    now,
  });
  const [finishedRace] = await db
    .select()
    .from(racingRaces)
    .where(eq(racingRaces.id, race.id))
    .limit(1);

  const summary = {
    tableCode,
    startedPhase: started.started?.phase,
    settledRaceId: settled.settled?.raceId,
    settledBetCount: settled.settled?.bets.length ?? 0,
    resultOrderCount: settled.settled?.resultOrder.length ?? 0,
    roundEndedPhase: roundEnded.roundEnded?.phase,
    finalRacePhase: finishedRace?.phase,
  };

  if (
    summary.startedPhase !== "RUNNING" ||
    summary.settledRaceId !== race.id ||
    summary.settledBetCount !== 1 ||
    summary.resultOrderCount !== 6 ||
    summary.roundEndedPhase !== "ROUND_END" ||
    summary.finalRacePhase !== "ROUND_END"
  ) {
    throw new Error(
      `Unexpected racing runner smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
