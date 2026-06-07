import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, DoorOpen, Gift, LogIn, Users, WalletCards } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";

const platformRows = [
  {
    description: "Socket tables keep seats, turns, and round events moving in real time.",
    icon: Users,
    title: "Realtime seats",
  },
  {
    description: "Daily rewards and table results update the point wallet without exposing private balances.",
    icon: WalletCards,
    title: "Private wallet flow",
  },
  {
    description: "Blackjack opens the platform, with room for more free-points games later.",
    icon: Gift,
    title: "Platform first",
  },
];

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="text-base font-semibold tracking-normal">
            BK Games
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-zinc-700 md:flex">
            <a href="#games" className="transition hover:text-zinc-950">
              Games
            </a>
            <a href="#rewards" className="transition hover:text-zinc-950">
              Rewards
            </a>
            {session ? (
              <Link href="/lobby" className="transition hover:text-zinc-950">
                Lobby
              </Link>
            ) : (
              <Link href="/auth" className="transition hover:text-zinc-950">
                Sign in
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <>
                <Link
                  href="/lobby"
                  className={buttonVariants({
                    className: "h-9 bg-zinc-950 px-3 text-white hover:bg-zinc-800",
                  })}
                >
                  <DoorOpen />
                  Enter lobby
                </Link>
                <div className="hidden sm:block">
                  <SignOutButton />
                </div>
              </>
            ) : (
              <Link
                href="/auth"
                className={buttonVariants({
                  className: "h-9 bg-zinc-950 px-3 text-white hover:bg-zinc-800",
                })}
              >
                <LogIn />
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="relative isolate flex min-h-[86svh] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_38%,#f7f7f4_38%,#f7f7f4_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[#0f5f49] sm:h-[34%]" />
        <div className="absolute -right-24 bottom-0 h-[46vw] max-h-[620px] min-h-[310px] w-[95vw] max-w-[1040px] rounded-[48%] border border-white/20 bg-[#0c4d3d] shadow-[0_40px_120px_rgba(15,95,73,0.3)] sm:-right-24 sm:bottom-8 sm:h-[42vw] sm:min-h-[340px] sm:w-[58vw] sm:max-w-[700px] lg:-right-8" />
        <div className="absolute -right-16 bottom-20 hidden h-[32vw] max-h-[380px] min-h-[240px] w-[50vw] max-w-[600px] rounded-[48%] border border-white/15 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.12),rgba(255,255,255,0)_58%)] lg:block" />
        <HeroCards />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center px-5 pb-24 pt-28 sm:px-8 lg:pb-28">
          <div className="max-w-2xl">
            <h1 className="text-6xl font-semibold leading-[0.94] tracking-normal text-zinc-950 sm:text-7xl">
              BK Games
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-700 sm:text-xl">
              A free-points game platform built for real-time tables, fair wallet
              flow, and multiplayer rounds.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={session ? "/lobby" : "/auth"}
                className={buttonVariants({
                  className: "h-11 bg-zinc-950 px-5 text-base text-white hover:bg-zinc-800",
                })}
              >
                {session ? <DoorOpen /> : <LogIn />}
                {session ? "Enter lobby" : "Sign in"}
              </Link>
              <Link
                href="#games"
                className={buttonVariants({
                  className:
                    "h-11 border-zinc-300 bg-white/70 px-5 text-base backdrop-blur hover:bg-white",
                  variant: "outline",
                })}
              >
                View games
                <ArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="games"
        className="border-b border-zinc-200 bg-white px-5 py-16 sm:px-8 lg:py-20"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-5">
            <h2 className="max-w-xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              First table: Blackjack
            </h2>
            <p className="max-w-xl text-base leading-7 text-zinc-600">
              The platform starts with one focused table experience: seats,
              betting windows, dealer cards, player actions, wallet updates, and
              round resets all flowing through the realtime game server.
            </p>
            <Link
              href={session ? "/blackjack" : "/auth"}
              className={buttonVariants({
                className: "mt-2 w-fit bg-zinc-950 text-white hover:bg-zinc-800",
              })}
            >
              Open blackjack
              <ArrowRight />
            </Link>
          </div>

          <div className="grid gap-3">
            {platformRows.map((row) => (
              <div
                className="grid gap-4 border-t border-zinc-200 py-5 sm:grid-cols-[40px_1fr]"
                key={row.title}
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-[#0f5f49] text-white">
                  <row.icon className="size-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">{row.title}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-zinc-600">
                    {row.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="rewards"
        className="bg-zinc-950 px-5 py-12 text-white sm:px-8"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-normal">
              Start with daily points, then play from the lobby.
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              BK Games keeps the landing page simple and sends signed-in players
              straight to the platform flow.
            </p>
          </div>
          <Link
            href={session ? "/lobby" : "/auth"}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "h-10 w-full bg-white text-zinc-950 hover:bg-zinc-200 sm:w-fit",
            )}
          >
            {session ? "Enter lobby" : "Create account"}
            <ArrowRight />
          </Link>
        </div>
      </section>
    </main>
  );
}

function HeroCards() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[44%] overflow-hidden sm:h-[56%]"
    >
      <div className="absolute bottom-[17%] right-[17%] hidden sm:block">
        <ChipStack />
      </div>
      <Image
        alt=""
        className="absolute bottom-[24%] right-[39%] hidden h-auto w-24 rotate-[-9deg] rounded-lg shadow-2xl md:block"
        height={588}
        src="/cards/royal-noir/AS.svg"
        width={420}
      />
      <Image
        alt=""
        className="absolute bottom-[18%] right-[28%] h-auto w-20 rotate-[8deg] rounded-lg shadow-2xl sm:bottom-[27%] sm:right-[31%] sm:w-28 lg:w-32"
        height={588}
        src="/cards/royal-noir/KH.svg"
        width={420}
      />
      <Image
        alt=""
        className="absolute bottom-[33%] right-[14%] h-auto w-16 rotate-[18deg] rounded-lg shadow-xl sm:bottom-[35%] sm:right-[20%] sm:w-24 lg:w-28"
        height={588}
        src="/cards/royal-noir/10S.svg"
        width={420}
      />
      <div className="absolute bottom-[18%] right-[5%] hidden h-20 w-40 rotate-[-8deg] rounded-full border border-white/30 bg-black/15 shadow-2xl backdrop-blur-sm lg:block" />
    </div>
  );
}

function ChipStack() {
  return (
    <div className="relative h-28 w-28">
      <div className="absolute left-3 top-12 size-16 rounded-full border-[10px] border-[#d8ac51] bg-zinc-950 shadow-xl" />
      <div className="absolute left-10 top-4 size-16 rounded-full border-[10px] border-white bg-[#9e262b] shadow-xl" />
      <div className="absolute left-0 top-1 size-14 rounded-full border-[9px] border-white bg-[#0f5f49] shadow-xl" />
    </div>
  );
}
