import { adjustUserPoints } from "@bk-games/db";

import {
  adminErrorResponse,
  getAdminRequestContext,
  optionalMetadata,
  parsePointAmount,
  pointMutationResponse,
  readJsonObject,
  requireBodyString,
  requireSessionUserId,
} from "../../../../_lib";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const adminUserId = await requireSessionUserId();
    const { userId } = await context.params;
    const body = await readJsonObject(request);
    const result = await adjustUserPoints({
      adminUserId,
      targetUserId: userId,
      amount: parsePointAmount(body),
      reason: requireBodyString(body, "reason"),
      requestId: requireBodyString(body, "requestId"),
      metadata: optionalMetadata(body),
      ...getAdminRequestContext(request),
    });

    return pointMutationResponse(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
