import Link from "next/link";
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  Coins,
  Gift,
  LogIn,
  WalletCards,
} from "lucide-react";

import { claimDailyRewardAction } from "./actions";
import { DailyRewardSubmitButton } from "./daily-reward-submit-button";

export type DailyRewardFeedback = {
  claimDate?: string;
  code?: string;
  status: "idle" | "claimed" | "already-claimed" | "error";
};

type AccountRewardPanelProps = {
  accountStatus: "guest" | "ready" | "unavailable";
  balance?: bigint;
  feedback: DailyRewardFeedback;
  hasClaimedToday: boolean;
  rewardAmount: bigint;
  today: string;
  walletStatus?: string;
};

const pointsFormatter = new Intl.NumberFormat("en-US");

export function AccountRewardPanel({
  accountStatus,
  balance,
  feedback,
  hasClaimedToday,
  rewardAmount,
  today,
  walletStatus,
}: AccountRewardPanelProps) {
  const isGuest = accountStatus === "guest";
  const isUnavailable = accountStatus === "unavailable";
  const resolvedFeedback = resolveRewardFeedback(
    feedback,
    hasClaimedToday,
    today,
  );
  const isClaimed =
    resolvedFeedback.status === "claimed" ||
    resolvedFeedback.status === "already-claimed";
  const canClaim = accountStatus === "ready" && !isClaimed;

  return (
    <section className="overflow-hidden rounded-[1.35rem] border-[2px] border-[#111827] bg-[#0b3b73] text-white shadow-[8px_9px_0_#c8272e]">
      <div className="border-b border-white/15 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WalletCards className="size-5 text-[#8fc4e8]" />
              <h2 className="text-3xl font-black tracking-normal">
                Player points
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 font-bold text-[#d8ecff]">
              Browse the games freely. Sign in when you are ready to claim
              points or place a bet.
            </p>
          </div>

          {isGuest ? (
            <Link
              href="/auth"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#071c3f] bg-[#f5c95f] px-5 text-sm font-black tracking-normal text-[#111827] uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#fff8ed]"
            >
              <LogIn className="size-4" />
              Login
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center justify-center rounded-full bg-[#f5c95f] px-4 text-xs font-black tracking-normal text-[#111827] uppercase">
              {isUnavailable ? "Account unavailable" : "Live"}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.88fr)] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <PointMetric
            icon={Coins}
            label="Balance"
            value={
              typeof balance === "bigint"
                ? `${formatPoints(balance)} pts`
                : isGuest
                  ? "Login required"
                  : "Unavailable"
            }
          />
          <PointMetric
            icon={BadgeCheck}
            label="Wallet status"
            value={walletStatus ?? (isGuest ? "Guest" : "Unavailable")}
          />
        </div>

        <div className="rounded-[1.15rem] border border-white/15 bg-[#071c3f] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#8fc4e8]">
                <Gift className="size-4" />
                <p className="text-xs font-black tracking-normal uppercase">
                  Daily reward
                </p>
              </div>
              <p className="mt-3 text-2xl font-black tracking-normal">
                {formatPoints(rewardAmount)} pts
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[#d8ecff]">
                <CalendarDays className="size-4 text-[#8fc4e8]" />
                Today: {today}
              </div>
            </div>

            <RewardAction
              canClaim={canClaim}
              isClaimed={isClaimed}
              isGuest={isGuest}
              isUnavailable={isUnavailable}
            />
          </div>

          <div className="mt-4">
            <RewardMessage
              accountStatus={accountStatus}
              feedback={resolvedFeedback}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function RewardAction({
  canClaim,
  isClaimed,
  isGuest,
  isUnavailable,
}: {
  canClaim: boolean;
  isClaimed: boolean;
  isGuest: boolean;
  isUnavailable: boolean;
}) {
  if (isGuest) {
    return (
      <Link
        href="/auth"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[#071c3f] bg-[#f5c95f] px-5 text-sm font-black tracking-normal text-[#111827] uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#fff8ed] sm:w-auto"
      >
        <LogIn className="size-4" />
        Login to claim
      </Link>
    );
  }

  if (isUnavailable) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-white/15 bg-white/10 px-5 text-sm font-black tracking-normal text-[#d8ecff] uppercase sm:w-auto"
      >
        <AlertCircle className="size-4" />
        Unavailable
      </button>
    );
  }

  return (
    <form action={claimDailyRewardAction} className="w-full sm:w-auto">
      <DailyRewardSubmitButton
        disabled={isClaimed || !canClaim}
        className="min-w-40"
      />
    </form>
  );
}

function RewardMessage({
  accountStatus,
  feedback,
}: {
  accountStatus: AccountRewardPanelProps["accountStatus"];
  feedback: DailyRewardFeedback;
}) {
  if (accountStatus === "guest") {
    return (
      <p className="text-sm leading-6 font-bold text-[#d8ecff]">
        Login keeps your points, reward claims, and betting actions tied to one
        account.
      </p>
    );
  }

  if (accountStatus === "unavailable") {
    return (
      <p
        className="rounded-[1rem] border border-[#f5c95f] bg-[#f5c95f]/10 px-4 py-3 text-sm leading-6 font-bold text-[#fff8ed]"
        role="alert"
      >
        Account data could not be loaded. The game list is still available.
      </p>
    );
  }

  if (feedback.status === "claimed") {
    return (
      <p className="rounded-[1rem] border border-[#8fc4e8] bg-[#d8ecff] px-4 py-3 text-sm leading-6 font-bold text-[#0b3b73]">
        {feedback.claimDate
          ? `Daily reward claimed for ${feedback.claimDate}.`
          : "Daily reward claimed."}
      </p>
    );
  }

  if (feedback.status === "already-claimed") {
    return (
      <p className="rounded-[1rem] border border-white/15 bg-white/10 px-4 py-3 text-sm leading-6 font-bold text-[#d8ecff]">
        Today&apos;s reward was already claimed.
      </p>
    );
  }

  if (feedback.status === "error") {
    return (
      <p
        className="rounded-[1rem] border border-[#f5c95f] bg-[#fff0ef] px-4 py-3 text-sm leading-6 font-bold text-[#c8272e]"
        role="alert"
      >
        Reward claim failed{feedback.code ? ` (${feedback.code})` : ""}.
      </p>
    );
  }

  return (
    <p className="text-sm leading-6 font-bold text-[#d8ecff]">
      Available now. Come back tomorrow for the next daily reward.
    </p>
  );
}

function PointMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/15 bg-[#071c3f] p-4">
      <div className="flex items-center gap-2 text-[#8fc4e8]">
        <Icon className="size-4" />
        <p className="text-xs font-black tracking-normal uppercase">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black tracking-normal break-words">
        {value}
      </p>
    </div>
  );
}

function resolveRewardFeedback(
  feedback: DailyRewardFeedback,
  hasClaimedToday: boolean,
  today: string,
): DailyRewardFeedback {
  if (feedback.status !== "idle") {
    return feedback;
  }

  if (hasClaimedToday) {
    return {
      claimDate: today,
      status: "already-claimed",
    };
  }

  return feedback;
}

function formatPoints(value: bigint) {
  return pointsFormatter.format(value);
}
