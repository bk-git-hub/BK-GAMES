"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type SignOutButtonProps = {
  children?: ReactNode;
  className?: string;
};

export function SignOutButton({
  children = "Sign out",
  className,
}: SignOutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const signOut = () => {
    startTransition(async () => {
      await authClient.signOut();
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={signOut}
      disabled={isPending}
      className={className}
    >
      {isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
      {children}
    </Button>
  );
}
