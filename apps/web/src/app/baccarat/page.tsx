import { Suspense } from "react";
import { notFound } from "next/navigation";

import { BaccaratTableClient } from "./baccarat-table-client";
import { getAuthenticatedGameEntry } from "../_games/authenticated-game-entry";
import { GameTableLoadingShell } from "../_loading/route-loading-shells";
import { isCardGamesEnabled } from "@/lib/card-games";

export default function BaccaratPage() {
  // Ahead of the Suspense boundary so a disabled build never prerenders the
  // labelled table shell.
  if (!isCardGamesEnabled()) {
    notFound();
  }

  return (
    <Suspense
      fallback={<GameTableLoadingShell accent="red" label="Baccarat table" />}
    >
      <AuthenticatedBaccarat />
    </Suspense>
  );
}

async function AuthenticatedBaccarat() {
  const entry = await getAuthenticatedGameEntry();

  return <BaccaratTableClient {...entry} />;
}
