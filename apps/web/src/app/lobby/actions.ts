"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  claimDailyReward,
  DailyRewardClaimError,
  ensureUserGameAccount,
  WalletMutationError,
} from "@bk-games/db";

import { auth } from "@/lib/auth";

export async function claimDailyRewardAction() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  await ensureUserGameAccount({
    userId: session.user.id,
    displayName: session.user.name,
  });

  let redirectTarget = "/lobby?reward=error";

  try {
    const result = await claimDailyReward({
      userId: session.user.id,
      memo: "Daily reward claimed from the web lobby.",
      metadata: {
        source: "web:lobby",
      },
    });

    redirectTarget = result.idempotent
      ? `/lobby?reward=already-claimed&date=${result.claimDate}`
      : `/lobby?reward=claimed&date=${result.claimDate}`;
  } catch (error) {
    if (
      error instanceof DailyRewardClaimError ||
      error instanceof WalletMutationError
    ) {
      redirectTarget = `/lobby?reward=error&code=${error.code}`;
    } else {
      throw error;
    }
  }

  revalidatePath("/");
  revalidatePath("/lobby");
  redirect(redirectTarget);
}
