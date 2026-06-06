import type { ReactNode } from "react";
import Link from "next/link";
import { Home } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";

type LobbyShellProps = {
  children: ReactNode;
  userEmail: string;
  userName: string;
};

export function LobbyShell({ children, userEmail, userName }: LobbyShellProps) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <Link href="/" className="text-muted-foreground text-sm font-medium">
              BK Games
            </Link>
            <h1 className="text-3xl font-semibold tracking-normal">Lobby</h1>
            <p className="text-muted-foreground text-sm">
              {userName} · {userEmail}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className={buttonVariants({ variant: "outline" })}
            >
              <Home />
              Home
            </Link>
            <SignOutButton />
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
