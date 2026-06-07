import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureUserGameAccount } from "@bk-games/db";
import type { GameTokenRole } from "@bk-games/shared/src/types";
import { SignJWT } from "jose";

import { auth } from "@/lib/auth";

const gameTokenIssuer = "bk-games-web";
const gameTokenAudience = "bk-games-game-server";
const gameTokenExpiresInSeconds = 15 * 60;
const secretEncoder = new TextEncoder();

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const secret = process.env.GAME_TOKEN_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "GAME_TOKEN_SECRET is not configured." },
      { status: 500 },
    );
  }

  const gameAccount = await ensureUserGameAccount({
    userId: session.user.id,
    displayName: session.user.name,
  });
  const role: GameTokenRole =
    gameAccount.profile.role === "ADMIN" ? "ADMIN" : "USER";
  const nickname = session.user.name || session.user.email || "Player";
  const token = await new SignJWT({
    nickname,
    role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(gameTokenIssuer)
    .setAudience(gameTokenAudience)
    .setSubject(session.user.id)
    .setIssuedAt()
    .setExpirationTime(`${gameTokenExpiresInSeconds}s`)
    .sign(secretEncoder.encode(secret));

  return NextResponse.json({
    token,
    expiresInSeconds: gameTokenExpiresInSeconds,
    user: {
      id: session.user.id,
      nickname,
      role,
    },
  });
}
