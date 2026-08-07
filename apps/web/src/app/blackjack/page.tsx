import { Suspense } from "react";

import { BlackjackTableClient } from "./blackjack-table-client";
import { getAuthenticatedGameEntry } from "../_games/authenticated-game-entry";
import { GameTableLoadingShell } from "../_loading/route-loading-shells";

export default function BlackjackPage() {
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
