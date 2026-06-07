import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureUserGameAccount } from "@bk-games/db";

import { BlackjackTableClient } from "./blackjack-table-client";
import { auth } from "@/lib/auth";

export default async function BlackjackPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  const gameAccount = await ensureUserGameAccount({
    userId: session.user.id,
    displayName: session.user.name,
  });

  return (
    <BlackjackTableClient
      initialWalletBalance={gameAccount.wallet.balance.toString()}
      userEmail={session.user.email}
      userName={session.user.name}
    />
  );
}
