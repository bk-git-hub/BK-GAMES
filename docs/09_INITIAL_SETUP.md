# Initial Setup

NestJS game-server를 포함한 모노레포 기준 프로젝트 생성 순서다.

---

## 1. 루트 생성

```bash
mkdir bk-games
cd bk-games
pnpm init
```

---

## 2. pnpm workspace

`pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 3. 루트 개발 도구

```bash
pnpm add -D -w turbo typescript prettier prettier-plugin-tailwindcss eslint
```

---

## 4. web 앱 생성

```bash
mkdir apps
cd apps
pnpm create next-app@latest web --yes
cd ..
```

web 앱 패키지 설치:

```bash
pnpm --filter web add better-auth
pnpm --filter web add zod jose
pnpm --filter web add @tanstack/react-query @tanstack/react-query-devtools
pnpm --filter web add zustand
pnpm --filter web add lucide-react
pnpm --filter web add socket.io-client
```

shadcn/ui:

```bash
pnpm --filter web dlx shadcn@latest init
pnpm --filter web dlx shadcn@latest add button card input label dialog tabs table badge separator sonner
```

---

## 5. game-server 앱 생성

NestJS 앱을 `apps/game-server`에 만든다.

```bash
cd apps
pnpm dlx @nestjs/cli new game-server --package-manager pnpm --skip-git
cd ..
```

game-server 패키지 설치:

```bash
pnpm --filter game-server add @nestjs/websockets @nestjs/platform-socket.io socket.io
pnpm --filter game-server add zod jose dotenv
pnpm --filter game-server add -D tsx
```

MVP에서는 Nest 기본 HTTP adapter를 그대로 사용한다.  
Fastify adapter는 초기에는 넣지 않는다.

---

## 6. packages 생성

```bash
mkdir -p packages/db/src
mkdir -p packages/game-engine/src/blackjack
mkdir -p packages/shared/src
```

각 package에 `package.json`을 만든다.

예시:

```json
{
  "name": "@bk-games/game-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 7. DB 패키지 설치

```bash
pnpm --filter @bk-games/db add drizzle-orm pg
pnpm --filter @bk-games/db add -D drizzle-kit @types/pg dotenv typescript
```

---

## 8. shared/game-engine 설치

```bash
pnpm --filter @bk-games/shared add zod
pnpm --filter @bk-games/shared add -D typescript
pnpm --filter @bk-games/game-engine add zod
pnpm --filter @bk-games/game-engine add -D vitest typescript
```

---

## 9. 의존성 연결

web과 game-server에서 workspace package를 사용한다.

```bash
pnpm --filter web add @bk-games/shared@workspace:* @bk-games/db@workspace:*
pnpm --filter game-server add @bk-games/shared@workspace:* @bk-games/db@workspace:* @bk-games/game-engine@workspace:*
```

---

## 10. game-server Nest 구조

초기 구조:

```text
apps/game-server/src/
├─ main.ts
├─ app.module.ts
├─ auth/
│  ├─ auth.module.ts
│  ├─ game-token.service.ts
│  └─ socket-auth.guard.ts
├─ blackjack/
│  ├─ blackjack.module.ts
│  ├─ blackjack.gateway.ts
│  ├─ blackjack-table.service.ts
│  ├─ blackjack-round.service.ts
│  └─ blackjack-settlement.service.ts
├─ wallet/
│  ├─ wallet.module.ts
│  └─ wallet.service.ts
└─ health/
   └─ health.controller.ts
```

---

## 11. 루트 scripts 후보

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "db:generate": "pnpm --filter @bk-games/db db:generate",
    "db:migrate": "pnpm --filter @bk-games/db db:migrate",
    "db:studio": "pnpm --filter @bk-games/db db:studio"
  }
}
```

---

## 12. dev 포트

| 앱 | 포트 |
|---|---:|
| web | 3000 |
| game-server | 4000 |

환경 변수:

```text
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:4000/blackjack
GAME_SERVER_PORT=4000
DATABASE_URL=postgresql://postgres:<local-password>@localhost:5432/bk_games
BETTER_AUTH_SECRET=<replace-me>
BETTER_AUTH_URL=http://localhost:3000
GAME_TOKEN_SECRET=<replace-me>
```

---

## 13. 첫 검증

```bash
pnpm install
pnpm dev
```

기대:

- web: http://localhost:3000
- game-server: http://localhost:4000/health
- Socket namespace: http://localhost:4000/blackjack
