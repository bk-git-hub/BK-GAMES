import { CalendarDays, Gift } from "lucide-react";

import { claimDailyRewardAction } from "./actions";
import { DailyRewardSubmitButton } from "./daily-reward-submit-button";

export type DailyRewardFeedback = {
  claimDate?: string;
  code?: string;
  status: "idle" | "claimed" | "already-claimed" | "error";
};

type DailyRewardCardProps = {
  amount: bigint;
  feedback: DailyRewardFeedback;
  today: string;
};

export function DailyRewardCard({
  amount,
  feedback,
  today,
}: DailyRewardCardProps) {
  const isClaimed =
    feedback.status === "claimed" || feedback.status === "already-claimed";

  return (
    <aside className="rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fff8ed] p-5 shadow-[8px_9px_0_#c8272e] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Gift className="size-5 text-[#c8272e]" />
            <h2 className="text-3xl font-black tracking-normal text-[#111827]">
              Daily reward
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 font-bold text-[#4b5874]">
            Claim free platform points once per day.
          </p>
        </div>
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#c8272e] text-white shadow-[0_5px_0_#7d161b]">
          <Gift className="size-6" />
        </div>
      </div>

      <div className="mt-6 rounded-[1.15rem] border-[2px] border-[#111827] bg-[#fffaf0] p-4">
        <p className="text-xs font-black tracking-normal text-[#c8272e] uppercase">
          Available points
        </p>
        <p className="mt-2 text-4xl font-black tracking-normal text-[#111827]">
          {formatPoints(amount)}
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-[#4b5874]">
          <CalendarDays className="size-4 text-[#0b3b73]" />
          Today: {today}
        </div>
      </div>

      <div className="mt-4">
        <RewardMessage feedback={feedback} />
      </div>

      <form action={claimDailyRewardAction} className="mt-5">
        <DailyRewardSubmitButton disabled={isClaimed} />
      </form>
    </aside>
  );
}

function RewardMessage({ feedback }: { feedback: DailyRewardFeedback }) {
  if (feedback.status === "claimed") {
    return (
      <p className="rounded-[1rem] border border-[#0b3b73] bg-[#d8ecff] px-4 py-3 text-sm leading-6 font-bold text-[#0b3b73]">
        {feedback.claimDate
          ? `Daily reward claimed for ${feedback.claimDate}.`
          : "Daily reward claimed."}
      </p>
    );
  }

  if (feedback.status === "already-claimed") {
    return (
      <p className="rounded-[1rem] border border-[#d8c09a] bg-[#fffaf0] px-4 py-3 text-sm leading-6 font-bold text-[#4b5874]">
        Today&apos;s reward was already claimed.
      </p>
    );
  }

  if (feedback.status === "error") {
    return (
      <p
        className="rounded-[1rem] border border-[#c8272e] bg-[#fff0ef] px-4 py-3 text-sm leading-6 font-bold text-[#c8272e]"
        role="alert"
      >
        Reward claim failed{feedback.code ? ` (${feedback.code})` : ""}.
      </p>
    );
  }

  return (
    <p className="text-sm leading-6 font-bold text-[#4b5874]">
      Available now. Come back tomorrow for the next daily reward.
    </p>
  );
}

function formatPoints(value: bigint) {
  return new Intl.NumberFormat("en-US").format(value);
}
