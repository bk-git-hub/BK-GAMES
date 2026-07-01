import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEFAULT_DAILY_REWARD_AMOUNT,
  ensureUserGameAccount,
  getDailyRewardClaimDate,
} from "@bk-games/db";

import { DailyRewardCard, type DailyRewardFeedback } from "./daily-reward-card";
import { GameList } from "./game-list";
import { LobbyShell } from "./lobby-shell";
import { WalletSummary } from "./wallet-summary";
import { auth } from "@/lib/auth";

type LobbyPageProps = {
  searchParams?: Promise<{
    code?: string | string[];
    date?: string | string[];
    reward?: string | string[];
  }>;
};

export default async function LobbyPage({ searchParams }: LobbyPageProps) {
  const params = await searchParams;
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
  const feedback = getDailyRewardFeedback(params);

  return (
    <LobbyShell userEmail={session.user.email} userName={session.user.name}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <WalletSummary
            balance={gameAccount.wallet.balance}
            status={gameAccount.wallet.status}
          />
          <GameList />
        </div>
        <DailyRewardCard
          amount={DEFAULT_DAILY_REWARD_AMOUNT}
          feedback={feedback}
          today={getDailyRewardClaimDate()}
        />
      </div>
    </LobbyShell>
  );
}

function getDailyRewardFeedback(
  params:
    | {
        code?: string | string[];
        date?: string | string[];
        reward?: string | string[];
      }
    | undefined,
): DailyRewardFeedback {
  const reward = getFirstSearchParam(params?.reward);

  if (reward === "claimed") {
    return buildDailyRewardFeedback("claimed", params);
  }

  if (reward === "already-claimed") {
    return buildDailyRewardFeedback("already-claimed", params);
  }

  if (reward === "error") {
    return buildDailyRewardFeedback("error", params);
  }

  return {
    status: "idle" as const,
  };
}

function buildDailyRewardFeedback(
  status: Exclude<DailyRewardFeedback["status"], "idle">,
  params:
    | {
        code?: string | string[];
        date?: string | string[];
      }
    | undefined,
): DailyRewardFeedback {
  return {
    claimDate: getFirstSearchParam(params?.date),
    code: getFirstSearchParam(params?.code),
    status,
  };
}

function getFirstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
