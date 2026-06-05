import type { ReactNode } from "react";
import Link from "next/link";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="flex max-w-xl flex-col gap-3">
          <Link href="/" className="text-muted-foreground text-sm font-medium">
            BK Games
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-normal">
              Account access
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              Sign in or create an account for the BK Games platform.
            </p>
          </div>
        </div>

        <AuthPanel>{children}</AuthPanel>
      </section>
    </main>
  );
}

function AuthPanel({ children }: AuthShellProps) {
  return <div className="w-full max-w-md">{children}</div>;
}
