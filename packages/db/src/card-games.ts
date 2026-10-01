export type CardGamesDisabledErrorCode = "CARD_GAMES_DISABLED";

export class CardGamesDisabledError extends Error {
  readonly code: CardGamesDisabledErrorCode;

  constructor() {
    super(
      "Blackjack and baccarat are disabled (CARD_GAMES_ENABLED is not true).",
    );
    this.code = "CARD_GAMES_DISABLED";
    this.name = "CardGamesDisabledError";
  }
}

// Fails closed: only the exact string "true" enables the card games, so an
// unset, empty, or mistyped value leaves blackjack and baccarat switched off.
export function isCardGamesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CARD_GAMES_ENABLED === "true";
}

// Called first in every entry point that reads or writes blackjack_* or
// baccarat_* tables, before a pool connection is checked out, so a disabled
// deployment makes no card-game database round trips.
export function assertCardGamesEnabled(): void {
  if (!isCardGamesEnabled()) {
    throw new CardGamesDisabledError();
  }
}
