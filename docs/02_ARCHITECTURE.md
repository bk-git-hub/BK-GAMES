# Architecture

BK Games 게임 플랫폼을 위한 최종 아키텍처다. 초기 실시간 게임 런타임은 첫 게임인 멀티플레이 블랙잭을 기준으로 설계한다.

---

## 1. 결론

```text
Next.js 단일앱이 아니라 pnpm workspace 기반 모노레포로 시작한다.
game-server는 NestJS + Socket.IO Gateway로 구성한다.
```

구성:

```text
apps/web
apps/game-server
packages/db
packages/game-engine
packages/shared
```

---

## 2. 전체 구조

```text
bk-games/
├─ apps/
│  ├─ web/
│  │  ├─ src/app/
│  │  ├─ src/components/
│  │  ├─ src/lib/
│  │  └─ package.json
│  └─ game-server/
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ app.module.ts
│     │  ├─ auth/
│     │  │  ├─ game-token.service.ts
│     │  │  └─ socket-auth.guard.ts
│     │  ├─ blackjack/
│     │  │  ├─ blackjack.gateway.ts
│     │  │  ├─ blackjack.module.ts
│     │  │  ├─ blackjack-table.service.ts
│     │  │  ├─ blackjack-round.service.ts
│     │  │  └─ blackjack-settlement.service.ts
│     │  ├─ wallet/
│     │  │  ├─ wallet.module.ts
│     │  │  └─ wallet.service.ts
│     │  └─ health/
│     │     └─ health.controller.ts
│     └─ package.json
├─ packages/
│  ├─ db/
│  │  ├─ src/client.ts
│  │  ├─ src/schema.ts
│  │  └─ package.json
│  ├─ game-engine/
│  │  ├─ src/blackjack/
│  │  └─ package.json
│  └─ shared/
│     ├─ src/socket-events.ts
│     ├─ src/schemas.ts
│     ├─ src/types.ts
│     └─ package.json
├─ docs/
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

---

## 3. 앱별 책임

## 3.1 apps/web

Next.js 앱이다.

책임:

- 랜딩 페이지
- 회원가입/로그인
- 일일 보상 수령 UI
- 지갑 조회
- 블랙잭 테이블 화면
- 관리자 페이지
- 게임 접속용 token 발급 API
- REST/BFF API

하지 않는 것:

- 카드 draw
- 승패 판정
- 실시간 라운드 진행
- 포인트 정산 직접 처리

---

## 3.2 apps/game-server

NestJS 기반 실시간 게임 서버다.

기술:

```text
NestJS
Socket.IO Gateway
TypeScript
```

책임:

- Socket 연결 관리
- game token 검증
- 테이블 입장/퇴장
- 좌석 관리
- 라운드 상태 머신
- 베팅 타이머
- 플레이어 턴 타이머
- Hit/Stand/Double 처리
- 딜러 턴 처리
- 정산 트랜잭션 호출
- 테이블 상태 broadcast
- 서버 재시작 시 미정산 라운드 취소/환불

NestJS를 쓰는 이유:

- Gateway, Module, Provider 단위로 실시간 도메인을 분리하기 좋다.
- Auth, Wallet, Blackjack, Admin 같은 책임을 모듈로 나누기 좋다.
- Socket handler가 커지는 것을 막고 service layer로 orchestration을 분리할 수 있다.
- 추후 다중 테이블, Redis adapter, 관리자 control event가 추가되어도 구조를 유지하기 쉽다.

---

## 3.3 packages/game-engine

순수 TypeScript 블랙잭 엔진이다.

책임:

- 덱 생성
- 셔플
- 카드 점수 계산
- Blackjack 판정
- Bust 판정
- 딜러 룰
- 승패 판정
- payout 계산

제약:

- DB 접근 금지
- Socket 접근 금지
- Next 의존 금지
- Nest 의존 금지

이 패키지는 테스트하기 쉬워야 한다.

---

## 3.4 packages/db

DB schema, client, repository를 제공한다.

책임:

- Drizzle schema
- DB client
- wallet repository
- ledger repository
- blackjack round repository
- transaction helper

---

## 3.5 packages/shared

web과 game-server가 공유하는 타입/스키마를 둔다.

책임:

- Socket event 이름
- event payload 타입
- Zod validation schema
- 공통 enum
- API response type

---

## 4. 데이터 흐름

### 4.1 로그인 후 게임 접속

```text
User
→ apps/web 로그인
→ Better Auth 세션 생성
→ /api/game-token 호출
→ web이 짧은 수명의 gameToken 발급
→ client가 game-server에 Socket 연결
→ NestJS Gateway에서 token 검증
→ table:join
```

### 4.2 베팅

```text
client round:bet
→ BlackjackGateway payload 수신
→ Zod/Pipe validation
→ commandId idempotency 확인
→ BlackjackTableService phase 확인
→ seat 확인
→ WalletService DB transaction
   → wallet lock
   → balance 확인
   → balance 차감
   → point_ledger BET 기록(idempotency_key 포함)
   → round_player betAmount 기록
→ table runtime state 갱신
→ BlackjackGateway table:state broadcast
→ 본인에게만 wallet:updated emit
```

### 4.3 정산

```text
round phase SETTLEMENT
→ packages/game-engine 결과 계산
→ BlackjackSettlementService가 좌석별 settlement 준비
→ WalletService DB transaction
   → round result 저장
   → payout 지급
   → point_ledger WIN/PUSH/BLACKJACK_WIN 기록(idempotency_key 포함)
→ BlackjackGateway round:settled broadcast
→ 각 유저에게 wallet:updated private emit
```

---

## 5. 왜 Next 단일앱이 아닌가

첫 게임인 실시간 멀티플레이 블랙잭에는 다음 기능이 필요하다.

- WebSocket connection 유지
- 테이블 room broadcast
- 라운드 타이머
- 좌석별 turn timer
- 재접속 처리
- 서버 메모리의 runtime state
- 동시 액션 제어

이는 Next Route Handler 중심 구조보다 별도 long-running Node 서버가 적합하다.

---

## 6. 왜 NestJS인가

초기에는 raw Fastify + Socket.IO도 가능하지만, BK Games의 game-server는 금방 다음 구조가 필요해진다.

```text
AuthModule
BlackjackModule
WalletModule
AdminModule
HealthModule
```

특히 실시간 테이블제 블랙잭은 다음 책임이 강하게 분리되어야 한다.

```text
Socket 입출력
테이블 runtime state
라운드 상태 머신
타이머
정산
포인트 원장
재접속
관리자 제어
```

따라서 MVP부터 NestJS로 구조를 잡는다.

---

## 7. Redis 도입 기준

MVP에서는 Redis를 필수로 넣지 않는다.

초기 조건:

```text
game-server 단일 인스턴스
활성 테이블 1개
메모리 상태 허용
```

Redis가 필요한 시점:

- game-server 인스턴스 2개 이상
- 여러 테이블을 여러 서버에 분산
- Socket.IO Redis adapter 필요
- presence를 서버 간 공유
- rate limit을 서버 간 공유

---

## 8. 배포 전략

### MVP

| 영역 | 배포 |
|---|---|
| web | Vercel |
| game-server | Railway / Render / Fly.io |
| DB | Neon / Supabase Postgres |

### 추후

| 영역 | 배포 |
|---|---|
| web | Vercel |
| game-server | Fly.io / AWS ECS |
| worker | 별도 Node worker |
| Redis | Upstash / Redis Cloud |
| DB | Neon / Supabase / RDS |

---

## 9. 아키텍처 원칙

```text
Route Handler는 얇게 둔다.
Gateway도 얇게 둔다.
게임 룰은 game-engine으로 분리한다.
포인트 증감은 DB transaction으로 처리한다.
실시간 상태는 game-server가 관리한다.
영구 기록은 PostgreSQL에 저장한다.
Nest provider는 orchestration을 담당한다.
```
