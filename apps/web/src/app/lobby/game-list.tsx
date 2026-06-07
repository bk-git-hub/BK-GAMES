import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Club } from "lucide-react";

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
    name: "Blackjack",
    status: "Open",
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
        <CardDescription>Platform entries stay separate from game runtime.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {games.map((game) => (
          <article
            key={game.name}
            className="grid gap-4 rounded-lg border p-3 sm:grid-cols-[96px_1fr]"
          >
            <div className="flex min-h-28 items-center justify-center gap-1 rounded-md bg-neutral-950 p-3">
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
                href="/blackjack"
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
