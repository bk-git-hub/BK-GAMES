import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Club,
  Coins,
  Dumbbell,
  Gift,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Game = {
  description: string;
  href: string;
  image: "blackjack" | "derby" | "boxing";
  name: string;
  status: string;
};

const games: Game[] = [
  {
    description:
      "Real-time table rounds with multiplayer seats and live wallet updates.",
    href: "/blackjack",
    image: "blackjack",
    name: "Blackjack",
    status: "Open",
  },
  {
    description: "Track-side racing tickets, camera chase, and result boards.",
    href: "/racing/bk-derby",
    image: "derby",
    name: "BK Derby",
    status: "Open",
  },
  {
    description:
      "A broadcast-style fight preview for the next live game format.",
    href: "/boxing",
    image: "boxing",
    name: "Boxing",
    status: "Preview",
  },
];

const platformHighlights = [
  {
    description: "Daily points keep every session free to enter.",
    icon: Coins,
    title: "Free Points",
  },
  {
    description: "Shared rooms keep games moving in real time.",
    icon: Users,
    title: "Multiplayer",
  },
  {
    description: "Wallet changes stay clear and server-authoritative.",
    icon: BadgeCheck,
    title: "Fair Flow",
  },
];

const rewardHighlights = [
  {
    description: "Claim points and jump back into the game list.",
    icon: Gift,
    title: "Daily points",
  },
  {
    description: "Balances update with every accepted game action.",
    icon: WalletCards,
    title: "Wallet updates",
  },
  {
    description: "New game entries can plug into the same platform shell.",
    icon: Sparkles,
    title: "More games",
  },
];

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7efe2] text-[#111827]">
      <SiteHeader isSignedIn={Boolean(session)} />
      <HeroSection />
      <GamesSection />
      <RewardsSection />
    </main>
  );
}

function SiteHeader({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfcdb3] bg-[#fff8ed]/95 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="group flex items-end gap-2 text-[#101828]">
          <span className="text-4xl leading-none font-black tracking-normal italic transition group-hover:text-[#c8272e]">
            BK
          </span>
          <span className="pb-1 text-lg font-black tracking-normal uppercase">
            Games
          </span>
        </Link>

        <nav className="flex items-center gap-3 text-sm font-bold sm:gap-5">
          <Link
            href="/lobby"
            className="inline-flex h-11 items-center justify-center rounded-md border border-[#071c3f] bg-[#0b3b73] px-6 text-sm font-black tracking-normal text-white uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#c8272e] hover:shadow-[0_6px_0_#7d161b]"
          >
            Games
          </Link>
          {isSignedIn ? (
            <SignOutButton className="h-11 rounded-md border-[#071c3f] bg-[#fffaf0] px-5 text-sm font-black tracking-normal text-[#0b3b73] uppercase transition hover:-translate-y-0.5 hover:bg-[#d8ecff]">
              Logout
            </SignOutButton>
          ) : (
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-md border border-[#071c3f] bg-[#fffaf0] px-5 text-sm font-black tracking-normal text-[#0b3b73] uppercase transition hover:-translate-y-0.5 hover:bg-[#d8ecff]"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative border-b border-[#dfcdb3] bg-[#fff8ed]">
      <RetroTexture />
      <div className="mx-auto grid min-h-[640px] w-full max-w-[1440px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-12 lg:py-16">
        <div className="relative z-10 flex flex-col justify-center">
          <h1 className="max-w-[720px] text-[4.6rem] leading-[0.9] font-black tracking-normal text-[#111827] sm:text-[6.5rem] lg:text-[8.25rem]">
            BK Games
          </h1>
          <p className="mt-8 max-w-[520px] text-xl leading-9 text-[#24344d] sm:text-2xl">
            Free points. Real tables. Multiplayer rounds.
          </p>

          <div className="mt-12 grid max-w-[620px] gap-4 sm:grid-cols-3">
            {platformHighlights.map((item, index) => (
              <HighlightItem
                description={item.description}
                icon={item.icon}
                key={item.title}
                title={item.title}
                withDivider={index > 0}
              />
            ))}
          </div>
        </div>

        <PlatformPoster />
      </div>
    </section>
  );
}

function PlatformPoster() {
  return (
    <div className="relative z-10 flex min-h-[480px] items-center justify-center lg:min-h-[560px]">
      <div className="absolute top-[10%] left-[8%] h-24 w-24 rounded-full border-[14px] border-[#d6a848] bg-[#f5c95f] shadow-[0_12px_0_rgba(8,27,60,0.15)]" />
      <div className="absolute top-[8%] right-[3%] h-32 w-32 rounded-full bg-[#c8272e] shadow-[0_16px_0_rgba(8,27,60,0.13)]" />
      <div className="absolute bottom-[8%] left-[2%] h-28 w-28 rounded-full bg-[#8fc4e8] shadow-[0_14px_0_rgba(8,27,60,0.12)]" />

      <div className="relative w-full max-w-[700px] rotate-[-2deg] rounded-[2rem] border-[3px] border-[#101828] bg-[#fef4df] p-4 shadow-[16px_18px_0_#0b3b73]">
        <div className="rounded-[1.5rem] border border-[#d8c09a] bg-[#fffaf0] p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-[#dcc7a7] pb-4">
            <div>
              <p className="text-sm font-black tracking-normal text-[#c8272e] uppercase">
                BK Games
              </p>
              <p className="mt-1 text-2xl font-black text-[#101828]">
                Game board
              </p>
            </div>
            <div className="rounded-full border border-[#0b3b73] bg-[#d8ecff] px-4 py-2 text-sm font-black text-[#0b3b73]">
              Live
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_0.78fr]">
            <div className="grid gap-4">
              <MiniGamePanel game={games[0]} featured />
              <div className="grid grid-cols-2 gap-4">
                <MiniGamePanel game={games[1]} />
                <MiniGamePanel game={games[2]} />
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-[#d8c09a] bg-[#0b3b73] p-4 text-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black tracking-normal uppercase">
                  Wallet
                </span>
                <span className="rounded-full bg-[#f5c95f] px-3 py-1 text-xs font-black text-[#111827]">
                  8,920 P
                </span>
              </div>
              <div className="mt-8 grid gap-3">
                <ScoreBar label="Daily points" value="74%" />
                <ScoreBar label="Seat flow" value="58%" />
                <ScoreBar label="Rounds" value="86%" />
              </div>
              <div className="mt-7 rounded-2xl bg-[#071c3f] p-4">
                <p className="text-xs font-black tracking-normal text-[#8fc4e8] uppercase">
                  Status
                </p>
                <p className="mt-2 text-2xl font-black">Ready</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniGamePanel({
  featured = false,
  game,
}: {
  featured?: boolean;
  game: Game;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.25rem] border border-[#d8c09a] bg-white p-3",
        featured && "min-h-44",
      )}
    >
      <GameVisual game={game} compact={!featured} />
      <div className="relative z-10 mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#101828]">{game.name}</p>
          <p className="text-xs font-bold text-[#63708a]">{game.status}</p>
        </div>
        {featured ? (
          <Club className="size-5 text-[#c8272e]" />
        ) : (
          <Trophy className="size-5 text-[#0b3b73]" />
        )}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-[#d8ecff]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-[#f5c95f]"
          style={{ width: value }}
        />
      </div>
    </div>
  );
}

function GamesSection() {
  return (
    <section
      id="games"
      className="border-b border-[#dfcdb3] bg-[#f7efe2] px-5 py-16 sm:px-8 lg:px-12"
    >
      <div className="mx-auto w-full max-w-[1260px]">
        <div className="max-w-2xl">
          <div>
            <h2 className="text-4xl font-black tracking-normal text-[#111827] sm:text-5xl">
              Games
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#4b5874]">
              Pick from the current BK Games lineup and play with the same free
              points wallet.
            </p>
          </div>
        </div>

        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {games.map((game) => (
            <GameCard game={game} key={game.name} />
          ))}
        </div>
      </div>
    </section>
  );
}

function GameCard({ game }: { game: Game }) {
  return (
    <article className="group overflow-hidden rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fffaf0] shadow-[8px_9px_0_#0b3b73] transition hover:-translate-y-1 hover:shadow-[10px_12px_0_#c8272e]">
      <div className="border-b border-[#d8c09a] bg-white p-4">
        <GameVisual game={game} />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-2xl font-black tracking-normal text-[#111827]">
            {game.name}
          </h3>
          <span className="rounded-full border border-[#0b3b73] bg-[#d8ecff] px-3 py-1 text-xs font-black tracking-normal text-[#0b3b73] uppercase">
            {game.status}
          </span>
        </div>
        <p className="mt-3 min-h-16 text-sm leading-6 text-[#4b5874]">
          {game.description}
        </p>
        <Link
          href={game.href}
          className="mt-5 inline-flex items-center gap-2 text-sm font-black tracking-normal text-[#c8272e] uppercase transition group-hover:gap-3"
        >
          Open
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}

function GameVisual({
  compact = false,
  game,
}: {
  compact?: boolean;
  game: Game;
}) {
  const sizeClassName = compact ? "h-24" : "h-44";

  if (game.image === "blackjack") {
    return (
      <div
        className={cn(
          sizeClassName,
          "relative grid place-items-center overflow-hidden rounded-2xl bg-[#071c3f]",
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(216,236,255,0.28),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(200,39,46,0.38),transparent_28%)]" />
        <div className="relative flex items-center justify-center gap-2">
          <Image
            alt=""
            className={cn("h-auto w-20 rotate-[-8deg]", compact && "w-12")}
            height={588}
            src="/cards/royal-noir/AS.svg"
            width={420}
          />
          <Image
            alt=""
            className={cn("h-auto w-20 rotate-[8deg]", compact && "w-12")}
            height={588}
            src="/cards/royal-noir/KH.svg"
            width={420}
          />
        </div>
      </div>
    );
  }

  if (game.image === "derby") {
    return (
      <div
        className={cn(
          sizeClassName,
          "relative overflow-hidden rounded-2xl bg-[#c8272e]",
        )}
      >
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#f5c95f]" />
        <div className="absolute inset-x-0 bottom-[34%] h-1 bg-[#111827]/20" />
        <Image
          alt=""
          className={cn(
            "absolute top-1/2 left-1/2 z-10 h-auto w-[720%] max-w-none -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_16px_14px_rgba(7,28,63,0.42)]",
            compact && "w-[780%]",
          )}
          height={181}
          src="/racing/generated-reference-style/horse-01-red-gallop-7f.png"
          width={1442}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        sizeClassName,
        "relative grid place-items-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#c8272e_0_48%,#0b3b73_48%_100%)]",
      )}
    >
      <div className="absolute inset-4 rounded-2xl border border-white/35" />
      <div className="relative grid size-20 place-items-center rounded-full bg-[#fff8ed] text-[#0b3b73] shadow-[0_9px_0_rgba(7,28,63,0.25)]">
        <Dumbbell className={cn("size-10", compact && "size-8")} />
      </div>
    </div>
  );
}

function RewardsSection() {
  return (
    <section
      id="rewards"
      className="relative overflow-hidden bg-[#fff8ed] px-5 py-16 sm:px-8 lg:px-12"
    >
      <RetroTexture />
      <div className="relative z-10 mx-auto grid w-full max-w-[1260px] gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <h2 className="max-w-xl text-4xl font-black tracking-normal text-[#111827] sm:text-5xl">
            Free points keep the games moving.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-8 text-[#4b5874]">
            Rewards and wallet updates stay connected to the platform, so each
            game can focus on the moment-to-moment play.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {rewardHighlights.map((item) => (
            <div
              className="rounded-[1.2rem] border-[2px] border-[#111827] bg-[#f7efe2] p-5 shadow-[6px_7px_0_#c8272e]"
              key={item.title}
            >
              <div className="grid size-12 place-items-center rounded-full bg-[#0b3b73] text-white">
                <item.icon className="size-6" />
              </div>
              <h3 className="mt-5 text-lg font-black text-[#111827]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4b5874]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HighlightItem({
  description,
  icon: Icon,
  title,
  withDivider,
}: {
  description: string;
  icon: typeof Coins;
  title: string;
  withDivider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3",
        withDivider && "sm:border-l sm:border-[#d8c09a] sm:pl-5",
      )}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#c8272e] text-white shadow-[0_5px_0_#7d161b]">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-black text-[#111827]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#4b5874]">{description}</p>
      </div>
    </div>
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
