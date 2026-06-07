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
  settleBlackjackRound,
  type SettleBlackjackRoundInput,
  userProfiles,
  wallets,
} from "../src/index";

const userId = `blackjack-settlement-smoke-${Date.now()}`;
const tableCode = `blackjack-settlement-smoke-${Date.now()}`;
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
    name: "Blackjack Settlement Smoke",
    email,
    emailVerified: false,
  });
  await ensureUserGameAccount({
    userId,
    displayName: "Blackjack Settlement Smoke",
  });
  await db.insert(blackjackTables).values({
    code: tableCode,
    name: "Blackjack Settlement Smoke Table",
    minInitialBet: 100n,
    maxInitialBet: 6_000n,
    maxTotalBetPerSeat: 24_000n,
    maxTotalBetPerUser: 42_000n,
    maxSeats: 7,
    maxSeatsPerUser: 7,
  });
  await applyWalletMutation({
    userId,
    category: "ADMIN",
    type: "ADMIN_ADJUST",
    delta: 10_000n,
    referenceType: "BLACKJACK_SETTLEMENT_SMOKE",
    referenceId: `grant:${userId}`,
    idempotencyKey: `blackjack-settlement-smoke:grant:${userId}`,
  });

  const firstBet = await placeBlackjackInitialBet({
    tableCode,
    seatNo: 1,
    userId,
    amount: 500n,
    commandId: "command-1",
  });
  const secondBet = await placeBlackjackInitialBet({
    tableCode,
    seatNo: 2,
    userId,
    amount: 500n,
    commandId: "command-2",
  });
  const thirdBet = await placeBlackjackInitialBet({
    tableCode,
    seatNo: 3,
    userId,
    amount: 500n,
    commandId: "command-3",
  });

  const settlementInput = {
    roundId: firstBet.round.id,
    dealer: {
      cards: [
        { rank: "K", suit: "clubs" },
        { rank: "Q", suit: "clubs" },
      ],
      finalValue: 20,
      hasBlackjack: false,
      busted: false,
    },
    seats: [
      {
        roundSeatId: firstBet.roundSeat.id,
        userId,
        seatNo: 1,
        cards: [
          { rank: "10", suit: "hearts" },
          { rank: "9", suit: "spades" },
          { rank: "2", suit: "diamonds" },
        ],
        finalValue: 21,
        isSoft: false,
        isNaturalBlackjack: false,
        busted: false,
        outcome: "WIN",
        outcomeReason: "STANDARD",
      },
      {
        roundSeatId: secondBet.roundSeat.id,
        userId,
        seatNo: 2,
        cards: [
          { rank: "10", suit: "diamonds" },
          { rank: "Q", suit: "hearts" },
        ],
        finalValue: 20,
        isSoft: false,
        isNaturalBlackjack: false,
        busted: false,
        outcome: "PUSH",
        outcomeReason: "STANDARD",
      },
      {
        roundSeatId: thirdBet.roundSeat.id,
        userId,
        seatNo: 3,
        cards: [
          { rank: "8", suit: "clubs" },
          { rank: "7", suit: "spades" },
        ],
        finalValue: 15,
        isSoft: false,
        isNaturalBlackjack: false,
        busted: false,
        outcome: "LOSE",
        outcomeReason: "SURRENDER",
      },
    ],
  } satisfies SettleBlackjackRoundInput;

  const settlement = await settleBlackjackRound(settlementInput);
  const retry = await settleBlackjackRound(settlementInput);
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  const ledgers = await db
    .select()
    .from(pointLedgers)
    .where(eq(pointLedgers.userId, userId));
  const surrenderLedger = ledgers.find(
    (ledger) => ledger.type === "SURRENDER_REFUND",
  );

  const summary = {
    userId,
    tableCode,
    firstSeatPayout: settlement.seats[0]?.payoutAmount.toString(),
    secondSeatPayout: settlement.seats[1]?.payoutAmount.toString(),
    thirdSeatPayout: settlement.seats[2]?.payoutAmount.toString(),
    retryFirstIdempotent: retry.seats[0]?.walletMutation?.idempotent,
    retrySecondIdempotent: retry.seats[1]?.walletMutation?.idempotent,
    retryThirdIdempotent: retry.seats[2]?.walletMutation?.idempotent,
    surrenderLedgerDelta: surrenderLedger?.delta.toString(),
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
  };

  if (
    summary.firstSeatPayout !== "1000" ||
    summary.secondSeatPayout !== "500" ||
    summary.thirdSeatPayout !== "250" ||
    !summary.retryFirstIdempotent ||
    !summary.retrySecondIdempotent ||
    !summary.retryThirdIdempotent ||
    summary.surrenderLedgerDelta !== "250" ||
    summary.finalBalance !== "10250" ||
    summary.ledgerCount !== 7
  ) {
    throw new Error(
      `Unexpected blackjack settlement smoke result: ${JSON.stringify(
        summary,
      )}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
