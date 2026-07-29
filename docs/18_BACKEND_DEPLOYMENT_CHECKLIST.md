# Backend Deployment Checklist

이 문서는 BK Games 백엔드 배포 직전에 확인할 값을 정리한다.

현재 추천 배포 조합:

```text
Frontend: Vercel
Backend: Railway / Render / Fly 같은 always-on Node service
DB: Neon / Supabase / Railway PostgreSQL
Redis: MVP에서는 생략, multi-instance scale-out 시 도입
```

---

## 1. 사용자가 준비해야 하는 값

아래 값은 사용자가 각 서비스에서 생성하거나 복사해야 한다.

| 값 | 어디서 얻는가 | 어디에 넣는가 |
|---|---|---|
| PostgreSQL `DATABASE_URL` | Neon/Supabase/Railway DB 생성 후 connection string 복사 | web, game-server, db migration 환경 |
| `BETTER_AUTH_SECRET` | 긴 랜덤 문자열 생성 | web |
| `GAME_TOKEN_SECRET` | 긴 랜덤 문자열 생성 | web, game-server 모두 같은 값 |
| Frontend production URL | Vercel 배포 후 URL 확인 | web `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`; game-server CORS |
| Backend production URL | Railway/Render/Fly 배포 후 URL 확인 | web `NEXT_PUBLIC_GAME_SERVER_URL` |

secret은 Git에 커밋하지 않는다.

랜덤 secret 생성 예시:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Backend 환경변수

game-server 배포 환경에 넣을 값:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
GAME_TOKEN_SECRET=web과_같은_값
GAME_SOCKET_DEV_AUTH=false
GAME_SERVER_HOST=0.0.0.0
GAME_SERVER_CORS_ORIGINS=https://your-web.vercel.app
NEXT_PUBLIC_APP_URL=https://your-web.vercel.app
```

포트:

- Railway/Render/Fly 같은 PaaS는 보통 `PORT`를 자동으로 제공한다.
- `GAME_SERVER_PORT`가 있으면 그 값을 우선 사용한다.
- `GAME_SERVER_PORT`가 없으면 game-server는 `PORT`를 사용한다.
- 둘 다 없으면 로컬 기본값 `4000`을 사용한다.

---

## 3. Web 환경변수

Vercel web app에 넣을 값:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=긴_랜덤_값
BETTER_AUTH_URL=https://your-web.vercel.app
NEXT_PUBLIC_APP_URL=https://your-web.vercel.app
NEXT_PUBLIC_GAME_SERVER_URL=https://your-backend.up.railway.app
GAME_TOKEN_SECRET=backend와_같은_값
```

주의:

- `NEXT_PUBLIC_GAME_SERVER_URL`에는 `/blackjack`, `/baccarat`, `/racing` namespace를 붙이지 않는다.
- frontend socket client가 게임별 namespace를 붙인다.

---

## 4. DB 초기화 순서

배포 DB connection string을 `DATABASE_URL`로 설정한 뒤 실행한다.

```bash
corepack pnpm db:migrate
corepack pnpm --filter @bk-games/db seed:blackjack-main
corepack pnpm --filter @bk-games/db seed:baccarat-main
corepack pnpm --filter @bk-games/db seed:racing-main
```

seed는 main Blackjack, Baccarat, BK Derby 테이블과 기본 설정을 만든다.

---

## 5. Backend build/start 설정

backend service build command:

```bash
corepack pnpm --filter game-server build
```

backend service start command:

```bash
corepack pnpm --filter game-server start:prod
```

Railway 배포에서는 repository root의 `railway.json`이 위 build/start command와 `/health` health check를 고정한다.

health check:

```text
GET https://your-backend-url/health
```

---

## 6. 배포 후 smoke 확인

최소 확인:

```text
1. GET /health returns ok
2. web /auth sign-up or sign-in works
3. POST /api/game-token succeeds after login
4. /blackjack socket connects
5. /baccarat socket connects
6. /racing/bk-derby receives TABLE_STATE and RACE_TICK
7. wallet:updated is private and visible only to the acting user
```

로컬에서 deployed backend를 대상으로 racing socket smoke를 돌릴 때:

```bash
set GAME_SERVER_SMOKE_URL=https://your-backend-url
corepack pnpm --filter game-server smoke:racing-cycle
```

PowerShell:

```powershell
$env:GAME_SERVER_SMOKE_URL="https://your-backend-url"
corepack pnpm --filter game-server smoke:racing-cycle
```

---

## 7. 현재 MVP 배포 한계

현재 배포는 single game-server instance 기준이다.

운영 규모가 커질 때 필요한 후속 작업:

- Socket.IO Redis adapter
- multi-instance table state ownership strategy
- structured logging/error monitoring
- graceful shutdown and in-flight round recovery policy
- DB backup/restore runbook
- production admin authorization hardening
