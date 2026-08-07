import "server-only";

import { cache } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { LogIn } from "lucide-react";
import {
  DEFAULT_DAILY_REWARD_AMOUNT,
  db,
  ensureUserGameAccount,
  getDailyRewardClaimDate,
} from "@bk-games/db";

import {
  AccountRewardPanel,
  type DailyRewardFeedback,
} from "./account-reward-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { auth } from "@/lib/auth";

export type HomeSearchParams = {
  code?: string | string[];
  date?: string | string[];
  reward?: string | string[];
};

type HomeAccountRewardProps = {
  searchParams?: Promise<HomeSearchParams>;
};

export async function HomeIdentity() {
  const session = await getOptionalHomeSession();

  return (
    <p className="mt-3 text-sm leading-6 font-bold break-words text-[#4b5874]">
      {session
        ? `${session.user.name || "Player"} · ${session.user.email}`
        : "Browse games first. Login only when you are ready to claim points or bet."}
    </p>
  );
}

export async function HomeAccountActions() {
  const session = await getOptionalHomeSession();

  if (session) {
    return (
      <div className="[&_button]:h-11 [&_button]:rounded-md [&_button]:border-[#071c3f] [&_button]:bg-[#0b3b73] [&_button]:px-5 [&_button]:text-sm [&_button]:font-black [&_button]:tracking-normal [&_button]:text-white [&_button]:uppercase [&_button]:shadow-[0_5px_0_#071c3f] [&_button]:transition [&_button:hover]:-translate-y-0.5 [&_button:hover]:bg-[#c8272e] [&_button:hover]:shadow-[0_6px_0_#7d161b]">
        <SignOutButton />
      </div>
    );
  }

  return (
    <Link
      href="/auth"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#071c3f] bg-[#0b3b73] px-5 text-sm font-black tracking-normal text-white uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#c8272e] hover:shadow-[0_6px_0_#7d161b]"
    >
      <LogIn className="size-4" />
      Login
    </Link>
  );
}

export async function HomeAccountReward({
  searchParams,
}: HomeAccountRewardProps) {
  const [params, session] = await Promise.all([
    searchParams,
    getOptionalHomeSession(),
  ]);
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
  );
}

const getOptionalHomeSession = cache(async () => {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Failed to load home session.", error);
    return null;
  }
});

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
  params: HomeSearchParams | undefined,
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
  params: Pick<HomeSearchParams, "code" | "date"> | undefined,
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
