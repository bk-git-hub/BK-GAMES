import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ensureUserGameAccount } from "@bk-games/db";
import type { GameTokenRole } from "@bk-games/shared/src/types";

import { BkDerbyClient } from "./bk-derby-client";
import { auth } from "@/lib/auth";

export default async function BkDerbyPage() {
  const initialAuth = await getInitialDerbyAuth();

  return <BkDerbyClient initialAuth={initialAuth} />;
}

async function getInitialDerbyAuth() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return null;
    }

    const gameAccount = await ensureUserGameAccount({
      userId: session.user.id,
      displayName: session.user.name,
    });
    const role: GameTokenRole =
      gameAccount.profile.role === "ADMIN" ? "ADMIN" : "USER";

    return {
      player: {
        id: session.user.id,
        nickname: session.user.name || session.user.email || "Player",
        role,
      },
      walletBalance: gameAccount.wallet.balance.toString(),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Failed to load BK Derby session.", error);
    return null;
  }
}
