import { eq } from "drizzle-orm";

import {
  applyWalletMutation,
  authUsers,
  blackjackActions,
  blackjackHands,
  blackjackRoundSeats,
  blackjackRounds,
  blackjackShoes,
  blackjackTables,
  db,
  ensureUserGameAccount,
  placeBlackjackInitialBet,
  pointLedgers,
  pool,
  userProfiles,
  wallets,
} from "../src/index";

const userId = `blackjack-bet-smoke-${Date.now()}`;
const tableCode = `blackjack-bet-smoke-${Date.now()}`;
const email = `${userId}@example.com`;

async function cleanup() {
  const rounds = await db
    .select({ id: blackjackRounds.id })
    .from(blackjackRounds)
    .innerJoin(blackjackTables, eq(blackjackRounds.tableId, blackjackTables.id))
    .where(eq(blackjackTables.code, tableCode));
  const roundIds = rounds.map((round) => round.id);

  for (const roundId of roundIds) {
    await db
      .delete(blackjackActions)
      .where(eq(blackjackActions.roundId, roundId));
    await db.delete(blackjackHands).where(eq(blackjackHands.roundId, roundId));
    await db
      .delete(blackjackRoundSeats)
      .where(eq(blackjackRoundSeats.roundId, roundId));
    await db.delete(blackjackRounds).where(eq(blackjackRounds.id, roundId));
  }

  await db
    .delete(blackjackShoes)
    .where(
      eq(
        blackjackShoes.tableId,
        db
          .select({ id: blackjackTables.id })
          .from(blackjackTables)
          .where(eq(blackjackTables.code, tableCode)),
      ),
    );
  await db.delete(blackjackTables).where(eq(blackjackTables.code, tableCode));
  await db.delete(pointLedgers).where(eq(pointLedgers.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
  await db.delete(authUsers).where(eq(authUsers.id, userId));
}

try {
  await cleanup();
  await db.insert(authUsers).values({
    id: userId,
    name: "Blackjack Bet Smoke",
    email,
    emailVerified: false,
  });
  await ensureUserGameAccount({
    userId,
    displayName: "Blackjack Bet Smoke",
  });
  const [table] = await db
    .insert(blackjackTables)
    .values({
      code: tableCode,
      name: "Blackjack Bet Smoke Table",
      minInitialBet: 100n,
      maxInitialBet: 6_000n,
      maxTotalBetPerSeat: 24_000n,
      maxTotalBetPerUser: 42_000n,
      maxSeats: 7,
      maxSeatsPerUser: 7,
    })
    .returning();

  if (!table) {
    throw new Error("Failed to create blackjack betting smoke table.");
  }

  await applyWalletMutation({
    userId,
    category: "ADMIN",
    type: "ADMIN_ADJUST",
    delta: 200n,
    referenceType: "BLACKJACK_BET_SMOKE",
    referenceId: `grant:${userId}`,
    idempotencyKey: `blackjack-bet-smoke:grant:${userId}`,
  });

  const staleCreatedAt = new Date(Date.now() - 5 * 60 * 1000);
  const [shoe] = await db
    .insert(blackjackShoes)
    .values({
      tableId: table.id,
      deckCount: 6,
      cardsTotal: 312,
      cutCardPosition: 234,
      serverSeedHash: `blackjack-bet-smoke:${userId}`,
    })
    .returning();

  if (!shoe) {
    throw new Error("Failed to create blackjack betting smoke shoe.");
  }

  const [staleRound] = await db
    .insert(blackjackRounds)
    .values({
      tableId: table.id,
      shoeId: shoe.id,
      roundNo: 1,
      ruleSnapshot: {
        deckCount: 6,
        dealerHitsSoft17: false,
        blackjackPayout: {
          numerator: 3,
          denominator: 2,
        },
        insuranceAllowed: true,
        evenMoneyAllowed: true,
        surrenderMode: "LATE",
        doubleAllowed: true,
        doubleAfterSplitAllowed: true,
        splitAllowed: true,
        allowTenValueSplit: true,
        maxSplitHands: 4,
        resplitAcesAllowed: false,
        hitSplitAcesAllowed: false,
        dealerPeekEnabled: true,
        cardCountingMode: "INTERNAL_ANALYTICS",
      },
      bettingOpensAt: staleCreatedAt,
      bettingClosesAt: new Date(staleCreatedAt.getTime() + 20_000),
      createdAt: staleCreatedAt,
      updatedAt: staleCreatedAt,
    })
    .returning();

  if (!staleRound) {
    throw new Error("Failed to create stale blackjack betting smoke round.");
  }

  const [staleRoundSeat] = await db
    .insert(blackjackRoundSeats)
    .values({
      roundId: staleRound.id,
      tableId: table.id,
      seatNo: 1,
      userId,
      initialBetAmount: 100n,
      totalWagerAmount: 100n,
      netAmount: -100n,
    })
    .returning();

  if (!staleRoundSeat) {
    throw new Error(
      "Failed to create stale blackjack betting smoke round seat.",
    );
  }

  await db.insert(blackjackHands).values({
    roundId: staleRound.id,
    roundSeatId: staleRoundSeat.id,
    handNo: 1,
    initialBetAmount: 100n,
    finalBetAmount: 100n,
    netAmount: -100n,
  });
  await db.insert(blackjackActions).values({
    roundId: staleRound.id,
    roundSeatId: staleRoundSeat.id,
    userId,
    actorType: "PLAYER",
    actionType: "PLACE_BET",
    actionSequence: 1,
    commandId: "stale-command",
    amount: 100n,
    payload: {
      tableCode,
      seatNo: 1,
      clientCommandId: "stale-command",
    },
  });
  await applyWalletMutation({
    userId,
    category: "GAME",
    gameType: "BLACKJACK",
    type: "BET",
    delta: -100n,
    referenceType: "BLACKJACK_ROUND",
    referenceId: staleRound.id,
    idempotencyKey: `blackjack-bet-smoke:stale-bet:${userId}`,
  });

  const betInput = {
    tableCode,
    seatNo: 1,
    userId,
    amount: 100n,
    commandId: "command-1",
  };
  const bet = await placeBlackjackInitialBet(betInput);
  const retry = await placeBlackjackInitialBet(betInput);
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  const ledgers = await db
    .select()
    .from(pointLedgers)
    .where(eq(pointLedgers.userId, userId));
  const [staleRoundAfterBet] = await db
    .select()
    .from(blackjackRounds)
    .where(eq(blackjackRounds.id, staleRound.id))
    .limit(1);
  const [staleSeatAfterBet] = await db
    .select()
    .from(blackjackRoundSeats)
    .where(eq(blackjackRoundSeats.id, staleRoundSeat.id))
    .limit(1);

  const summary = {
    userId,
    tableCode,
    firstBalance: bet.walletMutation.wallet.balance.toString(),
    retryIdempotent: retry.walletMutation.idempotent,
    sameLedger: retry.walletMutation.ledger.id === bet.walletMutation.ledger.id,
    sameRoundSeat: retry.roundSeat.id === bet.roundSeat.id,
    staleRoundCancelled: staleRoundAfterBet?.status === "CANCELLED",
    staleSeatCancelled: staleSeatAfterBet?.status === "CANCELLED",
    staleRoundRefunded: ledgers.some(
      (ledger) =>
        ledger.type === "CANCEL_REFUND" &&
        ledger.referenceId === staleRound.id &&
        ledger.delta === 100n,
    ),
    newRoundCreated: bet.round.id !== staleRound.id,
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
  };

  if (
    summary.firstBalance !== "100" ||
    !summary.retryIdempotent ||
    !summary.sameLedger ||
    !summary.sameRoundSeat ||
    !summary.staleRoundCancelled ||
    !summary.staleSeatCancelled ||
    !summary.staleRoundRefunded ||
    !summary.newRoundCreated ||
    summary.finalBalance !== "100" ||
    summary.ledgerCount !== 4
  ) {
    throw new Error(
      `Unexpected blackjack betting smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
