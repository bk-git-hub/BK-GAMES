import { and, eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import { pointLedgers, wallets, type JsonObject } from "./schema.js";

export type WalletMutationCategory = "GAME" | "REWARD" | "ADMIN" | "SYSTEM";
export type WalletMutationGameType = "BLACKJACK" | "BACCARAT";
export type WalletMutationLedgerType =
  | "ADMIN_ADJUST"
  | "DAILY_REWARD"
  | "BET"
  | "DOUBLE_BET"
  | "SPLIT_BET"
  | "INSURANCE_BET"
  | "SURRENDER_REFUND"
  | "PAYOUT"
  | "PUSH_REFUND"
  | "CANCEL_REFUND";

export type WalletMutationErrorCode =
  | "INVALID_MUTATION"
  | "WALLET_NOT_FOUND"
  | "WALLET_NOT_ACTIVE"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT";

export class WalletMutationError extends Error {
  readonly code: WalletMutationErrorCode;

  constructor(code: WalletMutationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "WalletMutationError";
  }
}

export type WalletMutationInput = {
  userId: string;
  category: WalletMutationCategory;
  gameType?: WalletMutationGameType | null;
  type: WalletMutationLedgerType;
  delta: bigint;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  memo?: string | null;
  metadata?: JsonObject;
};

export type WalletMutationResult = {
  wallet: typeof wallets.$inferSelect;
  ledger: typeof pointLedgers.$inferSelect;
  idempotent: boolean;
};

export type LockedActiveWallet = {
  id: string;
  userId: string;
  balance: bigint;
  lockedBalance: bigint;
  status: "ACTIVE";
  version: number;
};

export type WalletMutationTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

type LockedWalletRow = {
  id: string;
  userId: string;
  balance: bigint | string;
  lockedBalance: bigint | string;
  status: string;
  version: number;
};

const debitTypes = new Set<WalletMutationLedgerType>([
  "BET",
  "DOUBLE_BET",
  "SPLIT_BET",
  "INSURANCE_BET",
]);

const creditTypes = new Set<WalletMutationLedgerType>([
  "DAILY_REWARD",
  "SURRENDER_REFUND",
  "PAYOUT",
  "PUSH_REFUND",
  "CANCEL_REFUND",
]);

const zero = BigInt(0);

export async function applyWalletMutation(
  input: WalletMutationInput,
): Promise<WalletMutationResult> {
  return db.transaction((tx) => applyWalletMutationInTransaction(tx, input));
}

export async function applyWalletMutationInTransaction(
  tx: WalletMutationTransaction,
  input: WalletMutationInput,
): Promise<WalletMutationResult> {
  validateWalletMutationInput(input);

  const existingBeforeLock = await findLedgerByIdempotencyKey(
    tx,
    input.userId,
    input.idempotencyKey,
  );

  if (existingBeforeLock) {
    assertIdempotencyMatch(existingBeforeLock, input);
    return {
      ledger: existingBeforeLock,
      wallet: await findWalletByUserId(tx, input.userId),
      idempotent: true,
    };
  }

  const lockedWallet = await lockWalletByUserId(tx, input.userId);

  const existingAfterLock = await findLedgerByIdempotencyKey(
    tx,
    input.userId,
    input.idempotencyKey,
  );

  if (existingAfterLock) {
    assertIdempotencyMatch(existingAfterLock, input);
    return {
      ledger: existingAfterLock,
      wallet: await findWalletByUserId(tx, input.userId),
      idempotent: true,
    };
  }

  if (lockedWallet.status !== "ACTIVE") {
    throw new WalletMutationError(
      "WALLET_NOT_ACTIVE",
      `Wallet for user ${input.userId} is ${lockedWallet.status}.`,
    );
  }

  const balanceBefore = toBigInt(lockedWallet.balance);
  const lockedBalance = toBigInt(lockedWallet.lockedBalance);
  const balanceAfter = balanceBefore + input.delta;

  if (balanceAfter < zero || balanceAfter < lockedBalance) {
    throw new WalletMutationError(
      "INSUFFICIENT_BALANCE",
      `Insufficient wallet balance for user ${input.userId}.`,
    );
  }

  const [ledger] = await tx
    .insert(pointLedgers)
    .values({
      walletId: lockedWallet.id,
      userId: input.userId,
      category: input.category,
      gameType: input.category === "GAME" ? input.gameType : null,
      type: input.type,
      delta: input.delta,
      balanceBefore,
      balanceAfter,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo ?? null,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [pointLedgers.userId, pointLedgers.idempotencyKey],
    })
    .returning();

  if (!ledger) {
    const existingLedger = await findLedgerByIdempotencyKey(
      tx,
      input.userId,
      input.idempotencyKey,
    );

    if (!existingLedger) {
      throw new WalletMutationError(
        "IDEMPOTENCY_CONFLICT",
        `Ledger idempotency key ${input.idempotencyKey} conflicted without returning an existing ledger.`,
      );
    }

    assertIdempotencyMatch(existingLedger, input);
    return {
      ledger: existingLedger,
      wallet: await findWalletByUserId(tx, input.userId),
      idempotent: true,
    };
  }

  const [wallet] = await tx
    .update(wallets)
    .set({
      balance: balanceAfter,
      version: sql`${wallets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, lockedWallet.id))
    .returning();

  if (!wallet) {
    throw new WalletMutationError(
      "WALLET_NOT_FOUND",
      `Wallet ${lockedWallet.id} disappeared during mutation.`,
    );
  }

  return {
    wallet,
    ledger,
    idempotent: false,
  };
}

export async function getActiveWalletForUpdate(
  tx: WalletMutationTransaction,
  userId: string,
): Promise<LockedActiveWallet> {
  const lockedWallet = await lockWalletByUserId(tx, userId);

  if (lockedWallet.status !== "ACTIVE") {
    throw new WalletMutationError(
      "WALLET_NOT_ACTIVE",
      `Wallet for user ${userId} is ${lockedWallet.status}.`,
    );
  }

  return {
    id: lockedWallet.id,
    userId: lockedWallet.userId,
    balance: toBigInt(lockedWallet.balance),
    lockedBalance: toBigInt(lockedWallet.lockedBalance),
    status: "ACTIVE",
    version: lockedWallet.version,
  };
}

function validateWalletMutationInput(input: WalletMutationInput) {
  if (!input.userId.trim()) {
    throw new WalletMutationError("INVALID_MUTATION", "userId is required.");
  }

  if (!input.referenceType.trim()) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      "referenceType is required.",
    );
  }

  if (!input.referenceId.trim()) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      "referenceId is required.",
    );
  }

  if (!input.idempotencyKey.trim()) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      "idempotencyKey is required.",
    );
  }

  if (input.delta === zero) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      "delta must not be zero.",
    );
  }

  if (input.category === "GAME" && !input.gameType) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      "gameType is required for GAME wallet mutations.",
    );
  }

  if (input.category !== "GAME" && input.gameType) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      "gameType must be null for non-GAME wallet mutations.",
    );
  }

  if (debitTypes.has(input.type) && input.delta >= zero) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      `${input.type} mutations must use a negative delta.`,
    );
  }

  if (creditTypes.has(input.type) && input.delta <= zero) {
    throw new WalletMutationError(
      "INVALID_MUTATION",
      `${input.type} mutations must use a positive delta.`,
    );
  }
}

async function findLedgerByIdempotencyKey(
  tx: WalletMutationTransaction,
  userId: string,
  idempotencyKey: string,
) {
  const [ledger] = await tx
    .select()
    .from(pointLedgers)
    .where(
      and(
        eq(pointLedgers.userId, userId),
        eq(pointLedgers.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  return ledger;
}

async function findWalletByUserId(
  tx: WalletMutationTransaction,
  userId: string,
) {
  const [wallet] = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);

  if (!wallet) {
    throw new WalletMutationError(
      "WALLET_NOT_FOUND",
      `Wallet for user ${userId} was not found.`,
    );
  }

  return wallet;
}

async function lockWalletByUserId(
  tx: WalletMutationTransaction,
  userId: string,
) {
  const result = await tx.execute(sql<LockedWalletRow>`
    select
      id,
      user_id as "userId",
      balance,
      locked_balance as "lockedBalance",
      status,
      version
    from wallets
    where user_id = ${userId}
    for update
  `);
  const [wallet] = getRows<LockedWalletRow>(result);

  if (!wallet) {
    throw new WalletMutationError(
      "WALLET_NOT_FOUND",
      `Wallet for user ${userId} was not found.`,
    );
  }

  return wallet;
}

function assertIdempotencyMatch(
  ledger: typeof pointLedgers.$inferSelect,
  input: WalletMutationInput,
) {
  const mismatched =
    ledger.category !== input.category ||
    ledger.gameType !== (input.category === "GAME" ? input.gameType : null) ||
    ledger.type !== input.type ||
    ledger.delta !== input.delta ||
    ledger.referenceType !== input.referenceType ||
    ledger.referenceId !== input.referenceId ||
    !jsonValueMatches(ledger.metadata, input.metadata ?? {});

  if (mismatched) {
    throw new WalletMutationError(
      "IDEMPOTENCY_CONFLICT",
      `Idempotency key ${input.idempotencyKey} was reused with different wallet mutation details.`,
    );
  }
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

function toBigInt(value: bigint | string) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function jsonValueMatches(left: unknown, right: unknown) {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
    );

    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}
