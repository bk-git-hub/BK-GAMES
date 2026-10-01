import { GameTableLoadingShell } from "../_loading/route-loading-shells";
import { isCardGamesEnabled } from "@/lib/card-games";

export default function Loading() {
  if (!isCardGamesEnabled()) {
    return null;
  }

  return <GameTableLoadingShell accent="blue" label="Blackjack table" />;
}
