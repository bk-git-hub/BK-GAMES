import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureUserGameAccount } from "@bk-games/db";

import { BaccaratTableClient } from "./baccarat-table-client";
import { auth } from "@/lib/auth";

export default async function BaccaratPage() {
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
    <BaccaratTableClient
      initialWalletBalance={gameAccount.wallet.balance.toString()}
      userEmail={session.user.email}
      userName={session.user.name}
    />
  );
}
