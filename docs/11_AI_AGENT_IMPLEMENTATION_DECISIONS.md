# AI Agent Implementation Decisions

이 문서는 구현을 맡은 AI 에이전트와 개발자가 따라야 하는 확정 지침이다.

기존 문서와 이 문서가 충돌하면 이 문서를 우선한다.  
면접 준비용 사설 문서는 `private/` 폴더에 따로 있으며, 구현 source of truth가 아니다.

---

## 1. 목적

BK Games MVP의 포인트/실시간/정산 안정성을 위해 다음 다섯 가지 결정을 확정한다.

```text
1. Idempotency
2. Point ledger schema
3. Refund 기준
4. Private socket event
5. maxBet 계산 위치
```

이 다섯 가지는 모두 같은 목표를 가진다.

```text
중복 요청에도 포인트가 두 번 차감되지 않게 한다.
모든 포인트 증감 이유를 감사 가능하게 남긴다.
서버 재시작/라운드 취소에도 정확히 환불한다.
개인 지갑 정보가 다른 유저에게 broadcast되지 않게 한다.
클라이언트 조작으로 베팅 한도를 우회하지 못하게 한다.
```

---

## 2. Idempotency

### 결정

포인트를 변경하거나 라운드 결과를 확정하는 모든 command는 idempotent해야 한다.

같은 요청이 네트워크 재시도, 더블클릭, 재접속 때문에 여러 번 들어와도 실제 포인트 변경은 한 번만 일어나야 한다.

### 적용 대상

클라이언트가 보내는 command:

```text
round:bet
player:double
```

HTTP API:

```text
POST /api/rewards/claim
POST /api/admin/users/:userId/points/adjust
```

서버 내부 작업:

```text
라운드 정산
라운드 취소 환불
가입 보너스 지급
```

### Socket payload 규칙

포인트 변경 가능성이 있는 socket payload에는 `commandId`를 포함한다.

```ts
type RoundBetPayload = {
  commandId: string;
  tableId: string;
  amount: number;
};

type PlayerDoublePayload = {
  commandId: string;
  tableId: string;
};
```

규칙:

- `commandId`는 클라이언트가 요청 직전에 생성한다.
- 같은 요청을 재시도할 때는 같은 `commandId`를 재사용한다.
- 새로운 버튼 클릭/새로운 의도는 새로운 `commandId`를 사용한다.
- 서버는 `userId + commandId` 기준으로 중복 처리를 막는다.

### 서버 내부 idempotency key

서버가 자동으로 수행하는 작업은 deterministic key를 사용한다.

```text
signup bonus:     signup:{userId}
daily reward:     daily-reward:{userId}:{claimedDate}
settlement:       settlement:{roundId}:{userId}
refund:           refund:{roundId}:{userId}
admin adjust:     admin-adjust:{auditLogId}
```

### 중복 요청 처리

이미 처리된 `idempotencyKey`가 다시 들어오면:

```text
포인트를 다시 변경하지 않는다.
가능하면 기존 결과를 반환한다.
socket 요청이면 현재 table:state와 개인 wallet:updated를 다시 보내 동기화한다.
```

---

## 3. Point Ledger Schema

### 결정

`wallets.balance`는 현재 잔액 캐시이고, `point_ledgers`는 절대 삭제하지 않는 포인트 장부다.

모든 포인트 변경은 하나의 DB transaction 안에서 다음 순서로 처리한다.

```text
begin
→ wallet row lock
→ balance_before 계산
→ 음수 잔액 방지 검증
→ wallets.balance update
→ point_ledgers insert
commit
```

### 확정 컬럼

`point_ledgers`는 최소 다음 컬럼을 가진다.

```sql
CREATE TABLE point_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type VARCHAR(40) NOT NULL,
  delta BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference_type VARCHAR(40),
  reference_id UUID,
  idempotency_key VARCHAR(120) NOT NULL,
  memo TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT point_ledgers_idempotency_unique
    UNIQUE (user_id, idempotency_key)
);
```

### delta 부호 규칙

```text
SIGNUP_BONUS      delta > 0
DAILY_REWARD      delta > 0
BET               delta < 0
DOUBLE_BET        delta < 0
WIN               delta > 0
BLACKJACK_WIN     delta > 0
PUSH              delta > 0
REFUND            delta > 0
ADMIN_ADJUST      delta can be positive or negative
SYSTEM_REVERT     delta can be positive or negative
```

패배는 베팅 시 이미 `BET`으로 차감되므로 별도 `LOSE` ledger를 남기지 않는다.  
대신 `blackjack_round_players.result = DEALER_WIN | PLAYER_BUST`로 결과를 남긴다.

### 참조 규칙

```text
BET / DOUBLE_BET / WIN / BLACKJACK_WIN / PUSH / REFUND
→ reference_type = BLACKJACK_ROUND
→ reference_id = roundId

DAILY_REWARD
→ reference_type = DAILY_REWARD_CLAIM
→ reference_id = claimId

ADMIN_ADJUST
→ reference_type = ADMIN_AUDIT_LOG
→ reference_id = auditLogId
```

---

## 4. Refund 기준

### 결정

라운드 취소 환불은 `blackjack_round_players.final_bet_amount`를 기준으로 한다.

`BET` ledger만 보고 환불하지 않는다.  
Double 이후 서버가 재시작되면 최초 베팅액보다 실제 확정 베팅액이 커지기 때문이다.

### 예시

```text
처음 베팅: 1,000P
Double 추가 베팅: 1,000P
final_bet_amount: 2,000P
서버 재시작으로 라운드 취소
환불액: 2,000P
```

### 환불 처리 규칙

```text
1. IN_PROGRESS 라운드를 조회한다.
2. 이미 SETTLED된 라운드는 환불하지 않는다.
3. 라운드를 CANCELLED로 변경한다.
4. 참여자별 final_bet_amount를 환불한다.
5. REFUND ledger를 기록한다.
6. idempotency_key = refund:{roundId}:{userId} 로 중복 환불을 막는다.
```

환불 transaction은 여러 번 재실행되어도 같은 유저에게 같은 라운드 환불이 두 번 지급되면 안 된다.

---

## 5. Private Socket Event

### 결정

테이블 상태와 개인 지갑 상태를 socket event 레벨에서 분리한다.

모든 유저에게 broadcast 가능한 정보는 `table:state`, `round:settled`에 담는다.  
본인에게만 보여야 하는 정보는 private event로만 보낸다.

### Broadcast 가능

```text
좌석 번호
닉네임
공개용 playerId
좌석 상태
베팅 금액
공개 카드
현재 턴
라운드 결과
```

### Broadcast 금지

```text
walletBalance
point ledger
Better Auth raw user_id
인증 token
관리자 role
```

### 이벤트 분리

```text
table:state
→ table room 전체 broadcast
→ walletBalance 포함 금지

round:settled
→ table room 전체 broadcast
→ result, betAmount, payout, netProfit 포함
→ walletBalance 포함 금지

wallet:updated
→ user:{userId} private room에만 emit
→ balance, delta, ledgerId 포함 가능
```

### 권장 타입

```ts
type RoundSettledEvent = {
  tableId: string;
  roundId: string;
  results: Array<{
    seatNo: number;
    playerId: string;
    nickname: string;
    result:
      | "PLAYER_BLACKJACK"
      | "PLAYER_WIN"
      | "DEALER_WIN"
      | "PUSH"
      | "PLAYER_BUST"
      | "DEALER_BUST";
    betAmount: number;
    payout: number;
    netProfit: number;
  }>;
};

type WalletUpdatedEvent = {
  balance: number;
  delta: number;
  reason: string;
  ledgerId: string;
};
```

재접속 시에도 `table:state`와 `wallet:updated`를 별도로 보낸다.

---

## 6. maxBet 계산 위치

### 결정

최대 베팅 가능 금액은 서버에서만 계산하고 서버에서 최종 검증한다.

클라이언트는 서버가 내려준 값을 표시만 한다.  
클라이언트가 보내는 `amount`는 절대 신뢰하지 않는다.

### 초기 베팅 공식

MVP에서 `maxBet`은 "최초 베팅 한도"를 의미한다.

```text
policyCap = blackjack_tables.max_bet ?? dailyReward * 2
maxInitialBet = min(floor(walletBalance * 0.1), policyCap)
```

기본값:

```text
dailyReward = 3,000P
policyCap = 6,000P
```

검증:

```text
amount >= table.min_bet
amount <= maxInitialBet
wallet.balance >= amount
```

### Double 규칙

Double은 최초 베팅 한도를 다시 계산하지 않는다.  
Double은 이미 확정된 `currentBet`과 현재 잔액 기준으로 검증한다.

```text
player cards.length = 2
wallet.balance >= currentBet
additionalBet = currentBet
final_bet_amount = currentBet * 2
```

Double로 증가한 `final_bet_amount`는 refund 기준이 된다.

### 클라이언트 표시

테이블 진입/재동기화 시 서버는 본인에게만 다음 값을 내려줄 수 있다.

```ts
type MyBetLimitsEvent = {
  minBet: number;
  maxInitialBet: number;
  canBet: boolean;
};
```

이 값은 UI 표시용이다. 실제 `round:bet` 처리 시 서버가 다시 계산한다.

---

## 7. 구현 체크리스트

AI 에이전트는 포인트 관련 기능을 구현할 때 아래 체크리스트를 통과시켜야 한다.

```text
[ ] commandId 또는 deterministic idempotency key가 있는가?
[ ] wallet row lock을 잡는가?
[ ] balance_before / balance_after를 기록하는가?
[ ] wallets.balance와 point_ledgers insert가 같은 transaction인가?
[ ] 음수 잔액을 DB와 애플리케이션 양쪽에서 막는가?
[ ] REFUND가 final_bet_amount 기준인가?
[ ] REFUND가 중복 지급되지 않는가?
[ ] walletBalance가 broadcast event에 포함되지 않는가?
[ ] maxBet을 서버에서 다시 계산하는가?
[ ] 재접속 시 table state와 private wallet state가 모두 복구되는가?
```

---

## 8. 참고 공식 문서

- NestJS Gateway: https://docs.nestjs.com/websockets/gateways
- Socket.IO Redis adapter: https://socket.io/docs/v4/redis-adapter/
- Drizzle transactions: https://orm.drizzle.team/docs/transactions
- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
