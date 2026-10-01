import { setBlackjackTableStatus } from "@bk-games/db";
import { NextResponse } from "next/server";

import {
  adminErrorResponse,
  getAdminRequestContext,
  readJsonObject,
  requireBodyString,
  requireSessionUserId,
} from "../../../../_lib";
import { cardGamesNotFoundBody, isCardGamesEnabled } from "@/lib/card-games";

export async function POST(request: Request) {
  // Before the session lookup: a disabled deployment answers like a missing
  // route and does no auth or database work for card-game tables.
  if (!isCardGamesEnabled()) {
    return NextResponse.json(cardGamesNotFoundBody, { status: 404 });
  }

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
