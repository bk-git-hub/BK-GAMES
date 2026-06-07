import { eq, sql } from "drizzle-orm";

import { db } from "./client.js";
import {
  adminAuditLogs,
  blackjackTables,
  userProfiles,
  type JsonObject,
} from "./schema.js";
import {
  applyWalletMutationInTransaction,
  type WalletMutationResult,
  type WalletMutationTransaction,
} from "./wallet-transactions.js";

export type AdminMutationErrorCode =
  | "ADMIN_NOT_FOUND"
  | "ADMIN_FORBIDDEN"
  | "TARGET_NOT_FOUND"
  | "INVALID_ADMIN_REQUEST"
  | "TABLE_NOT_FOUND"
  | "AUDIT_LOG_FAILED";

export class AdminMutationError extends Error {
  readonly code: AdminMutationErrorCode;

  constructor(code: AdminMutationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AdminMutationError";
  }
}

export type AdminRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AdjustUserPointsInput = AdminRequestContext & {
  adminUserId: string;
  targetUserId: string;
  amount: bigint;
  reason: string;
  requestId: string;
  metadata?: JsonObject;
};

export type AdjustUserPointsResult = {
  auditLogId: string;
  walletMutation: WalletMutationResult;
};

export type BlackjackTableStatus = "OPEN" | "MAINTENANCE" | "CLOSED";

export type SetBlackjackTableStatusInput = AdminRequestContext & {
  adminUserId: string;
  tableCode: string;
  status: BlackjackTableStatus;
  reason: string;
  requestId: string;
};

export type SetBlackjackTableStatusResult = {
  auditLogId: string;
  table: typeof blackjackTables.$inferSelect;
  previousStatus: string;
  idempotent: boolean;
};

type AdminProfile = typeof userProfiles.$inferSelect;

type LockedBlackjackTableRow = {
  id: string;
  code: string;
  name: string;
  status: string;
};

const adminAdjustReferenceType = "ADMIN_POINT_ADJUST";
const maxReasonLength = 500;
const maxRequestIdLength = 120;

export async function assertAdminUser(userId: string): Promise<AdminProfile> {
  return assertAdminUserInTransaction(db, userId);
}

export async function adjustUserPoints(
  input: AdjustUserPointsInput,
): Promise<AdjustUserPointsResult> {
  const normalized = normalizeAdjustUserPointsInput(input);

  return db.transaction(async (tx) => {
    await assertAdminUserInTransaction(tx, normalized.adminUserId);
    const targetProfile = await findUserProfileInTransaction(
      tx,
      normalized.targetUserId,
    );

    if (!targetProfile) {
      throw new AdminMutationError(
        "TARGET_NOT_FOUND",
        `Target user ${normalized.targetUserId} was not found.`,
      );
    }

    const [auditLog] = await tx
      .insert(adminAuditLogs)
      .values({
        actorUserId: normalized.adminUserId,
        action: "POINT_ADJUST",
        targetType: "USER",
        targetId: normalized.targetUserId,
        before: {
          amount: normalized.amount.toString(),
          reason: normalized.reason,
          requestId: normalized.requestId,
          targetStatus: targetProfile.status,
        },
        ipAddress: normalized.ipAddress ?? null,
        userAgent: normalized.userAgent ?? null,
      })
      .returning();

    if (!auditLog) {
      throw new AdminMutationError(
        "AUDIT_LOG_FAILED",
        "Failed to create admin audit log.",
      );
    }

    const walletMutation = await applyWalletMutationInTransaction(tx, {
      userId: normalized.targetUserId,
      category: "ADMIN",
      type: "ADMIN_ADJUST",
      delta: normalized.amount,
      referenceType: adminAdjustReferenceType,
      referenceId: normalized.requestId,
      idempotencyKey: `admin:point-adjust:${normalized.requestId}`,
      memo: normalized.reason,
      metadata: {
        ...(normalized.metadata ?? {}),
        adminUserId: normalized.adminUserId,
        requestId: normalized.requestId,
      },
    });

    await tx
      .update(adminAuditLogs)
      .set({
        after: {
          balanceAfter: walletMutation.wallet.balance.toString(),
          balanceBefore: walletMutation.ledger.balanceBefore.toString(),
          idempotent: walletMutation.idempotent,
          ledgerId: walletMutation.ledger.id,
          walletId: walletMutation.wallet.id,
        },
      })
      .where(eq(adminAuditLogs.id, auditLog.id));

    return {
      auditLogId: auditLog.id,
      walletMutation,
    };
  });
}

export async function setBlackjackTableStatus(
  input: SetBlackjackTableStatusInput,
): Promise<SetBlackjackTableStatusResult> {
  const normalized = normalizeSetBlackjackTableStatusInput(input);

  return db.transaction(async (tx) => {
    await assertAdminUserInTransaction(tx, normalized.adminUserId);

    const tableBefore = await lockBlackjackTableByCode(
      tx,
      normalized.tableCode,
    );

    if (!tableBefore) {
      throw new AdminMutationError(
        "TABLE_NOT_FOUND",
        `Blackjack table ${normalized.tableCode} was not found.`,
      );
    }

    const idempotent = tableBefore.status === normalized.status;
    const table = idempotent
      ? await findBlackjackTableById(tx, tableBefore.id)
      : await updateBlackjackTableStatus(
          tx,
          tableBefore.id,
          normalized.status,
        );

    const [auditLog] = await tx
      .insert(adminAuditLogs)
      .values({
        actorUserId: normalized.adminUserId,
        action:
          normalized.status === "MAINTENANCE"
            ? "BLACKJACK_TABLE_PAUSE"
            : "BLACKJACK_TABLE_RESUME",
        targetType: "BLACKJACK_TABLE",
        targetId: tableBefore.id,
        before: {
          code: tableBefore.code,
          name: tableBefore.name,
          reason: normalized.reason,
          requestId: normalized.requestId,
          status: tableBefore.status,
        },
        after: {
          code: table.code,
          idempotent,
          name: table.name,
          status: table.status,
        },
        ipAddress: normalized.ipAddress ?? null,
        userAgent: normalized.userAgent ?? null,
      })
      .returning();

    if (!auditLog) {
      throw new AdminMutationError(
        "AUDIT_LOG_FAILED",
        "Failed to create admin audit log.",
      );
    }

    return {
      auditLogId: auditLog.id,
      table,
      previousStatus: tableBefore.status,
      idempotent,
    };
  });
}

async function assertAdminUserInTransaction(
  tx: WalletMutationTransaction | typeof db,
  userId: string,
): Promise<AdminProfile> {
  if (!userId.trim()) {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      "adminUserId is required.",
    );
  }

  const profile = await findUserProfileInTransaction(tx, userId);

  if (!profile) {
    throw new AdminMutationError(
      "ADMIN_NOT_FOUND",
      `Admin profile for user ${userId} was not found.`,
    );
  }

  if (profile.status !== "ACTIVE") {
    throw new AdminMutationError(
      "ADMIN_FORBIDDEN",
      `Admin user ${userId} is ${profile.status}.`,
    );
  }

  if (profile.role !== "ADMIN") {
    throw new AdminMutationError(
      "ADMIN_FORBIDDEN",
      `User ${userId} is not an admin.`,
    );
  }

  return profile;
}

async function findUserProfileInTransaction(
  tx: WalletMutationTransaction | typeof db,
  userId: string,
) {
  const [profile] = await tx
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return profile;
}

async function lockBlackjackTableByCode(
  tx: WalletMutationTransaction,
  code: string,
) {
  const result = await tx.execute(sql<LockedBlackjackTableRow>`
    select
      id,
      code,
      name,
      status
    from blackjack_tables
    where code = ${code}
    for update
  `);

  const [table] = getRows<LockedBlackjackTableRow>(result);
  return table;
}

async function findBlackjackTableById(
  tx: WalletMutationTransaction,
  tableId: string,
) {
  const [table] = await tx
    .select()
    .from(blackjackTables)
    .where(eq(blackjackTables.id, tableId))
    .limit(1);

  if (!table) {
    throw new AdminMutationError(
      "TABLE_NOT_FOUND",
      `Blackjack table ${tableId} was not found.`,
    );
  }

  return table;
}

async function updateBlackjackTableStatus(
  tx: WalletMutationTransaction,
  tableId: string,
  status: BlackjackTableStatus,
) {
  const [table] = await tx
    .update(blackjackTables)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(blackjackTables.id, tableId))
    .returning();

  if (!table) {
    throw new AdminMutationError(
      "TABLE_NOT_FOUND",
      `Blackjack table ${tableId} was not found.`,
    );
  }

  return table;
}

function normalizeAdjustUserPointsInput(input: AdjustUserPointsInput) {
  const reason = normalizeRequiredText(input.reason, "reason");
  const requestId = normalizeRequestId(input.requestId);
  const adminUserId = normalizeRequiredText(input.adminUserId, "adminUserId");
  const targetUserId = normalizeRequiredText(input.targetUserId, "targetUserId");

  if (input.amount === BigInt(0)) {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      "amount must not be zero.",
    );
  }

  return {
    ...input,
    adminUserId,
    targetUserId,
    reason,
    requestId,
  };
}

function normalizeSetBlackjackTableStatusInput(
  input: SetBlackjackTableStatusInput,
) {
  const reason = normalizeRequiredText(input.reason, "reason");
  const requestId = normalizeRequestId(input.requestId);
  const adminUserId = normalizeRequiredText(input.adminUserId, "adminUserId");
  const tableCode = normalizeRequiredText(input.tableCode, "tableCode");

  if (!["OPEN", "MAINTENANCE", "CLOSED"].includes(input.status)) {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      "status must be OPEN, MAINTENANCE, or CLOSED.",
    );
  }

  if (input.status === "CLOSED") {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      "CLOSED is not supported by the pause/resume admin flow.",
    );
  }

  return {
    ...input,
    adminUserId,
    tableCode,
    reason,
    requestId,
  };
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      `${fieldName} is required.`,
    );
  }

  if (fieldName === "reason" && normalized.length > maxReasonLength) {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      `reason must be ${maxReasonLength} characters or fewer.`,
    );
  }

  return normalized;
}

function normalizeRequestId(value: string) {
  const requestId = normalizeRequiredText(value, "requestId");

  if (requestId.length > maxRequestIdLength) {
    throw new AdminMutationError(
      "INVALID_ADMIN_REQUEST",
      `requestId must be ${maxRequestIdLength} characters or fewer.`,
    );
  }

  return requestId;
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
