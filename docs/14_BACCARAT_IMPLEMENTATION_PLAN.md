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
2. game-engine roadmap helper
3. db schema와 transaction helper
4. shared socket contract
5. game-server BaccaratModule/Gateway
6. web /baccarat UI
7. smoke/e2e 검증
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
Bead Plate 계산
basic Big Road 계산
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
baccarat_reveals
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
minimum_cards_before_round
result_history_limit
tie_payout_numerator
tie_payout_denominator
banker_commission_bps
roadmap_config
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
minimum_cards_before_round = 6
result_history_limit = 72
tie_payout = 8:1
banker_commission_bps = 500
roadmap_config = Bead Plate + basic Big Road
```

### 4.2 baccarat_shoes

```text
id
table_id
shoe_no
status
deck_count
cards_total
cards_dealt
cards_remaining
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

Shoe 운영 규칙:

```text
round 중에는 reshuffle하지 않는다.
round 시작 전에 cut_card_position을 넘겼거나 cards_remaining < minimum_cards_before_round면 새 shoe를 만든다.
encrypted_state와 남은 카드 순서는 클라이언트에 공개하지 않는다.
```

### 4.3 baccarat_rounds

```text
id
table_id
shoe_id
round_index_in_shoe
round_no
status
player_cards
banker_cards
player_total
banker_total
outcome
is_natural
total_cards
result_flags
rule_snapshot
reveal_state
roadmap_snapshot
betting_opens_at
betting_closes_at
dealt_at
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

`player_cards`와 `banker_cards`는 서버 저장용이다.

Socket state에는 reveal 전 card value를 포함하지 않는다.

### 4.4 baccarat_reveals

```text
id
round_id
table_id
slot
status
sequence
squeezer_user_id
progress
started_at
ends_at
revealed_at
revealed_by
card_snapshot
created_at
updated_at
```

slot:

```text
PLAYER_CARD_1
BANKER_CARD_1
PLAYER_CARD_2
BANKER_CARD_2
PLAYER_CARD_3
BANKER_CARD_3
```

status:

```text
PENDING
ACTIVE
REVEALED
SKIPPED
```

`card_snapshot`은 reveal 완료 후에만 채운다.

reveal 전에는 null이어야 한다.

### 4.5 baccarat_bets

```text
id
round_id
table_id
user_id
bet_type
bet_group
status
amount
odds_numerator
odds_denominator
commission_bps_snapshot
payout_amount
net_amount
placed_ledger_id
settlement_ledger_id
refund_ledger_id
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

bet_group:

```text
MAIN
SIDE
```

MVP는 `MAIN`만 사용한다.

status:

```text
PLACED
SETTLED
CANCELLED
```

MVP 제약:

```text
unique round_id + user_id
unique round_id + user_id + command_id
```

Phase 2 side bet을 추가하면 다음 제약으로 바꾼다.

```text
unique round_id + user_id + bet_type
```

Accepted odds snapshot:

```text
Player: odds_numerator = 2, odds_denominator = 1
Banker: odds_numerator = 195, odds_denominator = 100, commission_bps_snapshot = 500
Tie: odds_numerator = 9, odds_denominator = 1
```

정산은 항상 bet row의 snapshot을 기준으로 한다.

### 4.6 baccarat_actions

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
SHOE_START
DEAL
SQUEEZE_PROGRESS
REVEAL_CARD
AUTO_REVEAL
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
baccarat:push:{roundId}:{betId}
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

Ledger 생성 원칙:

```text
BET ledger는 bet accepted 시 생성한다.
PAYOUT ledger는 winning bet이고 payoutAmount > 0일 때만 생성한다.
PUSH_REFUND ledger는 Player/Banker bet이 Tie로 push될 때 생성한다.
CANCEL_REFUND ledger는 round cancel/refund 시에만 생성한다.
losing bet에는 추가 settlement ledger를 만들지 않는다.
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

검증:

```text
현재 ACTIVE reveal만 complete할 수 있다.
squeezer_user_id가 일치해야 한다.
progress는 0-100 정수다.
progress는 rate limit한다.
progress에는 card value/suit/total이 없어야 한다.
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

reconnect:

```text
이미 공개된 reveal은 card_snapshot을 포함한다.
현재 active reveal은 progress와 ends_at을 포함한다.
아직 공개되지 않은 reveal은 hidden placeholder만 포함한다.
```

정산:

```text
squeeze는 결과에 영향을 주지 않는다.
squeeze 완료 여부와 무관하게 서버가 이미 결정한 카드로 정산한다.
```

---

## 7. Roadmap 구현 기준

Roadmap은 game result display이며 정산 로직이 아니다.

MVP 포함:

```text
Bead Plate
basic Big Road
```

MVP 제외:

```text
Big Eye Boy
Small Road
Cockroach Pig
prediction UI
```

구현 위치:

```text
packages/game-engine/src/baccarat/roadmap
```

입력:

```text
settled rounds ordered by round_no
```

출력:

```text
BaccaratRoadmapSnapshot
```

규칙:

```text
Bead Plate는 시간순 grid다.
Big Road는 Player/Banker streak grid다.
Tie는 새 Big Road cell을 만들지 않고 tieCount badge로 누적한다.
roadmap_snapshot은 캐시 가능하지만 settled rounds에서 재생성 가능해야 한다.
```

---

## 8. Recovery / Cancellation 기준

서버 재시작 또는 round failure 시 다음 기준을 따른다.

```text
WAITING_BETS / DEALING / SQUEEZE 단계에서 복구 불가하면 round CANCELLED + accepted bet refund
SETTLING 중 일부 bet만 정산된 경우 idempotency key로 settlement를 재개
SETTLED round는 변경하지 않는다.
cancelled round는 roadmap에 포함하지 않는다.
cancelled round는 shoe cards_dealt 처리 정책을 명확히 기록한다.
```

MVP 권장:

```text
DEALING/SQUEEZE 중 서버가 죽으면 round를 CANCELLED 처리하고 accepted bet을 환불한다.
이미 shoe에서 빠진 카드는 해당 shoe를 VOID 처리하고 새 shoe를 시작한다.
```

---

## 9. Server Authoritative 체크리스트

구현 PR은 다음을 만족해야 한다.

```text
[ ] 클라이언트가 card value를 정하지 않는가?
[ ] hidden card value가 reveal 전 socket state에 포함되지 않는가?
[ ] bet:place에 commandId가 있는가?
[ ] 같은 commandId 재시도에 포인트가 중복 차감되지 않는가?
[ ] walletBalance가 table broadcast에 포함되지 않는가?
[ ] Player/Banker/Tie payout이 정수 포인트로 계산되는가?
[ ] accepted odds snapshot을 bet row에 저장하는가?
[ ] Tie 시 Player/Banker bet이 push 처리되는가?
[ ] Banker commission이 floor(bet * 95 / 100)인가?
[ ] losing bet에 추가 PAYOUT ledger를 만들지 않는가?
[ ] round cancel refund가 중복 지급되지 않는가?
[ ] reconnect 시 hidden/revealed card 상태가 정확히 복구되는가?
[ ] Bead Plate와 basic Big Road가 settled rounds에서 재생성 가능한가?
[ ] cut-card 이후 다음 라운드 전에 새 shoe가 시작되는가?
```

---

## 10. 구현에서 제외할 것

바카라 코어 구현 중에는 다음을 하지 않는다.

```text
블랙잭 리팩터링
공용 GameRound 추상화
side bet 구현
admin 신규 구현
payment/cash 기능
다중 테이블
Redis adapter
advanced roadmaps
roadmap prediction
```

필요해 보여도 다음 작업 단위로 분리한다.

---

## 11. 최종 검증

바카라 개발 완료 시 권장 검증:

```text
pnpm --filter @bk-games/game-engine test
pnpm --filter @bk-games/db smoke:baccarat-betting
pnpm --filter @bk-games/db smoke:baccarat-settlement
pnpm --filter @bk-games/shared typecheck
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
Bead Plate / basic Big Road 갱신
reconnect 후 squeeze 상태 복구
round:settled 표시
다음 라운드 reset
```
