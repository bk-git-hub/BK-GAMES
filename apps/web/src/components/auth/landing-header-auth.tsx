"use client";

import Link from "next/link";
import { Loader2, LogIn } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { authClient } from "@/lib/auth-client";

const headerAuthButtonClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#071c3f] bg-[#fffaf0] px-5 text-sm font-black tracking-normal text-[#0b3b73] uppercase transition hover:-translate-y-0.5 hover:bg-[#d8ecff] disabled:translate-y-0 disabled:opacity-60";

export function LandingHeaderAuth() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <button
        aria-busy="true"
        className={headerAuthButtonClassName}
        disabled
        type="button"
      >
        <Loader2 className="size-4 animate-spin" />
        Account
      </button>
    );
  }

  if (session) {
    return (
      <SignOutButton className={headerAuthButtonClassName}>
        Logout
      </SignOutButton>
    );
  }

  return (
    <Link href="/auth" className={headerAuthButtonClassName}>
      <LogIn className="size-4" />
      Login
    </Link>
  );
}
