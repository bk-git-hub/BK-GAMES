import { setBlackjackTableStatus } from "@bk-games/db";
import { NextResponse } from "next/server";

import {
  adminErrorResponse,
  getAdminRequestContext,
  readJsonObject,
  requireBodyString,
  requireSessionUserId,
} from "../../../../_lib";

export async function POST(request: Request) {
  try {
    const adminUserId = await requireSessionUserId();
    const body = await readJsonObject(request);
    const result = await setBlackjackTableStatus({
      adminUserId,
      tableCode: "main",
      status: "MAINTENANCE",
      reason: requireBodyString(body, "reason"),
      requestId: requireBodyString(body, "requestId"),
      ...getAdminRequestContext(request),
    });

    return NextResponse.json({
      auditLogId: result.auditLogId,
      idempotent: result.idempotent,
      previousStatus: result.previousStatus,
      table: {
        code: result.table.code,
        id: result.table.id,
        status: result.table.status,
      },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
