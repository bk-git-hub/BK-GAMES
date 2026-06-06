import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureUserGameAccount } from "@bk-games/db";

import { DailyRewardCard } from "./daily-reward-card";
import { GameList } from "./game-list";
import { LobbyShell } from "./lobby-shell";
import { WalletSummary } from "./wallet-summary";
import { auth } from "@/lib/auth";

export default async function LobbyPage() {
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
    <LobbyShell userEmail={session.user.email} userName={session.user.name}>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <WalletSummary
            balance={gameAccount.wallet.balance}
            status={gameAccount.wallet.status}
          />
          <GameList />
        </div>
        <DailyRewardCard />
      </div>
    </LobbyShell>
  );
}
