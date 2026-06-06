import { createHmac } from 'node:crypto';
import { GameTokenService } from './game-token.service';

const gameTokenIssuer = 'bk-games-web';
const gameTokenAudience = 'bk-games-game-server';
const secret = 'test-game-token-secret-with-enough-length';

describe('GameTokenService', () => {
  const originalSecret = process.env.GAME_TOKEN_SECRET;
  const originalDevAuth = process.env.GAME_SOCKET_DEV_AUTH;

  beforeEach(() => {
    process.env.GAME_TOKEN_SECRET = secret;
    delete process.env.GAME_SOCKET_DEV_AUTH;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.GAME_TOKEN_SECRET;
    } else {
      process.env.GAME_TOKEN_SECRET = originalSecret;
    }

    if (originalDevAuth === undefined) {
      delete process.env.GAME_SOCKET_DEV_AUTH;
    } else {
      process.env.GAME_SOCKET_DEV_AUTH = originalDevAuth;
    }
  });

  it('verifies a valid game token', () => {
    const token = signTestToken({
      subject: 'user-1',
      nickname: 'Alice',
      role: 'USER',
    });
    const service = new GameTokenService();

    expect(service.verify(token)).toEqual({
      userId: 'user-1',
      nickname: 'Alice',
      role: 'USER',
    });
  });

  it('rejects tokens with the wrong audience', () => {
    const token = signTestToken({
      subject: 'user-1',
      nickname: 'Alice',
      role: 'USER',
      audience: 'wrong-audience',
    });
    const service = new GameTokenService();

    expect(service.verify(token)).toBeNull();
  });

  it('exposes explicit dev auth mode only when enabled', () => {
    expect(new GameTokenService().isDevAuthEnabled()).toBe(false);

    process.env.GAME_SOCKET_DEV_AUTH = 'true';

    expect(new GameTokenService().isDevAuthEnabled()).toBe(true);
  });
});

function signTestToken(input: {
  subject: string;
  nickname: string;
  role: 'USER' | 'ADMIN';
  audience?: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = encodeBase64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeBase64UrlJson({
    iss: gameTokenIssuer,
    aud: input.audience ?? gameTokenAudience,
    sub: input.subject,
    iat: now,
    exp: now + 15 * 60,
    nickname: input.nickname,
    role: input.role,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

function encodeBase64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
