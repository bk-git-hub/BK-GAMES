import { eq } from "drizzle-orm";

import {
  applyWalletMutation,
  authUsers,
  db,
  ensureUserGameAccount,
  pointLedgers,
  pool,
  userProfiles,
  wallets,
} from "../src/index";

const userId = `wallet-smoke-${Date.now()}`;
const email = `${userId}@example.com`;

async function cleanup() {
  await db.delete(pointLedgers).where(eq(pointLedgers.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
  await db.delete(authUsers).where(eq(authUsers.id, userId));
}

try {
  await db.insert(authUsers).values({
    id: userId,
    name: "Wallet Smoke",
    email,
    emailVerified: false,
  });

  await ensureUserGameAccount({ userId, displayName: "Wallet Smoke" });

  const rewardInput = {
    userId,
    category: "REWARD",
    type: "DAILY_REWARD",
    delta: 100n,
    referenceType: "smoke",
    referenceId: `reward:${userId}`,
    idempotencyKey: `smoke:reward:${userId}`,
  } as const;

  const reward = await applyWalletMutation(rewardInput);
  const rewardRetry = await applyWalletMutation(rewardInput);

  const debitA = applyWalletMutation({
    userId,
    category: "GAME",
    gameType: "BLACKJACK",
    type: "BET",
    delta: -80n,
    referenceType: "smoke",
    referenceId: `bet-a:${userId}`,
    idempotencyKey: `smoke:bet-a:${userId}`,
  });

  const debitB = applyWalletMutation({
    userId,
    category: "GAME",
    gameType: "BLACKJACK",
    type: "BET",
    delta: -80n,
    referenceType: "smoke",
    referenceId: `bet-b:${userId}`,
    idempotencyKey: `smoke:bet-b:${userId}`,
  });

  const debitResults = await Promise.allSettled([debitA, debitB]);

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
    rewardBalance: reward.wallet.balance.toString(),
    rewardRetryIdempotent: rewardRetry.idempotent,
    debitFulfilled: debitResults.filter(
      (result) => result.status === "fulfilled",
    ).length,
    debitRejected: debitResults.filter((result) => result.status === "rejected")
      .length,
    debitRejectCodes: debitResults
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.code ?? result.reason?.name),
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
  };

  if (
    summary.rewardBalance !== "100" ||
    !summary.rewardRetryIdempotent ||
    summary.debitFulfilled !== 1 ||
    summary.debitRejected !== 1 ||
    summary.debitRejectCodes[0] !== "INSUFFICIENT_BALANCE" ||
    summary.finalBalance !== "20" ||
    summary.ledgerCount !== 2
  ) {
    throw new Error(
      `Unexpected wallet smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
