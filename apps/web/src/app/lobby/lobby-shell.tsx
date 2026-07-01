import type { ReactNode } from "react";
import Link from "next/link";
import { Home } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

type LobbyShellProps = {
  children: ReactNode;
  userEmail: string;
  userName: string;
};

export function LobbyShell({ children, userEmail, userName }: LobbyShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7efe2] text-[#111827]">
      <RetroTexture />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1260px] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fff8ed] p-5 shadow-[8px_9px_0_#0b3b73] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link
                href="/"
                className="inline-flex items-end gap-2 text-[#101828] transition hover:text-[#c8272e]"
              >
                <span className="text-3xl leading-none font-black tracking-normal italic">
                  BK
                </span>
                <span className="pb-0.5 text-sm font-black tracking-normal uppercase">
                  Games
                </span>
              </Link>
              <h1 className="mt-4 text-4xl leading-none font-black tracking-normal sm:text-5xl">
                Lobby
              </h1>
              <p className="mt-3 text-sm leading-6 font-bold break-words text-[#4b5874]">
                {userName} · {userEmail}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#071c3f] bg-[#fffaf0] px-5 text-sm font-black tracking-normal text-[#0b3b73] uppercase transition hover:-translate-y-0.5 hover:bg-[#d8ecff]"
              >
                <Home className="size-4" />
                Home
              </Link>
              <div className="[&_button]:h-11 [&_button]:rounded-md [&_button]:border-[#071c3f] [&_button]:bg-[#0b3b73] [&_button]:px-5 [&_button]:text-sm [&_button]:font-black [&_button]:tracking-normal [&_button]:text-white [&_button]:uppercase [&_button]:shadow-[0_5px_0_#071c3f] [&_button]:transition [&_button:hover]:-translate-y-0.5 [&_button:hover]:bg-[#c8272e] [&_button:hover]:shadow-[0_6px_0_#7d161b]">
                <SignOutButton />
              </div>
            </div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}

function RetroTexture() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-[0.34]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(11,59,115,0.22) 1px, transparent 0)",
        backgroundSize: "18px 18px",
      }}
    />
  );
}
