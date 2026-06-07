import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  AdminMutationError,
  WalletMutationError,
  type AdjustUserPointsResult,
  type JsonObject,
} from "@bk-games/db";

import { auth } from "@/lib/auth";

export class AdminRouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AdminRouteError";
  }
}

export async function requireSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new AdminRouteError(401, "UNAUTHENTICATED", "Login is required.");
  }

  return session.user.id;
}

export async function readJsonObject(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new AdminRouteError(
      400,
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }

  if (!isRecord(body)) {
    throw new AdminRouteError(
      400,
      "INVALID_BODY",
      "Request body must be a JSON object.",
    );
  }

  return body;
}

export function requireBodyString(
  body: Record<string, unknown>,
  key: string,
) {
  const value = body[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new AdminRouteError(
      400,
      "INVALID_BODY",
      `${key} must be a non-empty string.`,
    );
  }

  return value;
}

export function parsePointAmount(body: Record<string, unknown>) {
  const value = body.amount;

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  throw new AdminRouteError(
    400,
    "INVALID_BODY",
    "amount must be a safe integer number or integer string.",
  );
}

export function optionalMetadata(body: Record<string, unknown>) {
  if (body.metadata === undefined) {
    return undefined;
  }

  if (!isRecord(body.metadata)) {
    throw new AdminRouteError(
      400,
      "INVALID_BODY",
      "metadata must be a JSON object when provided.",
    );
  }

  return body.metadata as JsonObject;
}

export function getAdminRequestContext(request: Request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminRouteError) {
    return jsonError(error.status, error.code, error.message);
  }

  if (error instanceof AdminMutationError) {
    return jsonError(
      adminMutationStatus(error.code),
      error.code,
      error.message,
    );
  }

  if (error instanceof WalletMutationError) {
    return jsonError(
      walletMutationStatus(error.code),
      error.code,
      error.message,
    );
  }

  return jsonError(500, "INTERNAL_ERROR", "Unexpected admin API error.");
}

export function pointMutationResponse(result: AdjustUserPointsResult) {
  return NextResponse.json({
    auditLogId: result.auditLogId,
    idempotent: result.walletMutation.idempotent,
    ledger: {
      id: result.walletMutation.ledger.id,
      balanceAfter: result.walletMutation.ledger.balanceAfter.toString(),
      balanceBefore: result.walletMutation.ledger.balanceBefore.toString(),
      delta: result.walletMutation.ledger.delta.toString(),
      type: result.walletMutation.ledger.type,
    },
    wallet: {
      id: result.walletMutation.wallet.id,
      balance: result.walletMutation.wallet.balance.toString(),
      lockedBalance: result.walletMutation.wallet.lockedBalance.toString(),
      status: result.walletMutation.wallet.status,
    },
  });
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function adminMutationStatus(code: AdminMutationError["code"]) {
  switch (code) {
    case "INVALID_ADMIN_REQUEST":
      return 400;
    case "TARGET_NOT_FOUND":
    case "TABLE_NOT_FOUND":
      return 404;
    case "ADMIN_NOT_FOUND":
    case "ADMIN_FORBIDDEN":
      return 403;
    case "AUDIT_LOG_FAILED":
      return 500;
    default:
      return 500;
  }
}

function walletMutationStatus(code: WalletMutationError["code"]) {
  switch (code) {
    case "INVALID_MUTATION":
    case "INSUFFICIENT_BALANCE":
      return 400;
    case "WALLET_NOT_FOUND":
      return 404;
    case "WALLET_NOT_ACTIVE":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    default:
      return 500;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
