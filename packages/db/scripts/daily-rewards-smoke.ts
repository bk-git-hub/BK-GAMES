import { eq } from "drizzle-orm";

import {
  authUsers,
  claimDailyReward,
  dailyRewardClaims,
  db,
  ensureUserGameAccount,
  pointLedgers,
  pool,
  userProfiles,
  wallets,
} from "../src/index";

const userId = `daily-reward-smoke-${Date.now()}`;
const email = `${userId}@example.com`;
const firstClaimDate = "2026-06-05";
const secondClaimDate = "2026-06-06";

async function cleanup() {
  await db.delete(dailyRewardClaims).where(eq(dailyRewardClaims.userId, userId));
  await db.delete(pointLedgers).where(eq(pointLedgers.userId, userId));
  await db.delete(wallets).where(eq(wallets.userId, userId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
  await db.delete(authUsers).where(eq(authUsers.id, userId));
}

try {
  await db.insert(authUsers).values({
    id: userId,
    name: "Daily Reward Smoke",
    email,
    emailVerified: false,
  });

  await ensureUserGameAccount({
    userId,
    displayName: "Daily Reward Smoke",
  });

  const concurrentClaims = await Promise.all([
    claimDailyReward({ userId, claimDate: firstClaimDate }),
    claimDailyReward({ userId, claimDate: firstClaimDate }),
  ]);
  const retryClaim = await claimDailyReward({
    userId,
    claimDate: firstClaimDate,
  });
  const nextDateClaim = await claimDailyReward({
    userId,
    claimDate: secondClaimDate,
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
  const claims = await db
    .select()
    .from(dailyRewardClaims)
    .where(eq(dailyRewardClaims.userId, userId));

  const firstDateClaims = claims.filter(
    (claim) => claim.claimDate === firstClaimDate,
  );
  const secondDateClaims = claims.filter(
    (claim) => claim.claimDate === secondClaimDate,
  );
  const sameDateIdempotentCount = [...concurrentClaims, retryClaim].filter(
    (claim) => claim.idempotent,
  ).length;
  const firstDateLedgerIds = new Set(
    firstDateClaims.map((claim) => claim.ledgerId),
  );

  const summary = {
    userId,
    sameDateIdempotentCount,
    retryIdempotent: retryClaim.idempotent,
    firstClaimBalance: concurrentClaims[0].wallet.balance.toString(),
    nextDateBalance: nextDateClaim.wallet.balance.toString(),
    finalBalance: wallet?.balance.toString(),
    ledgerCount: ledgers.length,
    claimCount: claims.length,
    firstDateClaimCount: firstDateClaims.length,
    secondDateClaimCount: secondDateClaims.length,
    firstDateLedgerCount: firstDateLedgerIds.size,
  };

  if (
    summary.sameDateIdempotentCount < 2 ||
    !summary.retryIdempotent ||
    summary.nextDateBalance !== "200" ||
    summary.finalBalance !== "200" ||
    summary.ledgerCount !== 2 ||
    summary.claimCount !== 2 ||
    summary.firstDateClaimCount !== 1 ||
    summary.secondDateClaimCount !== 1 ||
    summary.firstDateLedgerCount !== 1
  ) {
    throw new Error(
      `Unexpected daily reward smoke result: ${JSON.stringify(summary)}`,
    );
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await cleanup();
  await pool.end();
}
