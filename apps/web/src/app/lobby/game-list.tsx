import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Club, Dumbbell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const games = [
  {
    description: "The first real-time table game for BK Games.",
    href: "/blackjack",
    kind: "cards",
    name: "Blackjack",
    status: "Open",
  },
  {
    description: "Live horse racing with tickets, camera chase, and results.",
    href: "/racing/bk-derby",
    kind: "derby",
    name: "BK Derby",
    status: "Open",
  },
  {
    description: "A preview of the live boxing broadcast table.",
    href: "/boxing",
    kind: "boxing",
    name: "Boxing",
    status: "Preview",
  },
];

export function GameList() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Club className="size-4" />
          <CardTitle>Games</CardTitle>
        </div>
        <CardDescription>
          Platform entries stay separate from game runtime.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {games.map((game) => (
          <article
            key={game.name}
            className="grid gap-4 rounded-lg border p-3 sm:grid-cols-[96px_1fr]"
          >
            <div className="flex min-h-28 items-center justify-center gap-1 rounded-md bg-neutral-950 p-3">
              {game.kind === "cards" ? (
                <>
                  <Image
                    alt=""
                    className="h-20 w-auto rotate-[-6deg]"
                    height={588}
                    src="/cards/royal-noir/AS.svg"
                    width={420}
                  />
                  <Image
                    alt=""
                    className="h-20 w-auto rotate-[6deg]"
                    height={588}
                    src="/cards/royal-noir/KH.svg"
                    width={420}
                  />
                </>
              ) : game.kind === "derby" ? (
                <div className="grid h-20 w-full place-items-center overflow-hidden rounded-md border border-emerald-200/30 bg-[linear-gradient(180deg,#134e4a_0_54%,#365314_54%_100%)] px-2">
                  <Image
                    alt=""
                    className="h-auto w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
                    height={181}
                    src="/racing/generated-reference-style/horse-01-red-gallop-7f.png"
                    width={1442}
                  />
                </div>
              ) : (
                <div className="grid h-20 w-full place-items-center rounded-md border border-amber-200/30 bg-[linear-gradient(135deg,#7f1d1d_0_48%,#0c4a6e_48%_100%)] text-amber-100">
                  <Dumbbell className="size-10" />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{game.name}</h2>
                  <Badge variant="secondary">{game.status}</Badge>
                </div>
                <p className="text-muted-foreground text-sm leading-6">
                  {game.description}
                </p>
              </div>
              <Link
                href={game.href}
                className={buttonVariants({
                  className: "w-full sm:w-fit",
                  variant: "default",
                })}
              >
                Open table
                <ArrowRight />
              </Link>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
