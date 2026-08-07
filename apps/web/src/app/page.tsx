import { headers } from "next/headers";
import {
  DEFAULT_DAILY_REWARD_AMOUNT,
  db,
  ensureUserGameAccount,
  getDailyRewardClaimDate,
} from "@bk-games/db";

import {
  AccountRewardPanel,
  type DailyRewardFeedback,
} from "./_home/account-reward-panel";
import { GameList } from "./_home/game-list";
import { HomeShell } from "./_home/home-shell";
import { auth } from "@/lib/auth";

type HomePageProps = {
  searchParams?: Promise<{
    code?: string | string[];
    date?: string | string[];
    reward?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const session = await getOptionalSession();
  const today = getDailyRewardClaimDate();
  const feedback = getDailyRewardFeedback(params);
  const account = session
    ? await getHomeAccountState({
        displayName: session.user.name,
        today,
        userId: session.user.id,
      })
    : null;
  const accountStatus = !session
    ? "guest"
    : account?.status === "ready"
      ? "ready"
      : "unavailable";

  return (
    <HomeShell userEmail={session?.user.email} userName={session?.user.name}>
      <div className="flex flex-col gap-6">
        <AccountRewardPanel
          accountStatus={accountStatus}
          balance={account?.status === "ready" ? account.balance : undefined}
          feedback={feedback}
          hasClaimedToday={
            account?.status === "ready" ? account.hasClaimedToday : false
          }
          rewardAmount={DEFAULT_DAILY_REWARD_AMOUNT}
          today={today}
          walletStatus={
            account?.status === "ready" ? account.walletStatus : undefined
          }
        />
        <GameList />
      </div>
    </HomeShell>
  );
}

async function getOptionalSession() {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    console.error("Failed to load home session.", error);
    return null;
  }
}

async function getHomeAccountState({
  displayName,
  today,
  userId,
}: {
  displayName: string;
  today: string;
  userId: string;
}) {
  try {
    const gameAccount = await ensureUserGameAccount({
      userId,
      displayName,
    });
    const rewardClaim = await db.query.dailyRewardClaims.findFirst({
      columns: {
        id: true,
      },
      where: (claim, { and, eq }) =>
        and(eq(claim.userId, userId), eq(claim.claimDate, today)),
    });

    return {
      balance: gameAccount.wallet.balance,
      hasClaimedToday: Boolean(rewardClaim),
      status: "ready" as const,
      walletStatus: gameAccount.wallet.status,
    };
  } catch (error) {
    console.error("Failed to load home account data.", error);
    return {
      status: "unavailable" as const,
    };
  }
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
