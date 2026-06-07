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
  await db.insert(blackjackTables).values({
    code: tableCode,
    name: "Blackjack Bet Smoke Table",
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
    delta: 100n,
    referenceType: "BLACKJACK_BET_SMOKE",
    referenceId: `grant:${userId}`,
    idempotencyKey: `blackjack-bet-smoke:grant:${userId}`,
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

  const summary = {
    userId,
    tableCode,
    firstBalance: bet.walletMutation.wallet.balance.toString(),
    retryIdempotent: retry.walletMutation.idempotent,
    sameLedger: retry.walletMutation.ledger.id === bet.walletMutation.ledger.id,
    sameRoundSeat: retry.roundSeat.id === bet.roundSeat.id,
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
  };

  if (
    summary.firstBalance !== "0" ||
    !summary.retryIdempotent ||
    !summary.sameLedger ||
    !summary.sameRoundSeat ||
    summary.finalBalance !== "0" ||
    summary.ledgerCount !== 2
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
