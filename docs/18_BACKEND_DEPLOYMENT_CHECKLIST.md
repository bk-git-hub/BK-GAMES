# Backend Deployment Checklist

이 문서는 BK Games 백엔드 배포 직전에 확인할 값을 정리한다.

배포 대상은 경마 전용 제품(BK Derby)이다. 블랙잭/바카라는 기본값으로 꺼져 있으며 이 체크리스트의 기본 경로에 포함되지 않는다.

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

선택 변수:

| 변수 | 운영 값 | 설명 |
|---|---|---|
| `CARD_GAMES_ENABLED` | 설정하지 않는다 | 값이 정확히 `true`일 때만 블랙잭/바카라가 켜진다. 비어 있거나 `TRUE`, `1`, `yes` 같은 값은 모두 꺼짐으로 처리한다. 경마 전용 제품에서는 game-server와 web 양쪽 모두 설정하지 않는다. |

되살려야 할 때는 `docs/archive/card-games/00_INDEX.md`의 절차를 따른다. game-server와 web에 같은 값을 넣어야 하고, web은 재배포가 필요하다.

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

- `NEXT_PUBLIC_GAME_SERVER_URL`에는 `/racing` 같은 namespace를 붙이지 않는다.
- frontend socket client가 namespace를 붙인다.
- `CARD_GAMES_ENABLED`는 web에도 설정하지 않는다. `NEXT_PUBLIC_` 변수로 만들지 않는다.

---

## 4. DB 초기화 순서

배포 DB connection string을 `DATABASE_URL`로 설정한 뒤 실행한다.

```bash
corepack pnpm db:migrate
corepack pnpm --filter @bk-games/db seed:racing-main
```

seed는 main BK Derby 테이블과 기본 설정을 만든다.

migration은 꺼져 있는 블랙잭/바카라 테이블도 함께 만든다. 테이블 정의와 migration은 되살릴 수 있도록 남겨 둔 것이므로 지우지 않는다. 두 게임의 seed(`seed:blackjack-main`, `seed:baccarat-main`)는 기본 경로에서 실행하지 않으며, 스위치가 꺼져 있으면 실행해도 거부된다.

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
4. /racing/bk-derby receives TABLE_STATE and RACE_TICK
5. wallet:updated is private and visible only to the acting user
6. GET /blackjack/tables returns 404 (card games stay off)
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

주의: 이 smoke는 game token을 보내지 않으므로 운영 환경변수(`GAME_SOCKET_DEV_AUTH=false`)로 떠 있는 backend를 대상으로는 통과할 수 없다. local 검증용이며, 운영 backend의 `GAME_SOCKET_DEV_AUTH`는 꺼 둔 채로 둔다.

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
