import { and, eq } from "drizzle-orm";

import { db } from "./client";
import { dailyRewardClaims, type JsonObject } from "./schema";
import {
  applyWalletMutationInTransaction,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions";

export const DEFAULT_DAILY_REWARD_AMOUNT = BigInt(100);
export const DEFAULT_DAILY_REWARD_TIME_ZONE = "Asia/Seoul";

export type ClaimDailyRewardInput = {
  userId: string;
  amount?: bigint;
  claimDate?: string;
  claimedAt?: Date;
  timeZone?: string;
  memo?: string | null;
  metadata?: JsonObject;
};

export type ClaimDailyRewardResult = WalletMutationResult & {
  claim: typeof dailyRewardClaims.$inferSelect;
  claimDate: string;
  amount: bigint;
};

export type DailyRewardClaimErrorCode =
  | "INVALID_DAILY_REWARD"
  | "DAILY_REWARD_CONFLICT";

export class DailyRewardClaimError extends Error {
  constructor(
    readonly code: DailyRewardClaimErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DailyRewardClaimError";
  }
}

type NormalizedDailyRewardClaim = {
  userId: string;
  amount: bigint;
  claimDate: string;
  timeZone: string;
  memo: string | null;
  metadata: JsonObject;
};

const claimDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export async function claimDailyReward(
  input: ClaimDailyRewardInput,
): Promise<ClaimDailyRewardResult> {
  const claim = normalizeDailyRewardClaimInput(input);
  const referenceId = buildDailyRewardReferenceId(claim.userId, claim.claimDate);

  return db.transaction(async (tx) => {
    const mutation = await applyWalletMutationInTransaction(tx, {
      userId: claim.userId,
      category: "REWARD",
      type: "DAILY_REWARD",
      delta: claim.amount,
      referenceType: "daily_reward",
      referenceId,
      idempotencyKey: referenceId,
      memo: claim.memo,
      metadata: {
        ...claim.metadata,
        claimDate: claim.claimDate,
        timeZone: claim.timeZone,
      },
    });

    const [dailyRewardClaim] = await tx
      .insert(dailyRewardClaims)
      .values({
        userId: claim.userId,
        claimDate: claim.claimDate,
        amount: claim.amount,
        ledgerId: mutation.ledger.id,
      })
      .onConflictDoNothing({
        target: [dailyRewardClaims.userId, dailyRewardClaims.claimDate],
      })
      .returning();

    if (dailyRewardClaim) {
      return {
        ...mutation,
        claim: dailyRewardClaim,
        claimDate: claim.claimDate,
        amount: claim.amount,
      };
    }

    const existingClaim = await findDailyRewardClaim(
      tx,
      claim.userId,
      claim.claimDate,
    );

    if (!existingClaim) {
      throw new DailyRewardClaimError(
        "DAILY_REWARD_CONFLICT",
        `Daily reward claim for ${claim.userId} on ${claim.claimDate} conflicted without returning an existing claim.`,
      );
    }

    assertDailyRewardClaimMatch(
      existingClaim,
      mutation.ledger.id,
      claim.amount,
      claim.claimDate,
    );

    return {
      ...mutation,
      claim: existingClaim,
      claimDate: claim.claimDate,
      amount: claim.amount,
      idempotent: true,
    };
  });
}

export function getDailyRewardClaimDate(
  claimedAt = new Date(),
  timeZone = DEFAULT_DAILY_REWARD_TIME_ZONE,
) {
  if (Number.isNaN(claimedAt.getTime())) {
    throw new DailyRewardClaimError(
      "INVALID_DAILY_REWARD",
      "claimedAt must be a valid Date.",
    );
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(claimedAt);

    const year = findDatePart(parts, "year");
    const month = findDatePart(parts, "month");
    const day = findDatePart(parts, "day");

    return `${year}-${month}-${day}`;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new DailyRewardClaimError(
        "INVALID_DAILY_REWARD",
        `Invalid daily reward time zone: ${timeZone}.`,
      );
    }

    throw error;
  }
}

function normalizeDailyRewardClaimInput(
  input: ClaimDailyRewardInput,
): NormalizedDailyRewardClaim {
  const userId = input.userId.trim();

  if (!userId) {
    throw new DailyRewardClaimError(
      "INVALID_DAILY_REWARD",
      "userId is required.",
    );
  }

  const amount = input.amount ?? DEFAULT_DAILY_REWARD_AMOUNT;

  if (amount <= BigInt(0)) {
    throw new DailyRewardClaimError(
      "INVALID_DAILY_REWARD",
      "daily reward amount must be positive.",
    );
  }

  const timeZone = input.timeZone ?? DEFAULT_DAILY_REWARD_TIME_ZONE;
  const claimDate = normalizeClaimDate(
    input.claimDate ?? getDailyRewardClaimDate(input.claimedAt, timeZone),
  );

  return {
    userId,
    amount,
    claimDate,
    timeZone,
    memo: input.memo ?? null,
    metadata: input.metadata ?? {},
  };
}

function normalizeClaimDate(claimDate: string) {
  const match = claimDatePattern.exec(claimDate);

  if (!match) {
    throw new DailyRewardClaimError(
      "INVALID_DAILY_REWARD",
      "claimDate must use YYYY-MM-DD format.",
    );
  }

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new DailyRewardClaimError(
      "INVALID_DAILY_REWARD",
      "claimDate must be a valid calendar date.",
    );
  }

  return claimDate;
}

function buildDailyRewardReferenceId(userId: string, claimDate: string) {
  return `daily-reward:${userId}:${claimDate}`;
}

async function findDailyRewardClaim(
  tx: WalletMutationTransaction,
  userId: string,
  claimDate: string,
) {
  const [claim] = await tx
    .select()
    .from(dailyRewardClaims)
    .where(
      and(
        eq(dailyRewardClaims.userId, userId),
        eq(dailyRewardClaims.claimDate, claimDate),
      ),
    )
    .limit(1);

  return claim;
}

function assertDailyRewardClaimMatch(
  claim: typeof dailyRewardClaims.$inferSelect,
  ledgerId: string,
  amount: bigint,
  claimDate: string,
) {
  if (claim.ledgerId !== ledgerId || claim.amount !== amount) {
    throw new DailyRewardClaimError(
      "DAILY_REWARD_CONFLICT",
      `Daily reward claim for ${claim.userId} on ${claimDate} does not match the expected ledger mutation.`,
    );
  }
}

function findDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  const part = parts.find((item) => item.type === type);

  if (!part) {
    throw new DailyRewardClaimError(
      "INVALID_DAILY_REWARD",
      `Could not resolve ${type} for daily reward claim date.`,
    );
  }

  return part.value;
}
