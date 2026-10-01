import { Suspense } from "react";
import { notFound } from "next/navigation";

import { BlackjackTableClient } from "./blackjack-table-client";
import { getAuthenticatedGameEntry } from "../_games/authenticated-game-entry";
import { GameTableLoadingShell } from "../_loading/route-loading-shells";
import { isCardGamesEnabled } from "@/lib/card-games";

export default function BlackjackPage() {
  // Ahead of the Suspense boundary so a disabled build never prerenders the
  // labelled table shell.
  if (!isCardGamesEnabled()) {
    notFound();
  }

  return (
    <Suspense
      fallback={<GameTableLoadingShell accent="blue" label="Blackjack table" />}
    >
      <AuthenticatedBlackjack />
    </Suspense>
  );
}

async function AuthenticatedBlackjack() {
  const entry = await getAuthenticatedGameEntry();

  return <BlackjackTableClient {...entry} />;
}
