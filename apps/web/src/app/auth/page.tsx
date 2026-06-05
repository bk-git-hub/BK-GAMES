import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "./auth-form";
import { auth } from "@/lib/auth";

export default async function AuthPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/");
  }

  return (
    <main className="bg-background text-foreground min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-12">
        <AuthForm />
      </section>
    </main>
  );
}
