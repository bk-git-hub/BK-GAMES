import "server-only";

// Blackjack and baccarat stay dormant unless this is exactly "true"; an unset,
// empty, or mistyped value must leave them off. Read per call so the proxy and
// route handlers follow the running environment, while prerendered output
// keeps the value seen at build time.
export function isCardGamesEnabled(): boolean {
  return process.env.CARD_GAMES_ENABLED === "true";
}

// Same body shape as adminErrorResponse, and no hint that a switch exists.
export const cardGamesNotFoundBody = {
  error: { code: "NOT_FOUND", message: "Not found." },
} as const;
