import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Gift,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Game = {
  description: string;
  href: string;
  image: "blackjack" | "derby" | "baccarat";
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
    description: "Player, Banker, and Tie bets with server-revealed rounds.",
    href: "/baccarat",
    image: "baccarat",
    name: "Baccarat",
    status: "Open",
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

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7efe2] text-[#111827]">
      <SiteHeader />
      <GamesSection />
      <RewardsSection />
    </main>
  );
}

function SiteHeader() {
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
          <a
            href="#games"
            className="inline-flex h-11 items-center justify-center rounded-md border border-[#071c3f] bg-[#0b3b73] px-6 text-sm font-black tracking-normal text-white uppercase shadow-[0_5px_0_#071c3f] transition hover:-translate-y-0.5 hover:bg-[#c8272e] hover:shadow-[0_6px_0_#7d161b]"
          >
            Games
          </a>
        </nav>
      </div>
    </header>
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
    <Link
      href={game.href}
      className="group block overflow-hidden rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fffaf0] shadow-[8px_9px_0_#0b3b73] transition hover:-translate-y-1 hover:shadow-[10px_12px_0_#c8272e] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#c8272e]"
    >
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
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-black tracking-normal text-[#c8272e] uppercase transition group-hover:gap-3">
          Open
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
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
        "relative grid place-items-center overflow-hidden rounded-2xl bg-[#0b3b73]",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(216,236,255,0.32),transparent_32%),radial-gradient(circle_at_78%_70%,rgba(200,39,46,0.4),transparent_35%)]" />
      <div className="absolute inset-x-4 top-3 flex items-center justify-between text-[0.62rem] font-black tracking-normal text-[#d8ecff] uppercase">
        <span>Player</span>
        <span>Banker</span>
      </div>
      <div className="relative flex items-center justify-center gap-2">
        <Image
          alt=""
          className={cn("h-auto w-18 rotate-[-9deg]", compact && "w-11")}
          height={588}
          src="/cards/royal-noir/9D.svg"
          width={420}
        />
        <div className="grid size-12 place-items-center rounded-full border border-[#f5c95f] bg-[#fff8ed] text-xs font-black text-[#0b3b73] shadow-[0_7px_0_rgba(7,28,63,0.22)]">
          Tie
        </div>
        <Image
          alt=""
          className={cn("h-auto w-18 rotate-[9deg]", compact && "w-11")}
          height={588}
          src="/cards/royal-noir/8C.svg"
          width={420}
        />
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
