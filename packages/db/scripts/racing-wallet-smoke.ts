import { eq } from "drizzle-orm";

import {
  applyWalletMutation,
  authUsers,
  cancelRacingRace,
  db,
  ensureUserGameAccount,
  placeRacingWinBet,
  pointLedgers,
  pool,
  racingActions,
  racingBets,
  racingHorses,
  racingRaceEntries,
  racingRaces,
  racingTables,
  racingTicks,
  settleRacingRace,
  type SettleRacingRaceInput,
  userProfiles,
  wallets,
} from "../src/index";

const runId = Date.now();
const userId = `racing-wallet-smoke-${runId}`;
const tableCode = `racing-wallet-smoke-${runId}`;
const email = `${userId}@example.com`;
let createdHorseIds: string[] = [];

async function cleanup() {
  const races = await db
    .select({ id: racingRaces.id })
    .from(racingRaces)
    .innerJoin(racingTables, eq(racingRaces.tableId, racingTables.id))
    .where(eq(racingTables.code, tableCode));
  const raceIds = races.map((race) => race.id);

  for (const raceId of raceIds) {
    const entries = await db
      .select({ horseId: racingRaceEntries.horseId })
      .from(racingRaceEntries)
      .where(eq(racingRaceEntries.raceId, raceId));

    createdHorseIds = [
      ...new Set([
        ...createdHorseIds,
        ...entries.map((entry) => entry.horseId),
      ]),
    ];

    await db.delete(racingActions).where(eq(racingActions.raceId, raceId));
    await db.delete(racingBets).where(eq(racingBets.raceId, raceId));
    await db.delete(racingTicks).where(eq(racingTicks.raceId, raceId));
    await db
      .delete(racingRaceEntries)
      .where(eq(racingRaceEntries.raceId, raceId));
    await db.delete(racingRaces).where(eq(racingRaces.id, raceId));
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

async function createRace(
  tableId: string,
  horses: Array<typeof racingHorses.$inferSelect>,
  raceNo: number,
) {
  const [race] = await db
    .insert(racingRaces)
    .values({
      tableId,
      raceNo,
      status: "BETTING",
      phase: "BETTING",
      distanceM: 1200,
      fieldSize: horses.length,
      bettingOpensAt: new Date(),
      bettingClosesAt: new Date(Date.now() + 20_000),
    })
    .returning();

  if (!race) {
    throw new Error("Failed to create racing smoke race.");
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

  if (entries.length !== horses.length) {
    throw new Error("Failed to create racing smoke entries.");
  }

  return {
    race,
    entries,
  };
}

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
}

try {
  await cleanup();

  await db.insert(authUsers).values({
    id: userId,
    name: "Racing Wallet Smoke",
    email,
    emailVerified: false,
  });
  await ensureUserGameAccount({
    userId,
    displayName: "Racing Wallet Smoke",
  });

  const [table] = await db
    .insert(racingTables)
    .values({
      code: tableCode,
      name: "Racing Wallet Smoke Table",
      fieldSize: 6,
      minBet: 100n,
      maxBet: 6_000n,
      payoutRateBps: 9_000,
    })
    .returning();

  if (!table) {
    throw new Error("Failed to create racing smoke table.");
  }

  const horses = await db
    .insert(racingHorses)
    .values(
      Array.from({ length: 6 }, (_, index) => ({
        name: `Racing Smoke ${runId} Horse ${index + 1}`,
        silkColor: `#${(index + 1).toString().repeat(6).slice(0, 6)}`,
      })),
    )
    .returning();

  if (horses.length !== 6) {
    throw new Error("Failed to create racing smoke horses.");
  }

  createdHorseIds = horses.map((horse) => horse.id);

  await applyWalletMutation({
    userId,
    category: "ADMIN",
    type: "ADMIN_ADJUST",
    delta: 10_000n,
    referenceType: "RACING_WALLET_SMOKE",
    referenceId: `grant:${userId}`,
    idempotencyKey: `racing-wallet-smoke:grant:${userId}`,
  });

  const firstRace = await createRace(table.id, horses, 1);
  const firstBetInput = {
    raceId: firstRace.race.id,
    raceEntryId: firstRace.entries[0]!.id,
    userId,
    amount: 1_000n,
    commandId: "command-1",
  };
  const firstBet = await placeRacingWinBet(firstBetInput);
  const firstBetRetry = await placeRacingWinBet(firstBetInput);

  let idempotencyConflictCode: string | null = null;

  try {
    await placeRacingWinBet({
      ...firstBetInput,
      amount: 1_100n,
    });
  } catch (error) {
    idempotencyConflictCode = getErrorCode(error);
  }

  let alreadyPlacedCode: string | null = null;

  try {
    await placeRacingWinBet({
      ...firstBetInput,
      commandId: "command-2",
    });
  } catch (error) {
    alreadyPlacedCode = getErrorCode(error);
  }

  await db
    .update(racingRaces)
    .set({
      status: "RUNNING",
      phase: "RUNNING",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(racingRaces.id, firstRace.race.id));

  const settlementInput = {
    raceId: firstRace.race.id,
    entries: firstRace.entries.map((entry, index) => ({
      raceEntryId: entry.id,
      finalRank: index + 1,
      finishedAtMs: 65_000 + index * 250,
    })),
  } satisfies SettleRacingRaceInput;

  const settlement = await settleRacingRace(settlementInput);
  const settlementRetry = await settleRacingRace(settlementInput);

  const secondRace = await createRace(table.id, horses, 2);
  const secondBet = await placeRacingWinBet({
    raceId: secondRace.race.id,
    raceEntryId: secondRace.entries[1]!.id,
    userId,
    amount: 500n,
    commandId: "command-3",
  });
  const cancellation = await cancelRacingRace({
    raceId: secondRace.race.id,
    reason: "RACING_WALLET_SMOKE_CANCEL",
  });
  const cancellationRetry = await cancelRacingRace({
    raceId: secondRace.race.id,
    reason: "RACING_WALLET_SMOKE_CANCEL",
  });

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  const ledgers = await db
    .select()
    .from(pointLedgers)
    .where(eq(pointLedgers.userId, userId));

  const summary = {
    userId,
    tableCode,
    firstBetBalance: firstBet.walletMutation.wallet.balance.toString(),
    firstBetRetryIdempotent: firstBetRetry.walletMutation.idempotent,
    sameBet: firstBet.bet.id === firstBetRetry.bet.id,
    idempotencyConflictCode,
    alreadyPlacedCode,
    lockedOddsNumerator: firstBet.bet.oddsNumerator,
    lockedOddsDenominator: firstBet.bet.oddsDenominator,
    settlementPayout: settlement.bets[0]?.payoutAmount.toString(),
    settlementNet: settlement.bets[0]?.netAmount.toString(),
    settlementRetryIdempotent:
      settlementRetry.bets[0]?.walletMutation?.idempotent,
    secondBetBalance: secondBet.walletMutation.wallet.balance.toString(),
    cancellationRefund: cancellation.bets[0]?.refundAmount.toString(),
    cancellationRetryIdempotent:
      cancellationRetry.bets[0]?.walletMutation.idempotent,
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
  };

  if (
    summary.firstBetBalance !== "9000" ||
    !summary.firstBetRetryIdempotent ||
    !summary.sameBet ||
    summary.idempotencyConflictCode !== "IDEMPOTENCY_CONFLICT" ||
    summary.alreadyPlacedCode !== "BET_ALREADY_PLACED" ||
    summary.lockedOddsNumerator !== 54_000 ||
    summary.lockedOddsDenominator !== 10_000 ||
    summary.settlementPayout !== "5400" ||
    summary.settlementNet !== "4400" ||
    !summary.settlementRetryIdempotent ||
    summary.secondBetBalance !== "13900" ||
    summary.cancellationRefund !== "500" ||
    !summary.cancellationRetryIdempotent ||
    summary.finalBalance !== "14400" ||
    summary.ledgerCount !== 5
  ) {
    throw new Error(
      `Unexpected racing wallet smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
