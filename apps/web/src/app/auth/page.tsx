import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "./auth-form";
import { AuthShell } from "./auth-shell";
import { auth } from "@/lib/auth";

export default function AuthPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AuthSessionFallback />}>
        <AuthSessionGate />
      </Suspense>
    </AuthShell>
  );
}

async function AuthSessionGate() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/");
  }

  return <AuthForm />;
}

export function AuthSessionFallback() {
  return (
    <section
      aria-label="Checking account session"
      className="rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fff8ed] p-6 shadow-[8px_9px_0_#071c3f]"
    >
      <div className="h-4 w-24 animate-pulse rounded bg-[#0b3b73]/15" />
      <div className="mt-4 h-9 w-48 animate-pulse rounded bg-[#0b3b73]/15" />
      <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded bg-[#0b3b73]/10" />
      <div className="mt-7 grid gap-4">
        <div className="h-12 animate-pulse rounded-md bg-[#0b3b73]/10" />
        <div className="h-12 animate-pulse rounded-md bg-[#0b3b73]/10" />
        <div className="h-12 animate-pulse rounded-md bg-[#c8272e]/20" />
      </div>
      <span className="sr-only">Checking your current login state.</span>
    </section>
  );
}
