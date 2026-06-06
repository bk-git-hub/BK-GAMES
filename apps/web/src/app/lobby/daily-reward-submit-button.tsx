"use client";

import { useFormStatus } from "react-dom";
import { Check, Gift, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type DailyRewardSubmitButtonProps = {
  disabled?: boolean;
};

export function DailyRewardSubmitButton({
  disabled = false,
}: DailyRewardSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <Button type="submit" disabled={isDisabled} className="w-full">
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : disabled ? (
        <Check />
      ) : (
        <Gift />
      )}
      {pending ? "Claiming..." : disabled ? "Reward claimed" : "Claim reward"}
    </Button>
  );
}
