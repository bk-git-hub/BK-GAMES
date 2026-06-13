import { eq } from "drizzle-orm";

import {
  applyWalletMutation,
  authUsers,
  cancelRacingRace,
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
  settleRacingRace,
  type SettleRacingBetResult,
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
    await db
      .delete(racingBetSelections)
      .where(eq(racingBetSelections.raceId, raceId));
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
  const bettingOpensAt = new Date();
  const scheduledStartAt = new Date(Date.now() + 180_000);
  const bettingClosesAt = new Date(scheduledStartAt.getTime() - 30_000);
  const [race] = await db
    .insert(racingRaces)
    .values({
      tableId,
      raceNo,
      status: "BETTING",
      phase: "BETTING",
      distanceM: 1200,
      fieldSize: horses.length,
      scheduledStartAt,
      bettingOpensAt,
      bettingClosesAt,
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

function findSettledBet(
  bets: SettleRacingBetResult[],
  betId: string,
): SettleRacingBetResult {
  const bet = bets.find((candidate) => candidate.betId === betId);

  if (!bet) {
    throw new Error(`Missing settled bet ${betId}.`);
  }

  return bet;
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
      minBet: BigInt(100),
      maxBet: BigInt(6000),
      payoutRateBps: 9_000,
      bettingTimeoutSeconds: 150,
      raceIntervalSeconds: 180,
      bettingCloseBeforeStartSeconds: 30,
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
    delta: BigInt(10_000),
    referenceType: "RACING_WALLET_SMOKE",
    referenceId: `grant:${userId}`,
    idempotencyKey: `racing-wallet-smoke:grant:${userId}`,
  });

  const firstRace = await createRace(table.id, horses, 1);
  const [entryOne, entryTwo] = firstRace.entries;

  if (!entryOne || !entryTwo) {
    throw new Error("Racing smoke requires at least two entries.");
  }

  const winBetInput = {
    raceId: firstRace.race.id,
    userId,
    amount: BigInt(1_000),
    commandId: "command-win",
    betType: "WIN" as const,
    selections: [entryOne.id],
  };
  const winBet = await placeRacingBet(winBetInput);
  const winBetRetry = await placeRacingBet(winBetInput);

  let idempotencyConflictCode: string | null = null;

  try {
    await placeRacingBet({
      ...winBetInput,
      amount: BigInt(1_100),
    });
  } catch (error) {
    idempotencyConflictCode = getErrorCode(error);
  }

  const quinellaBetInput = {
    raceId: firstRace.race.id,
    userId,
    amount: BigInt(100),
    commandId: "command-quinella",
    betType: "QUINELLA" as const,
    selections: [entryTwo.id, entryOne.id],
  };
  const quinellaBet = await placeRacingBet(quinellaBetInput);
  const quinellaBetRetry = await placeRacingBet({
    ...quinellaBetInput,
    selections: [entryOne.id, entryTwo.id],
  });
  const exactaBet = await placeRacingBet({
    raceId: firstRace.race.id,
    userId,
    amount: BigInt(100),
    commandId: "command-exacta",
    betType: "EXACTA",
    selections: [entryOne.id, entryTwo.id],
  });
  const losingExactaBet = await placeRacingBet({
    raceId: firstRace.race.id,
    userId,
    amount: BigInt(100),
    commandId: "command-exacta-lose",
    betType: "EXACTA",
    selections: [entryTwo.id, entryOne.id],
  });

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
  const settledWinBet = findSettledBet(settlement.bets, winBet.bet.id);
  const settledQuinellaBet = findSettledBet(
    settlement.bets,
    quinellaBet.bet.id,
  );
  const settledExactaBet = findSettledBet(settlement.bets, exactaBet.bet.id);
  const settledLosingExactaBet = findSettledBet(
    settlement.bets,
    losingExactaBet.bet.id,
  );
  const retriedWinBet = findSettledBet(settlementRetry.bets, winBet.bet.id);

  const secondRace = await createRace(table.id, horses, 2);
  const cancelBet = await placeRacingBet({
    raceId: secondRace.race.id,
    userId,
    amount: BigInt(500),
    commandId: "command-cancel-quinella",
    betType: "QUINELLA",
    selections: [secondRace.entries[0]!.id, secondRace.entries[1]!.id],
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
    winBetBalance: winBet.walletMutation.wallet.balance.toString(),
    winBetRetryIdempotent: winBetRetry.walletMutation.idempotent,
    sameWinBet: winBet.bet.id === winBetRetry.bet.id,
    idempotencyConflictCode,
    quinellaRetryIdempotent: quinellaBetRetry.walletMutation.idempotent,
    sameQuinellaBet: quinellaBet.bet.id === quinellaBetRetry.bet.id,
    winOddsNumerator: winBet.bet.oddsNumerator,
    quinellaOddsNumerator: quinellaBet.bet.oddsNumerator,
    exactaOddsNumerator: exactaBet.bet.oddsNumerator,
    lockedOddsDenominator: winBet.bet.oddsDenominator,
    winPayout: settledWinBet.payoutAmount.toString(),
    winNet: settledWinBet.netAmount.toString(),
    quinellaPayout: settledQuinellaBet.payoutAmount.toString(),
    quinellaNet: settledQuinellaBet.netAmount.toString(),
    exactaPayout: settledExactaBet.payoutAmount.toString(),
    exactaNet: settledExactaBet.netAmount.toString(),
    losingExactaOutcome: settledLosingExactaBet.outcome,
    losingExactaPayout: settledLosingExactaBet.payoutAmount.toString(),
    settlementRetryIdempotent: retriedWinBet.walletMutation?.idempotent,
    cancelBetBalance: cancelBet.walletMutation.wallet.balance.toString(),
    cancellationRefund: cancellation.bets[0]?.refundAmount.toString(),
    cancellationRetryIdempotent:
      cancellationRetry.bets[0]?.walletMutation.idempotent,
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
  };

  if (
    summary.winBetBalance !== "9000" ||
    !summary.winBetRetryIdempotent ||
    !summary.sameWinBet ||
    summary.idempotencyConflictCode !== "IDEMPOTENCY_CONFLICT" ||
    !summary.quinellaRetryIdempotent ||
    !summary.sameQuinellaBet ||
    summary.winOddsNumerator !== 54_000 ||
    summary.quinellaOddsNumerator !== 135_000 ||
    summary.exactaOddsNumerator !== 270_000 ||
    summary.lockedOddsDenominator !== 10_000 ||
    summary.winPayout !== "5400" ||
    summary.winNet !== "4400" ||
    summary.quinellaPayout !== "1350" ||
    summary.quinellaNet !== "1250" ||
    summary.exactaPayout !== "2700" ||
    summary.exactaNet !== "2600" ||
    summary.losingExactaOutcome !== "LOSE" ||
    summary.losingExactaPayout !== "0" ||
    !summary.settlementRetryIdempotent ||
    summary.cancelBetBalance !== "17650" ||
    summary.cancellationRefund !== "500" ||
    !summary.cancellationRetryIdempotent ||
    summary.finalBalance !== "18150" ||
    summary.ledgerCount !== 10
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
