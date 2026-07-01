# First Tasks

프로젝트 생성 후 첫 작업 순서다.

---

## 1. 커밋 단위

### 1. 프로젝트/워크스페이스 세팅

```text
chore: 모노레포 초기 환경 설정
```

작업:

- pnpm workspace
- apps/web
- apps/game-server
- packages/db
- packages/game-engine
- packages/shared
- NestJS game-server 생성
- turbo 설정

---

### 2. DB/Drizzle 세팅

```text
chore: Drizzle 및 PostgreSQL 설정
```

작업:

- packages/db schema
- drizzle.config.ts
- db client
- initial migration
- main blackjack table seed

---

### 3. 인증/게임 토큰

```text
feat: 인증 및 게임 접속 토큰 추가
```

작업:

- Better Auth
- 로그인/회원가입
- /api/game-token
- game-server token 검증

---

### 4. 포인트 지갑/일일 보상

```text
feat: 포인트 지갑과 일일 보상 추가
```

작업:

- wallet 생성
- point ledger
- signup bonus
- daily reward
- ledger 조회

---

### 5. 블랙잭 엔진

```text
feat: 블랙잭 엔진 기본 로직 추가
```

작업:

- deck
- shuffle
- score
- blackjack 판정
- bust 판정
- dealer rule
- settlement
- unit test

---

### 6. 실시간 테이블 서버

```text
feat: 실시간 블랙잭 테이블 서버 추가
```

작업:

- NestJS Socket.IO Gateway
- table:join
- seat:take
- seat:leave
- table:state broadcast
- 단일 main table runtime

---

### 7. 라운드 진행

```text
feat: 블랙잭 라운드 상태 머신 추가
```

작업:

- WAITING
- BETTING
- DEALING
- PLAYER_TURNS
- DEALER_TURN
- SETTLEMENT
- ROUND_END

---

### 8. 베팅/정산

```text
feat: 블랙잭 베팅과 포인트 정산 추가
```

작업:

- round:bet
- wallet lock
- BET ledger
- player actions
- settlement
- payout ledger
- reconnect handling

---

## 2. 가장 중요한 순서

```text
모노레포 생성
→ DB schema
→ AI agent implementation decisions 확인
→ Auth/game token
→ wallet/ledger
→ game-engine
→ NestJS socket table
→ betting/settlement
→ web table UI
```

UI를 먼저 만들지 않는다.  
실시간 게임은 상태 머신과 정산이 먼저다.

---

## 3. 구현 중 절대 지킬 것

```text
포인트 증감은 무조건 DB transaction
포인트 증감은 무조건 ledger 기록
포인트 변경 요청은 무조건 idempotency 처리
환불은 finalBetAmount 기준
walletBalance는 private socket event로만 전송
maxBet은 서버에서만 계산/검증
카드/승패/정산은 무조건 server authoritative
Nest Gateway 안에 게임 룰을 직접 길게 쓰지 않기
게임 룰은 packages/game-engine에 두기
```

구현 전 반드시 `11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`를 먼저 읽는다.
