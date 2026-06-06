export type UserRole = "USER" | "ADMIN";

export const GAME_TOKEN_ISSUER = "bk-games-web";
export const GAME_TOKEN_AUDIENCE = "bk-games-game-server";
export const GAME_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;

export type GameTokenRole = "USER" | "ADMIN";

export type GameTokenPayload = {
  userId: string;
  nickname: string;
  role: GameTokenRole;
};
