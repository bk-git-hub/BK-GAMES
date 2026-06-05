import { headers } from "next/headers";
import Link from "next/link";
import { ensureUserGameAccount } from "@bk-games/db";
import { LogIn } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";

const setupItems = [
  "Next.js web app",
  "NestJS game-server",
  "pnpm workspace",
  "Shared packages",
  "Better Auth route",
  "Profile and wallet bootstrap",
];

const nextItems = [
  "Wallet transaction service",
  "Daily reward claim",
  "First game: Blackjack engine",
  "Realtime table state machine",
];

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const gameAccount = session
    ? await ensureUserGameAccount({
        userId: session.user.id,
        displayName: session.user.name,
      })
    : null;
  const walletBalanceText = gameAccount?.wallet.balance.toString() ?? "0";

  return (
    <main className="bg-background text-foreground min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="flex flex-col gap-3">
          <Badge className="w-fit" variant="secondary">
            Initial setup
          </Badge>
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
              BK Games
            </h1>
            <p className="text-muted-foreground max-w-2xl text-base leading-7">
              무료 포인트 기반 멀티플레이 게임 플랫폼을 위한 모노레포
              워크스페이스입니다. 첫 게임은 실시간 블랙잭입니다.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {session ? session.user.name : "Guest"}
            </span>
            <span className="text-muted-foreground text-sm">
              {session
                ? `${session.user.email} · Wallet ready (${walletBalanceText} pts)`
                : "Sign in to start the table flow."}
            </span>
          </div>
          {session ? (
            <SignOutButton />
          ) : (
            <Link
              href="/auth"
              className={buttonVariants({ variant: "default" })}
            >
              <LogIn />
              Sign in
            </Link>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ready</CardTitle>
              <CardDescription>초기 프로젝트 세팅</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {setupItems.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="bg-primary size-2 rounded-full" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next</CardTitle>
              <CardDescription>문서 기준 다음 구현 순서</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {nextItems.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="bg-muted-foreground size-2 rounded-full" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
