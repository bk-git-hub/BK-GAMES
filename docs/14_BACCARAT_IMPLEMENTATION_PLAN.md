# Baccarat Implementation Plan

바카라를 실제 개발할 때 따를 작업 순서와 구현 기준이다.

이 문서는 코드 구현 전에 읽는 작업 지시서 역할을 한다.

---

## 1. 목표

블랙잭 구조를 깨지 않고 두 번째 게임인 바카라를 추가한다.

바카라 구현은 다음 원칙을 따른다.

```text
게임 룰은 packages/game-engine
포인트 변경은 packages/db transaction
실시간 상태는 apps/game-server
화면은 apps/web
event payload type은 packages/shared
```

---

## 2. 구현 순서

권장 순서:

```text
1. game-engine baccarat 룰
2. db schema와 transaction helper
3. shared socket contract
4. game-server BaccaratModule/Gateway
5. web /baccarat UI
6. smoke/e2e 검증
```

UI를 먼저 만들지 않는다.

바카라는 서버 권위 딜링과 정산이 먼저다.

---

## 3. Commit 단위

### 1. 바카라 엔진

```text
feat: baccarat engine basic rules
```

작업:

```text
packages/game-engine/src/baccarat
card value 계산
hand total 계산
natural 판정
Player draw rule
Banker draw rule
round outcome 계산
payout 계산
unit test
```

검증:

```text
pnpm --filter @bk-games/game-engine test
```

### 2. 바카라 DB schema

```text
feat: add baccarat schema
```

작업:

```text
packages/db/src/schema.ts
baccarat_tables
baccarat_shoes
baccarat_rounds
baccarat_bets
baccarat_actions
drizzle migration
main baccarat table seed
```

검증:

```text
pnpm --filter @bk-games/db typecheck
pnpm --filter @bk-games/db db:generate
```

### 3. 바카라 베팅 transaction

```text
feat: add baccarat betting transaction
```

작업:

```text
placeBaccaratBet
BET ledger
idempotency
wallet row lock
bet amount validation
round 생성 또는 조회
smoke:baccarat-betting
```

검증:

```text
pnpm --filter @bk-games/db smoke:baccarat-betting
```

### 4. 바카라 정산 transaction

```text
feat: add baccarat settlement transaction
```

작업:

```text
settleBaccaratRound
PAYOUT ledger
PUSH_REFUND ledger
CANCEL_REFUND ledger
idempotency
round/bet status update
smoke:baccarat-settlement
```

검증:

```text
pnpm --filter @bk-games/db smoke:baccarat-settlement
```

### 5. 바카라 socket contract

```text
feat: add baccarat socket contract
```

작업:

```text
packages/shared/src/baccarat-events.ts
namespace
client events
server events
state snapshots
error codes
```

검증:

```text
pnpm --filter @bk-games/shared typecheck
```

### 6. 바카라 game-server

```text
feat: add realtime baccarat server
```

작업:

```text
apps/game-server/src/baccarat
BaccaratModule
BaccaratGateway
BaccaratTableService
BaccaratTableConfigService
BaccaratSettlementService
betting timer
squeeze timer
round reset timer
private wallet update
```

검증:

```text
pnpm --filter game-server test
pnpm --filter game-server typecheck
```

### 7. 바카라 web UI

```text
feat: add baccarat table UI
```

작업:

```text
apps/web/src/app/baccarat
game token 사용
socket 연결
bet panel
Player / Banker / Tie zones
squeeze card component
round result
wallet display
recent history
```

검증:

```text
pnpm --filter web typecheck
pnpm --filter web lint
```

---

## 4. DB Schema 초안

### 4.1 baccarat_tables

```text
id
code
name
status
min_bet
max_main_bet
max_total_bet_per_user
betting_timeout_seconds
squeeze_timeout_seconds
round_end_delay_seconds
deck_count
shoe_penetration_percent
tie_payout_numerator
tie_payout_denominator
banker_commission_bps
rules
created_at
updated_at
```

status:

```text
OPEN
MAINTENANCE
CLOSED
```

기본값:

```text
code = main
name = Main Baccarat Table
status = OPEN
min_bet = 100
max_main_bet = 6000
max_total_bet_per_user = 6000
betting_timeout_seconds = 15
squeeze_timeout_seconds = 8
round_end_delay_seconds = 5
deck_count = 8
shoe_penetration_percent = 75
tie_payout = 8:1
banker_commission_bps = 500
```

### 4.2 baccarat_shoes

```text
id
table_id
status
deck_count
cards_total
cards_dealt
cut_card_position
shuffle_algorithm
server_seed_hash
encrypted_state
state_version
started_at
ended_at
created_at
updated_at
```

status:

```text
READY
ACTIVE
COMPLETED
VOID
```

### 4.3 baccarat_rounds

```text
id
table_id
shoe_id
round_no
status
player_cards
banker_cards
player_total
banker_total
outcome
is_natural
rule_snapshot
reveal_state
betting_opens_at
betting_closes_at
started_at
settled_at
cancelled_at
cancel_reason
created_at
updated_at
```

status:

```text
WAITING_BETS
DEALING
SQUEEZE
SETTLING
SETTLED
CANCELLED
```

outcome:

```text
PLAYER
BANKER
TIE
```

### 4.4 baccarat_bets

```text
id
round_id
table_id
user_id
bet_type
status
amount
payout_amount
net_amount
placed_ledger_id
settlement_ledger_id
command_id
created_at
settled_at
updated_at
```

bet_type:

```text
PLAYER
BANKER
TIE
```

status:

```text
PLACED
SETTLED
CANCELLED
```

MVP 제약:

```text
unique round_id + user_id
```

Phase 2 side bet을 추가하면 다음 제약으로 바꾼다.

```text
unique round_id + user_id + bet_type
```

### 4.5 baccarat_actions

```text
id
round_id
bet_id
user_id
actor_type
action_type
action_sequence
command_id
amount
payload
created_at
```

actor_type:

```text
PLAYER
SYSTEM
```

action_type:

```text
PLACE_BET
DEAL
SQUEEZE_PROGRESS
REVEAL_CARD
SETTLE
CANCEL
```

---

## 5. Wallet Ledger 규칙

바카라는 기존 `point_ledgers`를 사용한다.

```text
category = GAME
gameType = BACCARAT
```

type:

```text
BET
PAYOUT
PUSH_REFUND
CANCEL_REFUND
```

idempotency key:

```text
baccarat:bet:{roundId}:{userId}:{commandId}
baccarat:settlement:{roundId}:{betId}
baccarat:cancel:{roundId}:{betId}
```

reference:

```text
referenceType = BACCARAT_ROUND
referenceId = roundId
```

모든 포인트 변경은 다음을 지킨다.

```text
DB transaction
wallet row lock
balance_before / balance_after 기록
point_ledger insert
wallet update
idempotency check
```

---

## 6. Squeeze 구현 기준

hidden card value는 reveal 전 클라이언트에 보내지 않는다.

구현 흐름:

```text
server decides full round cards
server stores card state
client receives hidden placeholders
server opens reveal slot
squeezer sends progress and complete
server emits revealed card
server moves to next reveal slot
```

timeout:

```text
reveal slot마다 기본 8초
timeout이면 system auto reveal
```

disconnect:

```text
squeezer 연결이 끊기면 system auto reveal
```

정산:

```text
squeeze는 결과에 영향을 주지 않는다.
squeeze 완료 여부와 무관하게 서버가 이미 결정한 카드로 정산한다.
```

---

## 7. Server Authoritative 체크리스트

구현 PR은 다음을 만족해야 한다.

```text
[ ] 클라이언트가 card value를 정하지 않는가?
[ ] hidden card value가 reveal 전 socket state에 포함되지 않는가?
[ ] bet:place에 commandId가 있는가?
[ ] 같은 commandId 재시도에 포인트가 중복 차감되지 않는가?
[ ] walletBalance가 table broadcast에 포함되지 않는가?
[ ] Player/Banker/Tie payout이 정수 포인트로 계산되는가?
[ ] Tie 시 Player/Banker bet이 push 처리되는가?
[ ] Banker commission이 floor(bet * 95 / 100)인가?
[ ] round cancel refund가 중복 지급되지 않는가?
[ ] reconnect 시 hidden/revealed card 상태가 정확히 복구되는가?
```

---

## 8. 구현에서 제외할 것

바카라 코어 구현 중에는 다음을 하지 않는다.

```text
블랙잭 리팩터링
공용 GameRound 추상화
side bet 구현
admin 신규 구현
payment/cash 기능
다중 테이블
Redis adapter
```

필요해 보여도 다음 작업 단위로 분리한다.

---

## 9. 최종 검증

바카라 개발 완료 시 권장 검증:

```text
pnpm --filter @bk-games/game-engine test
pnpm --filter @bk-games/db smoke:baccarat-betting
pnpm --filter @bk-games/db smoke:baccarat-settlement
pnpm --filter game-server test
pnpm --filter web typecheck
pnpm typecheck
```

frontend까지 구현한 경우 브라우저에서 다음을 확인한다.

```text
로그인 후 /baccarat 진입
game token 발급
/baccarat socket 연결
bet:place 성공
wallet:updated private 수신
squeeze interaction 동작
hidden card value 미노출
round:settled 표시
다음 라운드 reset
```
