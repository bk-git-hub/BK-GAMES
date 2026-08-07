import { Suspense } from "react";

import { GameList } from "./_home/game-list";
import {
  HomeAccountActions,
  HomeAccountReward,
  HomeIdentity,
  type HomeSearchParams,
} from "./_home/home-personalization";
import { HomeShell } from "./_home/home-shell";

type HomePageProps = {
  searchParams?: Promise<HomeSearchParams>;
};

export default function Home({ searchParams }: HomePageProps) {
  return (
    <HomeShell
      actions={
        <Suspense fallback={<HomeActionsFallback />}>
          <HomeAccountActions />
        </Suspense>
      }
      identity={
        <Suspense fallback={<HomeIdentityFallback />}>
          <HomeIdentity />
        </Suspense>
      }
    >
      <div className="flex flex-col gap-6">
        <Suspense fallback={<HomeRewardFallback />}>
          <HomeAccountReward searchParams={searchParams} />
        </Suspense>
        <GameList />
      </div>
    </HomeShell>
  );
}

function HomeIdentityFallback() {
  return (
    <div
      aria-hidden="true"
      className="mt-3 h-5 w-full max-w-md animate-pulse rounded-md bg-[#4b5874]/15 motion-reduce:animate-none"
    />
  );
}

function HomeActionsFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-11 w-28 animate-pulse rounded-md bg-[#0b3b73]/20 motion-reduce:animate-none"
    />
  );
}

function HomeRewardFallback() {
  return (
    <section
      aria-busy="true"
      className="overflow-hidden rounded-[1.35rem] border-2 border-[#111827] bg-[#0b3b73] text-white shadow-[8px_9px_0_#c8272e]"
    >
      <span className="sr-only" role="status">
        Loading player points
      </span>
      <div className="space-y-3 border-b border-white/15 p-5 sm:p-6">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-white/20 motion-reduce:animate-none" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <div className="h-32 animate-pulse rounded-[1.1rem] bg-white/10 motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-[1.1rem] bg-white/10 motion-reduce:animate-none" />
      </div>
    </section>
  );
}
