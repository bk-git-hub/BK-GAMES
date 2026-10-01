import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Club, Flag } from "lucide-react";

import { isCardGamesEnabled } from "@/lib/card-games";
import { cn } from "@/lib/utils";

type Game = {
  description: string;
  href: string;
  kind: "cards" | "derby" | "baccarat";
  name: string;
  status: string;
};

type FeatureRunner = {
  className: string;
  frameClassName: string;
  src: string;
};

const games: Game[] = [
  {
    description: "Track-side racing tickets, camera chase, and result boards.",
    href: "/racing/bk-derby",
    kind: "derby",
    name: "BK Derby",
    status: "Open",
  },
  {
    description:
      "Real-time table rounds with multiplayer seats and live wallet updates.",
    href: "/blackjack",
    kind: "cards",
    name: "Blackjack",
    status: "Open",
  },
  {
    description:
      "Player, Banker, and Tie bets with server-revealed rounds.",
    href: "/baccarat",
    kind: "baccarat",
    name: "Baccarat",
    status: "Open",
  },
];

// Each strip holds seven 206x181 gallop frames. frameClassName picks a frame
// its neighbours do not bleed into, and the bottom offsets land every runner
// on the turf although the strips draw their horses at different heights.
const featureRunners: FeatureRunner[] = [
  {
    className: "bottom-[18%] left-[4%] h-[40%] sm:bottom-[16%] sm:h-[50%]",
    frameClassName: "left-[-100%]",
    src: "/racing/generated-reference-style/horse-04-yellow-gallop-7f.png",
  },
  {
    className: "bottom-[8%] left-[27%] hidden h-[60%] sm:block",
    frameClassName: "left-[-100%]",
    src: "/racing/generated-reference-style/horse-03-blue-gallop-7f.png",
  },
  {
    className: "right-[4%] bottom-[4%] h-[58%] sm:bottom-[3%] sm:h-[72%]",
    frameClassName: "left-[-400%]",
    src: "/racing/generated-reference-style/horse-01-red-gallop-7f.png",
  },
];

export function GameList() {
  // The card games stay listed for revival; the switch decides what renders,
  // and a lone game gets a featured card instead of a sparse three-column grid.
  const visibleGames = isCardGamesEnabled()
    ? games
    : games.filter((game) => game.kind === "derby");
  const isFeatured = visibleGames.length === 1;
  const HeadingIcon = isFeatured ? Flag : Club;

  return (
    <section className="rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fff8ed] p-5 shadow-[8px_9px_0_#0b3b73] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HeadingIcon className="size-5 text-[#c8272e]" />
            <h2 className="text-3xl font-black tracking-normal text-[#111827]">
              {isFeatured ? "Live racing" : "Games"}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 font-bold text-[#4b5874]">
            {isFeatured
              ? "Head to the track and play with your free points wallet."
              : "Pick a game and play with the same free points wallet."}
          </p>
        </div>
      </div>

      <div className={cn("mt-6 grid gap-5", !isFeatured && "lg:grid-cols-3")}>
        {visibleGames.map((game) => (
          <GameCard featured={isFeatured} game={game} key={game.name} />
        ))}
      </div>
    </section>
  );
}

function GameCard({ featured, game }: { featured: boolean; game: Game }) {
  return (
    <Link
      href={game.href}
      className={cn(
        "group block overflow-hidden rounded-[1.25rem] border-[2px] border-[#111827] bg-[#fffaf0] shadow-[6px_7px_0_#0b3b73] transition hover:-translate-y-1 hover:shadow-[8px_10px_0_#c8272e] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#c8272e]",
        featured && "lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]",
      )}
    >
      <div
        className={cn(
          "border-b border-[#d8c09a] bg-white p-4",
          featured && "lg:border-r lg:border-b-0",
        )}
      >
        <GameVisual featured={featured} game={game} />
      </div>
      <div
        className={cn(
          "p-5",
          featured && "lg:flex lg:flex-col lg:justify-center lg:p-8",
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-2xl font-black tracking-normal text-[#111827]">
            {game.name}
          </h3>
          <span className="rounded-full border border-[#0b3b73] bg-[#d8ecff] px-3 py-1 text-xs font-black tracking-normal text-[#0b3b73] uppercase">
            {game.status}
          </span>
        </div>
        <p
          className={cn(
            "mt-3",
            !featured && "min-h-16",
            "text-sm leading-6 text-[#4b5874]",
          )}
        >
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

function GameVisual({ featured, game }: { featured: boolean; game: Game }) {
  if (game.kind === "cards") {
    return (
      <div className="relative grid h-44 place-items-center overflow-hidden rounded-2xl bg-[#071c3f]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(216,236,255,0.28),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(200,39,46,0.38),transparent_28%)]" />
        <div className="relative flex items-center justify-center gap-2">
          <Image
            alt=""
            className="h-auto w-20 rotate-[-8deg]"
            height={588}
            src="/cards/royal-noir/AS.svg"
            width={420}
          />
          <Image
            alt=""
            className="h-auto w-20 rotate-[8deg]"
            height={588}
            src="/cards/royal-noir/KH.svg"
            width={420}
          />
        </div>
      </div>
    );
  }

  if (game.kind === "derby" && featured) {
    return (
      <div className="relative h-52 overflow-hidden rounded-2xl bg-[#c8272e] sm:h-60 lg:h-64">
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#f5c95f]" />
        <div className="absolute inset-x-0 bottom-[34%] h-1 bg-[#111827]/20" />
        {featureRunners.map((runner) => (
          <div
            className={cn(
              "absolute aspect-[206/181] overflow-hidden drop-shadow-[0_12px_10px_rgba(7,28,63,0.38)]",
              runner.className,
            )}
            key={runner.src}
          >
            <Image
              alt=""
              className={cn(
                "absolute top-0 h-full w-[700%] max-w-none",
                runner.frameClassName,
              )}
              height={181}
              src={runner.src}
              width={1442}
            />
          </div>
        ))}
      </div>
    );
  }

  if (game.kind === "derby") {
    return (
      <div className="relative h-44 overflow-hidden rounded-2xl bg-[#c8272e]">
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#f5c95f]" />
        <div className="absolute inset-x-0 bottom-[34%] h-1 bg-[#111827]/20" />
        <Image
          alt=""
          className="absolute top-1/2 left-1/2 z-10 h-auto w-[720%] max-w-none -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_16px_14px_rgba(7,28,63,0.42)]"
          height={181}
          src="/racing/generated-reference-style/horse-01-red-gallop-7f.png"
          width={1442}
        />
      </div>
    );
  }

  return (
    <div className="relative grid h-44 place-items-center overflow-hidden rounded-2xl bg-[#0b3b73]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(216,236,255,0.32),transparent_32%),radial-gradient(circle_at_78%_70%,rgba(200,39,46,0.4),transparent_35%)]" />
      <div className="absolute inset-x-4 top-3 flex items-center justify-between text-[0.62rem] font-black tracking-normal text-[#d8ecff] uppercase">
        <span>Player</span>
        <span>Banker</span>
      </div>
      <div className="relative flex items-center justify-center gap-2">
        <Image
          alt=""
          className="h-auto w-18 rotate-[-9deg]"
          height={588}
          src="/cards/royal-noir/9D.svg"
          width={420}
        />
        <div className="grid size-12 place-items-center rounded-full border border-[#f5c95f] bg-[#fff8ed] text-xs font-black text-[#0b3b73] shadow-[0_7px_0_rgba(7,28,63,0.22)]">
          Tie
        </div>
        <Image
          alt=""
          className="h-auto w-18 rotate-[9deg]"
          height={588}
          src="/cards/royal-noir/8C.svg"
          width={420}
        />
      </div>
    </div>
  );
}
