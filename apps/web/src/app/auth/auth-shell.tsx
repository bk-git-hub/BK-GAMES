import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Club,
  Gift,
  type LucideIcon,
  WalletCards,
} from "lucide-react";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7efe2] text-[#111827]">
      <RetroTexture />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-end gap-2 text-[#101828]">
            <span className="text-4xl leading-none font-black tracking-normal italic transition group-hover:text-[#c8272e]">
              BK
            </span>
            <span className="pb-1 text-lg font-black tracking-normal uppercase">
              Games
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#071c3f] bg-[#fff8ed] px-4 text-xs font-black tracking-normal text-[#071c3f] uppercase shadow-[0_4px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#d8ecff]"
            >
              <ArrowLeft className="size-4" />
              Home
            </Link>
            <Link
              href="/lobby"
              className="hidden h-10 items-center justify-center rounded-md border border-[#071c3f] bg-[#0b3b73] px-4 text-xs font-black tracking-normal text-white uppercase shadow-[0_4px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#c8272e] sm:inline-flex"
            >
              Games
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,440px)] lg:gap-12">
          <AuthPoster />
          <AuthPanel>{children}</AuthPanel>
        </section>
      </div>
    </main>
  );
}

function AuthPanel({ children }: AuthShellProps) {
  return <div className="order-1 w-full lg:order-2">{children}</div>;
}

function AuthPoster() {
  return (
    <section className="order-2 lg:order-1">
      <div className="relative overflow-hidden rounded-[1.35rem] border-[2px] border-[#111827] bg-[#0b3b73] p-5 text-white shadow-[8px_9px_0_#c8272e] sm:p-7">
        <div className="absolute inset-x-0 top-0 h-3 bg-[#c8272e]" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#071c3f] px-3 py-1 text-xs font-black tracking-normal text-[#d8ecff] uppercase">
            <Club className="size-3.5" />
            Account
          </div>
          <h1 className="mt-5 max-w-xl text-4xl leading-none font-black tracking-normal sm:text-6xl">
            Your table starts here.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 font-bold text-[#d8ecff]">
            Keep points, rewards, and seats connected under one BK Games
            account.
          </p>

          <div className="relative mt-8 min-h-64 overflow-hidden rounded-[1.1rem] border-[2px] border-[#111827] bg-[#fff8ed] p-5 shadow-[0_8px_0_#071c3f]">
            <div className="absolute inset-x-0 top-0 flex h-14 items-center justify-between bg-[#c8272e] px-5 text-sm font-black tracking-normal text-white uppercase">
              <span>BK Pass</span>
              <span>Free points</span>
            </div>
            <div className="absolute top-20 left-5 grid gap-3">
              <StatusPill icon={WalletCards} label="Wallet" />
              <StatusPill icon={Gift} label="Daily reward" />
            </div>
            <div className="absolute right-4 bottom-5 flex items-end justify-center gap-3">
              <Image
                alt=""
                className="h-auto w-24 rotate-[-9deg] drop-shadow-[0_14px_12px_rgba(7,28,63,0.28)] sm:w-28"
                height={588}
                priority
                src="/cards/royal-noir/AS.svg"
                width={420}
              />
              <Image
                alt=""
                className="h-auto w-24 rotate-[8deg] drop-shadow-[0_14px_12px_rgba(7,28,63,0.28)] sm:w-28"
                height={588}
                priority
                src="/cards/royal-noir/KH.svg"
                width={420}
              />
            </div>
            <div className="absolute bottom-5 left-5">
              <div className="grid size-20 place-items-center rounded-full border-[2px] border-[#111827] bg-[#d8ecff] text-lg font-black text-[#111827] shadow-[0_7px_0_#071c3f]">
                BK
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusPill({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#071c3f] bg-white px-3 py-2 text-xs font-black tracking-normal text-[#071c3f] uppercase">
      <Icon className="size-4 text-[#c8272e]" />
      {label}
    </span>
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
