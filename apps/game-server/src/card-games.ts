// Blackjack and baccarat are dormant unless this is exactly 'true'. A missing
// or mistyped value must leave them off, the same rule GAME_SOCKET_DEV_AUTH
// follows.
export function isCardGamesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CARD_GAMES_ENABLED === 'true';
}
