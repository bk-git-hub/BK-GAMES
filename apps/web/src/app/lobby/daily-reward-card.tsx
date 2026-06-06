import { Gift } from "lucide-react";

import { claimDailyRewardAction } from "./actions";
import { DailyRewardSubmitButton } from "./daily-reward-submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="size-4" />
          <CardTitle>Daily reward</CardTitle>
        </div>
        <CardDescription>
          Claim free platform points once per day.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">{formatPoints(amount)} pts</p>
          <p className="text-muted-foreground text-sm">Today: {today}</p>
        </div>
        <RewardMessage feedback={feedback} />
        <form action={claimDailyRewardAction}>
          <DailyRewardSubmitButton disabled={isClaimed} />
        </form>
      </CardContent>
    </Card>
  );
}

function RewardMessage({ feedback }: { feedback: DailyRewardFeedback }) {
  if (feedback.status === "claimed") {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        {feedback.claimDate
          ? `Daily reward claimed for ${feedback.claimDate}.`
          : "Daily reward claimed."}
      </p>
    );
  }

  if (feedback.status === "already-claimed") {
    return (
      <p className="bg-muted text-muted-foreground rounded-lg border px-3 py-2 text-sm">
        Today&apos;s reward was already claimed.
      </p>
    );
  }

  if (feedback.status === "error") {
    return (
      <p
        className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        role="alert"
      >
        Reward claim failed{feedback.code ? ` (${feedback.code})` : ""}.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-sm">
      Available now. Come back tomorrow for the next daily reward.
    </p>
  );
}

function formatPoints(value: bigint) {
  return new Intl.NumberFormat("en-US").format(value);
}
