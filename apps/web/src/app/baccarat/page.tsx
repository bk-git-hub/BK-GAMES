import { Suspense } from "react";

import { BaccaratTableClient } from "./baccarat-table-client";
import { getAuthenticatedGameEntry } from "../_games/authenticated-game-entry";
import { GameTableLoadingShell } from "../_loading/route-loading-shells";

export default function BaccaratPage() {
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
