import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "./auth-form";
import { AuthSessionFallback } from "./auth-session-fallback";
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
