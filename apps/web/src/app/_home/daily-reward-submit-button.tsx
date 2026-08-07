"use client";

import { useFormStatus } from "react-dom";
import { Check, Gift, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DailyRewardSubmitButtonProps = {
  className?: string;
  disabled?: boolean;
};

export function DailyRewardSubmitButton({
  className,
  disabled = false,
}: DailyRewardSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <Button
      type="submit"
      disabled={isDisabled}
      className={cn(
        "h-12 w-full rounded-md border border-[#071c3f] bg-[#0b3b73] text-sm font-black tracking-normal text-white uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#c8272e] hover:shadow-[0_6px_0_#7d161b] disabled:translate-y-0 disabled:bg-[#d8ecff] disabled:text-[#0b3b73] disabled:shadow-none",
        className,
      )}
    >
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
