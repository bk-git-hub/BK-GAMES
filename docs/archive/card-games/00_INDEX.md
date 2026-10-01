# Card Games Archive Index (Blackjack / Baccarat)

블랙잭과 바카라는 2026-10-01부터 **기본값으로 꺼져 있다.** 제품 라인업은 경마(BK Derby) 하나다.

두 게임의 코드는 지우지 않았다. 스위치 하나로 다시 켤 수 있도록 소스, 단위 테스트, DB 테이블, migration을 그대로 두었다. 이 문서는 되살릴 때 따라갈 단일 runbook이다.

명시적인 요청 없이 두 게임을 다시 켜거나, 관련 테이블을 조회하거나, 화면에 다시 연결하지 않는다 (`AGENTS.md` Critical Invariants).

---

## 1. 스위치

```text
CARD_GAMES_ENABLED
```

- 값이 정확히 문자열 `true`일 때만 켜진다.
- 설정하지 않음, 빈 값, `TRUE`, `1`, `yes`, 앞뒤 공백이 붙은 `" true "`는 모두 **꺼짐**이다 (fail closed).
- `GAME_SOCKET_DEV_AUTH === 'true'`와 같은 규칙이다 (`apps/game-server/src/auth/game-token.service.ts`).
- 서버 전용 변수다. `NEXT_PUBLIC_` 변수로 만들지 않는다.
- 모듈 최상단이 아니라 함수 호출 시점에 읽는다.
- 계층마다 `isCardGamesEnabled`라는 작은 helper를 따로 둔다. `packages/shared`에는 넣지 않는다.

`.env.example`의 기본값은 `CARD_GAMES_ENABLED=false`다.

---

## 2. 스위치를 읽는 곳

| 계층 | 파일 | 동작 |
|---|---|---|
| game-server | `apps/game-server/src/card-games.ts` | `isCardGamesEnabled()` |
| game-server | `apps/game-server/src/main.ts`, `apps/game-server/src/app.module.ts` | `bootstrap()`이 dotenv 로드 뒤에 값을 읽어 `AppModule.register(cardGamesEnabled)`를 호출한다. 꺼져 있으면 `BlackjackModule`, `BaccaratModule` 파일을 `require`조차 하지 않는다 |
| data layer | `packages/db/src/card-games.ts` | `isCardGamesEnabled()`, `assertCardGamesEnabled()`, `CardGamesDisabledError` (`code: "CARD_GAMES_DISABLED"`) |
| data layer | `packages/db/src/blackjack-betting.ts`, `blackjack-settlement.ts`, `baccarat-betting.ts`, `baccarat-settlement.ts`, `baccarat-seed.ts`, `admin.ts`의 `setBlackjackTableStatus` | export된 모든 블랙잭/바카라 진입점이 첫 줄에서 `assertCardGamesEnabled()`를 호출한다. 꺼져 있으면 카드 게임 쿼리를 실행하기 전에 던진다 |
| web | `apps/web/src/lib/card-games.ts` | `isCardGamesEnabled()` (`server-only`), 404 응답 body |
| web | `apps/web/src/proxy.ts` | `/blackjack/**`, `/baccarat/**`, `/api/admin/blackjack/**`, `/cards/**` 요청을 꺼진 상태에서 404로 응답한다 |
| web | `apps/web/src/app/blackjack/page.tsx`, `apps/web/src/app/baccarat/page.tsx`, 각 `loading.tsx` | page는 `notFound()`, loading은 `null`. 꺼진 빌드가 테이블 shell을 prerender하지 않게 한다 |
| web | `apps/web/src/app/api/admin/blackjack/tables/main/pause/route.ts`, `resume/route.ts` | 세션 조회 전에 404 |
| web | `apps/web/src/app/_home/game-list.tsx`, `apps/web/src/app/_loading/route-loading-shells.tsx` | 꺼져 있으면 홈(`/`)의 게임 목록과 로딩 shell이 BK Derby 카드만 그린다 |

game-server는 값을 부팅할 때 한 번만 읽는다. data layer와 web의 proxy/route handler는 호출마다 읽는다. web의 prerender 결과(홈의 게임 목록, page shell)는 **빌드 시점의 값**으로 고정된다.

`packages/db`의 guard가 닿지 않는 경로가 하나 있다. `apps/game-server/src/baccarat/baccarat-table-config.service.ts`는 `db.pool`로 raw SQL을 직접 실행한다. 이 경로는 `BaccaratModule`이 등록되지 않는다는 사실만으로 꺼져 있다.

`packages/db/scripts`의 카드 smoke script 4개(`blackjack-betting-smoke.ts`, `blackjack-settlement-smoke.ts`, `baccarat-betting-smoke.ts`, `baccarat-settlement-smoke.ts`)는 DB에 손대기 전에 `assertCardGamesEnabled()`를 호출한다. 스위치가 꺼져 있으면 connection을 열지 않고 `CardGamesDisabledError`로 종료한다.

---

## 3. 꺼져 있을 때의 동작

- game-server에 `/blackjack`, `/baccarat` Socket.IO namespace가 없다.
- `GET /blackjack/tables`는 404다.
- web의 관리자 블랙잭 테이블 pause/resume API는 404다.
- `blackjack_*`, `baccarat_*` 테이블에 쿼리가 나가지 않는다.
- 홈(`/`)의 게임 목록(로비)에는 BK Derby만 보인다. `/lobby`는 홈으로 redirect한다.
- `/blackjack`, `/baccarat` 페이지는 404다.
- `/cards/**` 카드 이미지 asset 요청은 404다.

경마, 인증, 지갑, 일일 보상 경로는 스위치와 무관하게 동작한다.

---

## 4. 일부러 남겨 둔 것

- 블랙잭/바카라 소스 전체: `apps/game-server/src/blackjack`, `apps/game-server/src/baccarat`, `packages/db/src/blackjack-*.ts`, `packages/db/src/baccarat-*.ts`, `packages/game-engine/src/blackjack`, `packages/game-engine/src/baccarat`, `apps/web/src/app/blackjack`, `apps/web/src/app/baccarat`, `packages/shared`의 socket 계약.
- 단위 테스트. 두 게임 코드는 계속 compile, typecheck, 단위 테스트 대상이다. 되살릴 수 있는 상태를 유지하기 위해서다.
- `packages/db/src/schema.ts`의 14개 테이블 정의와 migration (`packages/db/drizzle/**`):
  - 블랙잭 8개: `blackjack_tables`, `blackjack_table_seats`, `blackjack_shoes`, `blackjack_rounds`, `blackjack_round_seats`, `blackjack_hands`, `blackjack_side_bets`, `blackjack_actions`
  - 바카라 6개: `baccarat_tables`, `baccarat_shoes`, `baccarat_rounds`, `baccarat_reveals`, `baccarat_bets`, `baccarat_actions`
- `point_ledgers`의 `game_type` CHECK 값(`BLACKJACK`, `BACCARAT`, `RACING`)과 `type` CHECK 값(`DOUBLE_BET`, `SPLIT_BET`, `INSURANCE_BET`, `SURRENDER_REFUND`, `PUSH_REFUND` 포함), `packages/db/src/wallet-transactions.ts`의 `WalletMutationGameType` union.
- `apps/web/public/cards/**` 카드 이미지.

테이블 정의를 지우면 안 되는 이유:

```text
drizzle-kit generate는 schema.ts를 가장 최근 snapshot과 비교해서 migration을 만든다.
schema.ts에서 테이블 정의를 지우면 다음 generate가 DROP TABLE을 만들어 낸다.
```

기존 원장 row가 `BLACKJACK`/`BACCARAT` 값을 쓰고 있으므로 CHECK 값과 union도 줄이지 않는다.

---

## 5. 되살리는 절차

### 5.1 Local

두 곳에 모두 넣는다. 켜지 않을 쪽에도 `false`로 값을 명시한다.

```env
# 저장소 루트 .env  (game-server, packages/db seed/smoke script가 읽는다)
CARD_GAMES_ENABLED=true
```

```env
# apps/web/.env.local  (web app이 읽는다)
CARD_GAMES_ENABLED=true
```

이유: Next.js 자체는 `apps/web/.env*`만 로드한다. 하지만 web server process는 `packages/db/src/client.ts`도 평가하고, 이 파일의 dotenv 호출(11-12행)은 루트 `.env`의 key 가운데 아직 설정되지 않은 것을 `process.env`에 복사한다. 그래서 루트 `.env`에만 `CARD_GAMES_ENABLED=true`가 있어도 db를 import하는 module이 로드된 뒤에는 web의 gate가 켜진다. `next build`와 `next start`에서는 시작할 때, `next dev`에서는 그런 module을 쓰는 첫 요청 이후다. 루트 `.env`에만 넣으면 web의 동작이 요청 순서에 따라 달라진다는 뜻이다.

두 파일 모두에 값(`true` 또는 `false`)을 명시해 두면 web의 값이 루트 `.env`에 좌우되지 않는다. dotenv는 이미 설정된 key를 덮어쓰지 않는다.

- 카드 smoke/seed script를 돌리려고 루트 `.env`에 `true`를 넣으면, `apps/web/.env.local`에 값을 명시하지 않은 local web도 함께 켜진다. local web을 경마 전용으로 두려면 작업이 끝난 뒤 루트 `.env`의 값을 지운다.
- 루트 `.env`가 `true`인 상태에서는 의도한 경우가 아니면 local/prebuilt web build를 만들지 않는다.

값을 넣은 뒤 game-server와 web dev server를 다시 시작해야 한다. 저장소 규칙상 dev server 시작/재시작은 사용자가 직접 한다.

`.env` 파일로 스위치를 바꾼 뒤 local production build는 `corepack pnpm --filter web build`(`next build`를 직접 실행)로 돌린다. `.env` 파일은 gitignore 대상이라 turbo의 cache hash에 들어가지 않으므로 `corepack pnpm build`는 cache hit으로 끝날 수 있다.

### 5.2 Railway (game-server)

1. game-server service의 Variables에 `CARD_GAMES_ENABLED=true`를 추가한다.
2. redeploy 또는 restart한다. game-server는 부팅할 때 한 번만 값을 읽는다.
3. 로그에 `CARD_GAMES_ENABLED=true: registering blackjack and baccarat`가 찍히는지 확인한다.

### 5.3 Vercel (web)

1. project Environment Variables에 `CARD_GAMES_ENABLED=true`를 추가한다.
2. **반드시 redeploy한다.** 홈의 게임 목록과 page shell은 빌드 시점에 prerender되므로 변수만 바꿔서는 게임 목록에 카드 게임이 나타나지 않는다.

### 5.4 Seed

seed도 스위치가 켜져 있어야 한다. 꺼져 있으면 `CardGamesDisabledError`로 실패한다. 대상 DB의 `DATABASE_URL`과 `CARD_GAMES_ENABLED=true`가 설정된 환경에서 실행한다.

```bash
corepack pnpm --filter @bk-games/db seed:blackjack-main
corepack pnpm --filter @bk-games/db seed:baccarat-main
```

카드 seed를 한 번도 돌린 적 없는 DB라면 5.3의 web redeploy보다 먼저 두 seed를 실행한다. 블랙잭은 스스로 seed하지 않으므로 그 전까지 `TABLE_NOT_FOUND`로 응답한다.

migration은 추가로 돌릴 필요가 없다. 14개 테이블은 기존 migration에 이미 들어 있다.

### 5.5 검증

```bash
corepack pnpm --filter game-server test
corepack pnpm --filter @bk-games/db smoke:blackjack-betting
corepack pnpm --filter @bk-games/db smoke:blackjack-settlement
corepack pnpm --filter @bk-games/db smoke:baccarat-betting
corepack pnpm --filter @bk-games/db smoke:baccarat-settlement
```

- 카드 smoke script 4개는 PostgreSQL과 `CARD_GAMES_ENABLED=true`가 필요하다.
- game-server 단위 테스트는 스위치와 무관하게 돈다.

런타임 확인:

```text
1. GET /blackjack/tables returns 200
2. /blackjack socket connects; after table:join for table main it receives table:state
3. /baccarat socket connects; after table:join for table main it receives table:state
4. /blackjack and /baccarat pages return 200
5. a /cards/** asset (e.g. /cards/royal-noir/AS.svg) returns 200
6. 홈(/) 게임 목록에 Blackjack, Baccarat 카드가 보인다
7. wallet:updated is private and visible only to the acting user
```

되살린 뒤에는 `AGENTS.md`의 routing/invariant, `docs/00_README.md`, `docs/17_BACKEND_TECHNICAL_OVERVIEW.md`, `docs/18_BACKEND_DEPLOYMENT_CHECKLIST.md`, 루트 `README.md`, `apps/web/README.md`, `apps/game-server/README.md`를 다시 맞춘다. `apps/web/src/app/layout.tsx`(metadata description)와 `apps/web/src/app/auth/auth-shell.tsx`(poster 그림과 문구)도 스위치와 무관하게 경마 기준으로 남아 있으므로 함께 맞춘다.

---

## 6. Snapshot tag

```text
archive/card-games-2026-10-01
```

- annotated tag다. commit `7cba3da`를 가리킨다.
- 세 게임이 모두 켜져 있던 마지막 commit이다.
- branch push에는 tag가 포함되지 않는다. tag는 아래의 `git push origin archive/card-games-2026-10-01`로 따로 push한다.

```bash
git show archive/card-games-2026-10-01
git push origin archive/card-games-2026-10-01
```

---

## 7. 되살리기 전에 알아야 할 부채

### 7.1 바카라 shoe state는 암호화되어 있지 않다

`baccarat_shoes.encrypted_state` column은 이름과 달리 섞인 shoe를 평문 JSON으로 저장한다 (`apps/game-server/src/baccarat/baccarat-table-config.service.ts`의 `parseShoeState`). DB를 읽을 수 있는 사람은 앞으로 나올 카드 순서를 알 수 있다. 루트 `README.md`의 planned-work 목록에 있던 후속 작업이다: 실제로 암호화하거나 column 이름을 바꾼다.

### 7.2 바카라 config service의 transaction이 전용 client를 쓰지 않는다

`apps/game-server/src/baccarat/baccarat-table-config.service.ts`는 `db.pool.query('begin')` … `db.pool.query('commit')`으로 transaction을 연다. `pool.query`는 호출마다 다른 connection을 쓸 수 있으므로 `begin`, 본문 쿼리, `commit`이 같은 connection에서 실행된다는 보장이 없다. 전용 client(`pool.connect()`) 또는 `db.transaction`으로 바꿔야 한다.

### 7.3 블랙잭에는 export된 cancel/refund 경로가 없다

서버 재시작으로 중단된 라운드를 직접 취소/환불할 수 있는 export 함수가 없다. `packages/db/src/blackjack-betting.ts` 내부의 `cancelStaleWaitingBetRounds`가 같은 테이블에 다음 최초 베팅이 들어올 때 오래된 `WAITING_BETS` 라운드를 취소하고 `CANCEL_REFUND`로 환불할 뿐이다. 누군가 다시 베팅하기 전까지는 환불이 일어나지 않는다.

바카라에는 `cancelBaccaratRound`가 export되어 있고 재실행해도 안전하지만, game-server runtime에서 이를 호출하는 곳은 없다.

### 7.4 스위치를 끌 때 열려 있던 라운드는 정산되지 않은 채 남는다

스위치가 꺼진 동안에는 정산도 환불도 돌지 않는다. 되살리기 전에 아래 read-only 쿼리로 남은 라운드를 확인한다. 컬럼과 상태 값은 `packages/db/src/schema.ts` 기준이다.

블랙잭. `blackjack_rounds.status`의 non-terminal 값은 `WAITING_BETS`, `DEALING`, `PLAYER_TURNS`, `DEALER_TURN`, `SETTLING`이고 terminal 값은 `SETTLED`, `CANCELLED`다. 걸려 있는 베팅은 `blackjack_round_seats.status = 'ACTIVE'`다.

```sql
select
  r.id as round_id,
  r.round_no,
  r.status as round_status,
  r.created_at,
  rs.seat_no,
  rs.user_id,
  rs.initial_bet_amount,
  rs.total_wager_amount
from blackjack_rounds r
join blackjack_round_seats rs on rs.round_id = r.id
where r.status not in ('SETTLED', 'CANCELLED')
  and rs.status = 'ACTIVE'
order by r.created_at, rs.seat_no;
```

블랙잭 insurance side bet (`blackjack_side_bets.status = 'PLACED'`):

```sql
select
  r.id as round_id,
  r.round_no,
  r.status as round_status,
  rs.seat_no,
  rs.user_id,
  sb.type,
  sb.amount
from blackjack_rounds r
join blackjack_side_bets sb on sb.round_id = r.id
join blackjack_round_seats rs on rs.id = sb.round_seat_id
where r.status not in ('SETTLED', 'CANCELLED')
  and sb.status = 'PLACED'
order by r.created_at, rs.seat_no;
```

바카라. `baccarat_rounds.status`의 non-terminal 값은 `WAITING_BETS`, `DEALING`, `SQUEEZE`, `SETTLING`이고 terminal 값은 `SETTLED`, `CANCELLED`다. 걸려 있는 베팅은 `baccarat_bets.status = 'PLACED'`다.

```sql
select
  r.id as round_id,
  r.round_no,
  r.status as round_status,
  r.created_at,
  b.id as bet_id,
  b.user_id,
  b.bet_type,
  b.amount,
  b.placed_ledger_id
from baccarat_rounds r
join baccarat_bets b on b.round_id = r.id
where r.status not in ('SETTLED', 'CANCELLED')
  and b.status = 'PLACED'
order by r.created_at, b.created_at;
```

결과가 있으면 해당 유저의 포인트가 차감된 채 묶여 있다는 뜻이다. 환불은 원장 규칙(멱등 키, wallet과 ledger를 한 transaction에서 갱신)을 지키는 경로로만 처리한다. row를 직접 `update`하지 않는다.

### 7.5 카드 테이블의 foreign key는 NO ACTION이다

카드 테이블은 `"user"`와 `point_ledgers`를 `ON DELETE no action`으로 참조한다.

| 테이블 | column | 참조 |
|---|---|---|
| `blackjack_table_seats` | `user_id` | `"user".id` |
| `blackjack_round_seats` | `user_id` | `"user".id` |
| `blackjack_actions` | `user_id` | `"user".id` |
| `baccarat_reveals` | `squeezer_user_id` | `"user".id` |
| `baccarat_bets` | `user_id` | `"user".id` |
| `baccarat_actions` | `user_id` | `"user".id` |
| `baccarat_bets` | `placed_ledger_id`, `settlement_ledger_id`, `refund_ledger_id` | `point_ledgers.id` |

게임이 꺼져 있어도 이 row들은 남아 있다. 나중에 계정 삭제 기능을 만들 때 이 테이블들을 함께 처리하지 않으면 `"user"` row 삭제가 foreign key 위반으로 실패한다.

### 7.6 proxy는 되살린 뒤에도 남는다

되살린 뒤에도 `/cards/**`, `/blackjack/**`, `/baccarat/**`, `/api/admin/blackjack/**` 요청은 `apps/web/src/proxy.ts`를 pass-through로 거친다. 꺼진 상태에서 `/_next/image?url=/cards/...` 요청은 self-hosted server에서 400으로 응답하는 것을 확인했고, Vercel에서는 확인하지 않았다.

---

## 8. 이 폴더의 문서

| 파일 | 내용 |
|---|---|
| [01_FINAL_SCOPE.md](./01_FINAL_SCOPE.md) | 초기 Blackjack-first MVP 범위와 제외 범위 |
| [03_REALTIME_BLACKJACK_TABLE_SPEC.md](./03_REALTIME_BLACKJACK_TABLE_SPEC.md) | 테이블제 실시간 블랙잭 스펙 |
| [12_BACCARAT_SCOPE.md](./12_BACCARAT_SCOPE.md) | 바카라 MVP 범위와 제외 범위 |
| [13_BACCARAT_REALTIME_TABLE_SPEC.md](./13_BACCARAT_REALTIME_TABLE_SPEC.md) | 실시간 바카라 테이블 스펙 |
| [14_BACCARAT_IMPLEMENTATION_PLAN.md](./14_BACCARAT_IMPLEMENTATION_PLAN.md) | 바카라 구현 순서와 작업 단위 |
| [17_BACKEND_OVERVIEW_CARD_GAMES.md](./17_BACKEND_OVERVIEW_CARD_GAMES.md) | `docs/17`에서 떼어낸 블랙잭/바카라 백엔드 구현 설명 (원문 그대로) |
| [ENGINEERING_LOG_CARD_GAMES.md](./ENGINEERING_LOG_CARD_GAMES.md) | 루트 `ENGINEERING_LOG.md`에서 떼어낸 블랙잭/바카라 기록 (원문 그대로) |

블랙잭을 예시로 쓴 초기 설계 문서(`docs/02`, `04`~`11`)는 지갑/원장 규칙이 경마에도 적용되므로 `docs/`에 그대로 두었다.
