# Backend Technical Overview

이 문서는 BK Games 백엔드 구현을 포트폴리오/면접 설명에 연결하기 위한 현재 기준 문서다.

현재 운영 라인업은 실시간 경마 BK Derby 하나다. `docs/15_HORSE_RACING_BACKEND_SPEC.md`는 구현 전에 쓴 설계 스펙이며, 실제 구현과 다른 부분은 코드와 이 문서가 우선한다. 이 문서는 상세 룰보다 다음 질문에 답하는 것을 목표로 한다.

```text
어떤 백엔드 구조를 선택했는가?
왜 그렇게 나누었는가?
포인트 변경, 실시간 상태, 정산, 재접속, 검증은 어떻게 안전하게 처리하는가?
이력서에 적을 수 있는 기술 성과는 실제 구현과 맞는가?
```

블랙잭과 바카라는 코드와 DB 테이블을 남긴 채 `CARD_GAMES_ENABLED` 스위치 뒤에서 기본값으로 꺼져 있다. 두 게임의 구현 설명은 `docs/archive/card-games/17_BACKEND_OVERVIEW_CARD_GAMES.md`로 옮겼고, 되살리는 절차는 `docs/archive/card-games/00_INDEX.md`에 있다.

---

## 1. 현재 백엔드 요약

BK Games는 무료 포인트 기반 실시간 게임 플랫폼이다.

핵심 구조는 다음과 같다.

```text
apps/web
  Next.js app, Better Auth session, web-facing API route

apps/game-server
  NestJS + Socket.IO realtime game server

packages/shared
  socket event names, API response types, client/server shared contracts, deterministic racing simulation

packages/db
  PostgreSQL schema, Drizzle queries, wallet/ledger transaction helpers, seed/smoke scripts

packages/game-engine
  pure deterministic game-domain logic (현재 운영 경로에서는 사용하지 않는다)
```

중요한 원칙:

- 클라이언트는 화면을 렌더링하고 명령을 보낸다.
- 게임 서버가 테이블 상태, 타이머, 베팅 가능 여부, 레이스 진행, 최종 결과를 결정한다.
- 포인트 증감은 `packages/db`의 transaction helper를 통해서만 처리한다.
- 포인트 변경은 `wallets.balance`와 `point_ledgers`를 같은 DB transaction 안에서 갱신한다.
- 사용자별 잔액 변경은 public table room이 아니라 private user room/socket으로만 보낸다.

---

## 2. 기술 스택

| 영역 | 사용 기술 | 선택 이유 |
|---|---|---|
| Web | Next.js App Router, React, TypeScript | 인증 UI, 라우팅, 프론트 화면, web-facing API route 처리 |
| Realtime server | NestJS, Socket.IO | long-running WebSocket 서버, namespace/room, gateway/service 구조 분리 |
| DB | PostgreSQL | 지갑, 원장, 게임 결과, 히스토리처럼 정합성이 필요한 영속 데이터 저장 |
| ORM/query | Drizzle ORM | TypeScript schema와 SQL transaction helper를 코드 가까이에 유지 |
| Auth | Better Auth | PostgreSQL-backed session, Drizzle adapter, Next.js auth route 통합 |
| Game token | jose JWT | web session을 game-server socket identity로 안전하게 bridge |
| Shared contract | TypeScript shared package | 프론트/서버 socket payload와 API response type 불일치 감소 |
| Race simulation | `packages/shared/src/racing-simulation.ts` pure functions | DB/socket 없이 seed 기반 레이스 계산을 재현 가능하게 분리 |
| Test | Jest, Vitest, node:test, smoke scripts | game-server service/gateway, pure engine, DB client, DB transaction path 검증 |
| Local infra | Docker Compose PostgreSQL | 로컬 DB 개발/검증 환경 구성 |

Redis는 현재 MVP 필수 구성에 넣지 않았다.

도입 기준:

- game-server를 여러 인스턴스로 scale-out해야 할 때
- Socket.IO Redis adapter가 필요할 때
- table state/timer ownership을 단일 process memory에서 분리해야 할 때
- rate limit, presence, distributed lock 등 별도 shared runtime state가 필요할 때

---

## 3. 왜 Next.js 단일 앱이 아닌가

Next.js 단일 앱은 화면과 HTTP API 중심으로는 충분하지만, BK Games의 핵심은 실시간 테이블이다.

실시간 게임 서버에는 다음 책임이 있다.

- Socket.IO connection 유지
- namespace/room 관리
- table state broadcast
- private wallet event emit
- betting/prestart/race/result timer 관리
- reconnect snapshot 제공
- 서버 권위 상태 전환
- DB settlement handoff

이 책임들은 serverless request/response 모델보다 long-running process에 더 적합하다.

따라서 구조를 다음처럼 분리했다.

```text
Next.js
  browser session, auth route, frontend, game token issue

NestJS game-server
  socket auth, realtime table lifecycle, game commands, settlement orchestration

PostgreSQL
  durable account/wallet/ledger/game records
```

면접 설명:

```text
실시간 테이블 게임은 WebSocket 연결, 타이머, room broadcast, private event, reconnect state를 계속 유지해야 했기 때문에 Next.js 단일 앱이 아니라 Next.js 웹 앱과 NestJS Socket.IO 게임 서버를 분리했습니다.
```

---

## 4. 인증과 게임 서버 연결

Better Auth는 web app이 소유한다.

게임 서버는 브라우저가 보낸 `userId`를 신뢰하지 않는다. 대신 다음 흐름을 사용한다.

```text
1. 사용자가 Better Auth session으로 로그인한다.
2. 브라우저가 Next.js route인 POST /api/game-token을 호출한다.
3. Next.js route가 server-side session을 확인한다.
4. user_profiles / wallets bootstrap을 보장한다.
5. short-lived game token을 발급한다.
6. Socket.IO client가 handshake.auth.token으로 game-server에 연결한다.
7. game-server가 issuer, audience, expiration, signature, user identity를 검증한다.
8. 이후 socket command는 verified socket user를 기준으로 처리한다.
```

이 구조의 장점:

- 로그인/session 관리는 web app에 모은다.
- game-server는 auth UI나 browser cookie 처리에 묶이지 않는다.
- socket payload의 `userId` 조작 위험을 줄인다.
- wallet/ledger transaction은 verified user identity를 기준으로 실행된다.

관련 문서:

- `AUTH_STRUCTURE.md`
- `docs/02_ARCHITECTURE.md`
- `docs/11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`

---

## 5. Wallet, Ledger, Transaction

BK Games에서 포인트는 현금성 재화가 아니라 무료 플레이 포인트다. 그래도 데이터 정합성은 실제 서비스처럼 엄격하게 다룬다.

핵심 모델:

```text
wallets.balance
  현재 잔액 캐시

point_ledgers
  append-only 포인트 변경 이력
```

포인트 변경 transaction의 기본 흐름:

```text
begin transaction
  기존 ledger를 userId + idempotencyKey로 먼저 확인
  wallet row를 select ... for update로 lock
  lock 이후 idempotency를 다시 확인
  wallet status와 잔액 조건 검증
  point_ledgers insert
  wallets.balance / version update
commit
```

왜 이렇게 하는가:

- 같은 command가 네트워크 재시도로 여러 번 들어와도 한 번만 반영하기 위해서
- 동시에 여러 포인트 차감 요청이 들어와도 wallet row lock으로 잔액 계산을 직렬화하기 위해서
- 정산/환불 재실행이 있어도 `idempotencyKey`와 ledger reference로 중복 지급을 막기 위해서

주의:

- 패배 결과에는 별도 `LOSE` ledger를 만들지 않는다. 포인트는 bet accepted 시 이미 차감되었기 때문이다.
- 적중 배당(`PAYOUT`)과 취소 환불(`CANCEL_REFUND`)처럼 실제 포인트가 증가하는 경우에만 credit ledger를 만든다.
- public table state에는 다른 사용자의 wallet balance를 넣지 않는다.

면접 설명:

```text
포인트 변경은 PostgreSQL transaction 안에서 wallet row lock, idempotency key, ledger insert, balance update를 함께 처리했습니다. 이를 통해 중복 요청과 동시 요청에서도 잔액과 변경 이력이 어긋나지 않도록 설계했습니다.
```

관련 문서:

- `WALLET_TRANSACTIONS.md`
- `docs/05_DATABASE_SCHEMA.md`
- `docs/06_POINT_WALLET.md`
- `docs/11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`

---

## 6. Socket Contract와 Private Event

Socket contract는 `packages/shared/src/socket-events.ts`에 모은다.

현재 namespace:

| 게임 | namespace | 주요 server event |
|---|---|---|
| BK Derby | `/racing` | `table:state`, `table:event`, `wallet:updated`, `error` |

`PRESTART_TICK`, `RACE_TICK`, `RACE_SETTLED` 같은 진행 신호는 `table:event`의 `type`으로 전달한다.

Public event와 private event는 분리한다.

Public table room에 보낼 수 있는 것:

- table phase
- timer
- public race positions
- viewer count
- public result
- aggregate table state

Private user room/socket에만 보낼 것:

- wallet balance
- wallet delta
- ledger id

이 구조의 이유:

- 모든 참여자는 같은 table state를 볼 수 있다.
- 하지만 개인 잔액과 개인 ledger 정보는 다른 사용자에게 노출되지 않는다.
- 저장된 본인 티켓 내역(금액, 상태, 선택)은 game token으로 인증한 `GET /racing/bets`로 조회한다.

---

## 7. BK Derby 백엔드 구현 상태

상태:

```text
실시간 경마 backend/API/socket 구현됨
```

현재 main table timing:

```text
전체 사이클: 120초
베팅 가능: 40초
출발 전 잠금/카운트다운: 20초
레이스 + 결과 표시: 60초
socket tick interval: 100ms
```

주요 구현:

- `/racing` Socket.IO namespace
- fixed-slot scheduler
- `PRESTART_TICK` final countdown sync
- `RACE_TICK` live broadcast at table tick interval
- race start 시 `raceId:raceNo` 기반 simulation seed 생성
- generated seed를 `racing_races.seed`와 `seed_locked_at`에 고정
- deterministic simulation으로 live tick과 final result를 일치시키는 구조
- final rank와 finishedAtMs를 DB에 저장
- wallet-backed ticket/settlement/cancel transaction
- today-based race history API
- horse stats API
- authenticated user ticket history API

현재 bet types:

```text
WIN
PLACE
QUINELLA
EXACTA
QUINELLA_PLACE
TRIO
TRIFECTA
```

정확한 설명:

```text
BK Derby는 race start 시 raceId와 raceNo 기반 deterministic seed를 생성해 DB에 잠그고, 서버가 같은 seed와 tick 간격으로 레이스 진행 및 최종 결과를 계산합니다. 클라이언트는 서버 tick을 렌더링하고, 최종 순위와 도착 시간은 서버 정산 경로를 통해 DB에 저장됩니다.
```

주의할 표현:

```text
"모든 tick을 DB에 저장한다"라고 말하면 현재 구현과 다를 수 있다.
schema에는 racing_ticks 테이블이 있지만, 현재 active path는 every-tick persistence가 아니라 live broadcast + final result persistence 중심이다.
```

추후 개선 후보:

- live tick simulation(`apps/game-server/src/racing/racing-race-tick.ts`)과 final settlement simulation(`packages/shared/src/racing-simulation.ts`)을 한 shared helper로 완전히 중앙화
- optional tick audit 저장
- multi-instance scaling 시 Redis adapter/state ownership 정리

관련 문서:

- `docs/15_HORSE_RACING_BACKEND_SPEC.md`
- `packages/shared/src/racing-simulation.ts`
- `packages/db/src/racing-runner.ts`
- `apps/game-server/src/racing/racing-race-tick.ts`

---

## 8. API Surface

현재 game-server 기준으로 설명 가능한 API:

| API | 목적 |
|---|---|
| `GET /health` | game-server health check |
| `GET /racing/tables` | lobby용 Racing table summary |
| `GET /racing/races` | 최근/오늘 race result history |
| `GET /racing/horses/stats` | horse별 최근 성적, 평균 순위, 승률/입상률 |
| `GET /racing/bets?tableId=main&limit=20` | authenticated user racing ticket history |

Web app route:

| API | 목적 |
|---|---|
| `POST /api/game-token` | Better Auth session 기반 short-lived game token 발급 |

---

## 9. 검증 체계

정적 검증:

```text
corepack pnpm --filter game-server typecheck
corepack pnpm --filter @bk-games/db typecheck
corepack pnpm --filter @bk-games/shared typecheck
corepack pnpm --filter @bk-games/game-engine typecheck
```

단위 테스트:

```text
corepack pnpm --filter game-server test
corepack pnpm --filter @bk-games/game-engine test
corepack pnpm --filter @bk-games/db test
```

DB smoke:

```text
corepack pnpm --filter @bk-games/db smoke:wallet
corepack pnpm --filter @bk-games/db smoke:daily-reward
corepack pnpm --filter @bk-games/db smoke:racing-wallet
corepack pnpm --filter @bk-games/db smoke:racing-scheduler
corepack pnpm --filter @bk-games/db smoke:racing-runner
```

Socket/runtime smoke:

```text
corepack pnpm --filter game-server smoke:racing-cycle
```

주의:

- DB smoke는 PostgreSQL이 실행 중이어야 한다.
- dev server start/stop/restart는 수동 운영 규칙을 따른다.
- 단위 테스트에는 꺼져 있는 블랙잭/바카라 코드의 테스트도 포함된다. 되살릴 수 있는 상태를 유지하기 위한 것이며, 두 게임의 DB smoke는 스위치를 켠 환경에서만 돈다(`docs/archive/card-games/00_INDEX.md`).

---

## 10. 배포 관점

백엔드 배포에서 중요한 점:

- Socket.IO game-server는 long-running process가 필요하다.
- Vercel serverless function만으로 game-server를 운영하는 구조는 적합하지 않다.
- DB는 PostgreSQL/RDB가 맞다.
- race tick을 매번 DB에 쓰지 않으면 24시간 BK Derby 자체의 DB 부하는 작다.
- 현재 MVP는 single game-server instance 기준이다.

저비용 demo 배포 조합:

```text
Frontend: Vercel
Backend: Railway / Render / Fly small always-on service
DB: Neon / Supabase PostgreSQL
Redis: 초기 생략, scale-out 때 도입
```

면접 설명:

```text
실시간 Socket.IO 서버는 long-running process가 필요해서 프론트 배포와 분리했습니다. 초기 포트폴리오 단계에서는 작은 always-on backend와 serverless Postgres 조합으로 운영비를 낮추고, 트래픽이 커지면 Redis adapter와 managed DB 구조로 확장할 수 있게 패키지 경계를 분리했습니다.
```

---

## 11. 이력서 문구로 사용 가능한 기술 성과

아래 문구는 현재 구현 기준으로 사용 가능하다.

### 실시간 서비스 아키텍처 설계

```text
Next.js 웹 앱과 NestJS + Socket.IO 게임 서버를 분리하고, 화면, 인증, 실시간 상태 관리, 도메인 로직, DB 계층을 모노레포 패키지 단위로 구성해 확장 가능한 구조를 설계
```

근거:

- `apps/web`
- `apps/game-server`
- `packages/shared`
- `packages/db`
- `packages/game-engine`

### 서버 권위형 상태 동기화

```text
클라이언트가 결과를 임의로 계산하지 않고 서버가 참여자 상태, 진행 단계, 타이머, 이벤트 순서, 결과 반영을 관리하도록 구성해 실시간 화면의 일관성을 확보
```

근거:

- Racing fixed-slot scheduler와 lifecycle runner (`racing-scheduler`, `racing-runner`)
- Racing `PRESTART_TICK` / `RACE_TICK`

### 사용자 활동 기록 안정성 확보

```text
사용자별 포인트 변경과 결과 반영 흐름을 PostgreSQL transaction, idempotency key, 변경 이력 테이블, private socket event 기반으로 처리해 중복 요청과 동시성 문제에 대응
```

근거:

- `wallets`
- `point_ledgers`
- wallet row lock
- racing bet/settlement/cancel helpers
- `wallet:updated` private event

### 기능 확장 가능한 데이터 모델 구축

```text
여러 미니게임이 같은 계정, 지갑, 변경 이력, 실시간 서버 구조를 재사용하도록 DB schema와 shared contract를 구성하고, 기능별 상세 기록은 독립 테이블로 분리
```

근거:

- shared `point_ledgers`
- `racing_*` game-specific tables
- shared socket/API contracts

주의:

- 현재 운영 중인 게임은 BK Derby 하나다. "여러 게임을 운영 중"이라고 말하지 않는다.
- 같은 계정/지갑/원장 구조 위에 블랙잭과 바카라를 구현했던 근거는 `docs/archive/card-games/17_BACKEND_OVERVIEW_CARD_GAMES.md`에 있다. 두 게임은 지금 기본값으로 꺼져 있다.

### 검증 가능한 개발 흐름 구성

```text
TypeScript typecheck, Jest/Vitest 테스트, DB smoke script, live Socket.IO smoke를 통해 실시간 이벤트, 서버 상태, 사용자 기록 처리, 주요 API 동작을 반복 검증할 수 있는 기반을 구성
```

근거:

- game-server Jest specs
- game-engine Vitest specs
- db smoke scripts
- racing cycle smoke

### deterministic realtime simulation

```text
BK Derby는 raceId와 raceNo 기반 deterministic seed를 레이스 시작 시 고정하고, 서버 tick과 최종 결과 계산을 같은 입력으로 재현 가능하게 구성해 실시간 진행과 결과 반영의 일관성을 확보
```

근거:

- `buildRacingSimulationSeed`
- `racing_races.seed`
- `racing-runner`
- 100ms `RACE_TICK`

주의:

- "모든 tick을 DB에 저장한다"는 현재 active implementation 기준으로는 사용하지 않는 것이 안전하다.

---

## 12. 현재 남은 백엔드 개선 후보

배포 전/후로 개선하면 좋은 항목:

- production 환경 변수 정리
- deployed health check / logging / error monitoring
- game-server graceful shutdown
- CORS origin 운영값 정리
- Redis adapter 도입 여부 판단
- racing live tick helper와 final simulation helper 중앙화
- optional racing tick audit persistence
- admin API 권한 강화와 audit log 확장
- DB backup/restore 운영 문서

---

## 13. 문서 기준

이 문서는 다음 문서를 요약/정리한다.

- `docs/02_ARCHITECTURE.md`
- `docs/04_SOCKET_EVENTS.md`
- `docs/05_DATABASE_SCHEMA.md`
- `docs/06_POINT_WALLET.md`
- `docs/11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`
- `docs/15_HORSE_RACING_BACKEND_SPEC.md`
- `AUTH_STRUCTURE.md`
- `WALLET_TRANSACTIONS.md`
- `ENGINEERING_LOG.md`

`docs/02`, `04`, `05`, `06`, `11`은 첫 테이블 게임(블랙잭)을 예시로 쓴 초기 설계 문서다. 서버 권위, 지갑/원장 멱등성, 환불 규칙은 그대로 유효하다. 경마의 설계 의도는 `docs/15_HORSE_RACING_BACKEND_SPEC.md`에 있지만, 이 문서는 구현 전에 쓴 스펙이므로 실제 구현과 다른 부분은 코드와 이 문서가 우선한다.

스펙과 실제 구현이 다르게 보일 때는 실제 코드와 이 문서의 "BK Derby 백엔드 구현 상태"를 우선해서 포트폴리오 문구를 작성한다.

Boxing은 스펙만 존재하고 runtime/backend implementation이 없다. 배포되는 game-server module이나 DB transaction helper로 연결되어 있지 않다.
포트폴리오에서 "구현된 게임"으로 말하지 않고, "추후 확장 후보로 backend-facing specification을 작성했다" 정도로만 말한다.
관련 문서: `docs/16_BOXING_BACKEND_SPEC.md`
