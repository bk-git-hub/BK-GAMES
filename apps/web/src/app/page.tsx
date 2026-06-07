import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  Gift,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";

const proofItems = [
  {
    description: "No deposit. Play free.",
    icon: CircleDollarSign,
    title: "Free Points",
  },
  {
    description: "Real players, real time.",
    icon: Users,
    title: "Multiplayer",
  },
  {
    description: "Transparent and secure.",
    icon: ShieldCheck,
    title: "Fair Play",
  },
];

const tableFeatures = [
  {
    description: "Sit, bet, and play with real players in real time.",
    icon: Users,
    title: "Real-time seats",
  },
  {
    description: "Claim daily rewards and keep the games going.",
    icon: Gift,
    title: "Daily points",
  },
  {
    description: "Live wallet updates with every action.",
    icon: WalletCards,
    title: "Wallet updates",
  },
];

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const primaryHref = session ? "/lobby" : "/auth";

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-[1536px] items-center justify-between px-6 sm:px-10 lg:px-14">
          <Link href="/" className="flex items-end gap-2 text-zinc-950">
            <span className="text-4xl font-black italic leading-none tracking-tight">
              BK
            </span>
            <span className="pb-1 text-xl font-black uppercase tracking-tight">
              Games
            </span>
          </Link>

          <nav className="hidden items-center gap-12 text-base font-medium text-zinc-950 md:flex">
            <a href="#games" className="transition hover:text-[#0e6b3f]">
              Games
            </a>
            <a href="#rewards" className="transition hover:text-[#0e6b3f]">
              Rewards
            </a>
            <Link
              href={session ? "/lobby" : "/auth"}
              className="border-l border-zinc-200 pl-10 transition hover:text-[#0e6b3f]"
            >
              {session ? "Lobby" : "Sign in"}
            </Link>
          </nav>

          <Link
            href={primaryHref}
            className="inline-flex h-11 items-center justify-center rounded-md bg-[#0f6d3f] px-7 text-base font-semibold text-white shadow-sm transition hover:bg-[#0b5c35]"
          >
            Enter lobby
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-zinc-100 bg-white">
        <div className="mx-auto grid min-h-[620px] w-full max-w-[1536px] gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[560px_minmax(0,1fr)] lg:px-14 lg:py-0">
          <div className="relative z-10 flex flex-col justify-center pt-6 lg:pb-16">
            <h1 className="whitespace-nowrap text-6xl font-black leading-none tracking-tight sm:text-7xl lg:text-[6.9rem]">
              BK Games
            </h1>
            <p className="mt-8 max-w-[470px] text-xl leading-9 text-zinc-700">
              A free-points game platform built for real-time tables, fair wallet
              flow, and multiplayer rounds.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex h-14 min-w-56 items-center justify-center rounded-md bg-[#0f6d3f] px-8 text-lg font-semibold text-white shadow-sm transition hover:bg-[#0b5c35]"
              >
                Enter lobby
              </Link>
              <Link
                href={session ? "/lobby" : "/auth"}
                className="inline-flex h-14 min-w-44 items-center justify-center rounded-md border border-zinc-950 bg-white px-8 text-lg font-semibold text-zinc-950 transition hover:bg-zinc-50"
              >
                {session ? "Lobby" : "Sign in"}
              </Link>
            </div>

            <div className="mt-12 grid max-w-[520px] gap-5 sm:grid-cols-3">
              {proofItems.map((item, index) => (
                <div
                  className={cn(
                    "flex gap-3",
                    index > 0 && "sm:border-l sm:border-zinc-200 sm:pl-5",
                  )}
                  key={item.title}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d7a443] text-white">
                    <item.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[360px] lg:min-h-[620px]">
            <Image
              alt="BK Games blackjack table with cards and chips"
              className="mx-auto h-auto w-full max-w-[760px] object-contain lg:absolute lg:-right-20 lg:top-6 lg:w-[930px] lg:max-w-none xl:-right-20"
              height={610}
              priority
              src="/landing/blackjack-table-hero.png"
              width={916}
            />
          </div>
        </div>
      </section>

      <section
        id="games"
        className="border-b border-zinc-100 bg-white px-6 py-14 sm:px-10 lg:px-14"
      >
        <div className="mx-auto grid w-full max-w-[1268px] gap-8 lg:grid-cols-[360px_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              First table: Blackjack
            </h2>
            <p className="mt-3 max-w-sm text-base leading-7 text-zinc-600">
              Real-time blackjack with multiplayer seats, free points, and a
              fair wallet system.
            </p>
            <Link
              href={session ? "/blackjack" : "/auth"}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0f6d3f]"
            >
              Learn more about Blackjack
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {tableFeatures.map((feature, index) => (
              <div
                className={cn(
                  "grid gap-4 sm:grid-cols-[64px_1fr]",
                  index > 0 && "sm:border-l sm:border-zinc-200 sm:pl-8",
                )}
                key={feature.title}
              >
                <div className="flex size-14 items-center justify-center rounded-xl border border-zinc-200 text-[#0f6d3f]">
                  <feature.icon className="size-7" />
                </div>
                <div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="rewards"
        className="overflow-hidden bg-zinc-50 px-6 py-16 sm:px-10 lg:px-14"
      >
        <div className="mx-auto grid w-full max-w-[1268px] gap-8 lg:grid-cols-[1fr_520px] lg:items-end">
          <div>
            <h2 className="max-w-xl text-4xl font-bold tracking-tight">
              One platform. Many games.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">
              Blackjack is the first table. The platform structure keeps room
              for more free-points games without changing the core wallet and
              lobby flow.
            </p>
          </div>
          <div className="rounded-t-[2rem] border border-zinc-200 bg-zinc-950 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-xl font-black italic">
                BK <span className="text-sm not-italic">GAMES</span>
              </p>
              <span className="rounded-full bg-[#d7a443] px-3 py-1 text-xs font-bold text-zinc-950">
                8,920 P
              </span>
            </div>
            <div className="mt-8 h-28 rounded-2xl bg-[radial-gradient(circle_at_50%_0%,#156f49,#10251d_65%)]" />
          </div>
        </div>
      </section>
    </main>
  );
}
