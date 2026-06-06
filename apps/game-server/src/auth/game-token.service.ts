import { Injectable } from '@nestjs/common';
import type { GameTokenPayload } from '@bk-games/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';

const gameTokenIssuer = 'bk-games-web';
const gameTokenAudience = 'bk-games-game-server';

@Injectable()
export class GameTokenService {
  private readonly secret = process.env.GAME_TOKEN_SECRET;
  private readonly devAuthEnabled = process.env.GAME_SOCKET_DEV_AUTH === 'true';

  verify(token: string): GameTokenPayload | null {
    const trimmedToken = token.trim();

    if (!trimmedToken || !this.secret) {
      return null;
    }

    try {
      const payload = verifyHs256Jwt(trimmedToken, this.secret);
      const userId = payload.sub;
      const nickname = payload.nickname;
      const role = payload.role;

      if (
        typeof userId !== 'string' ||
        !userId.trim() ||
        typeof nickname !== 'string' ||
        !nickname.trim() ||
        (role !== 'USER' && role !== 'ADMIN')
      ) {
        return null;
      }

      return {
        userId: userId.trim(),
        nickname: nickname.trim(),
        role,
      };
    } catch {
      return null;
    }
  }

  isDevAuthEnabled() {
    return this.devAuthEnabled;
  }
}

type JwtHeader = {
  alg?: unknown;
  typ?: unknown;
};

type JwtPayload = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  nickname?: unknown;
  role?: unknown;
};

function verifyHs256Jwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT compact serialization.');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  if (!safeEqual(signature, expectedSignature)) {
    throw new Error('Invalid JWT signature.');
  }

  const header = parseBase64UrlJson<JwtHeader>(encodedHeader);

  if (header.alg !== 'HS256') {
    throw new Error('Unsupported JWT algorithm.');
  }

  const payload = parseBase64UrlJson<JwtPayload>(encodedPayload);

  if (payload.iss !== gameTokenIssuer) {
    throw new Error('Invalid JWT issuer.');
  }

  if (!matchesAudience(payload.aud)) {
    throw new Error('Invalid JWT audience.');
  }

  if (typeof payload.exp !== 'number' || payload.exp <= unixNow()) {
    throw new Error('Expired JWT.');
  }

  return payload;
}

function parseBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function matchesAudience(audience: unknown) {
  return Array.isArray(audience)
    ? audience.includes(gameTokenAudience)
    : audience === gameTokenAudience;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}
