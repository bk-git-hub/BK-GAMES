# Realtime Baccarat Table Spec

BK Games의 실시간 바카라 테이블 사양이다.

초기 버전은 단일 Punto Banco 바카라 테이블을 기준으로 한다.

---

## 1. 네임스페이스

```text
/baccarat
```

바카라는 블랙잭과 별도 namespace를 사용한다.

---

## 2. 핵심 모델

```text
BaccaratTable
BaccaratShoe
BaccaratRound
BaccaratBet
BaccaratReveal
BaccaratRoadmapSnapshot
BaccaratAction
```

바카라는 블랙잭처럼 좌석별 턴이 없다.

초기 바카라는 seatless table로 시작한다.

```text
유저는 테이블에 입장한다.
베팅 창에서 Player / Banker / Tie 중 하나에 베팅한다.
라운드는 서버가 자동 진행한다.
```

---

## 3. 테이블 상태

```text
OPEN
MAINTENANCE
CLOSED
```

| 상태 | 설명 |
|---|---|
| OPEN | 입장/베팅/라운드 진행 가능 |
| MAINTENANCE | 새 라운드 시작 중지 |
| CLOSED | 입장 불가 |

---

## 4. 라운드 상태 머신

```text
WAITING
→ WAITING_BETS
→ DEALING
→ SQUEEZE
→ SETTLING
→ SETTLED
→ ROUND_END
→ WAITING_BETS
```

예외 상태:

```text
CANCELLED
```

### 4.1 WAITING

라운드 시작 대기 상태다.

진입 조건:

```text
테이블이 처음 열렸을 때
테이블이 MAINTENANCE일 때
진행할 수 있는 유저가 없을 때
```

### 4.2 WAITING_BETS

베팅 가능 단계다.

규칙:

```text
제한 시간은 기본 15초다.
유저는 Player / Banker / Tie 중 하나에 베팅한다.
MVP에서는 유저당 라운드 1개 bet만 허용한다.
베팅은 선차감한다.
accepted bet은 취소/수정할 수 없다.
같은 commandId 재시도는 같은 bet details일 때만 idempotent 성공한다.
```

### 4.3 DEALING

서버가 카드를 결정한다.

규칙:

```text
Player 초기 2장
Banker 초기 2장
Natural 여부 확인
필요하면 Player third card 결정
필요하면 Banker third card 결정
reveal slot 목록 생성
```

DEALING 단계에서 클라이언트에는 hidden card placeholder만 전송한다.

DEALING 단계에서 서버가 카드와 결과를 계산해도, reveal 전에는 카드 값과 hand total을 클라이언트에 보내지 않는다.

### 4.4 SQUEEZE

카드를 순서대로 공개하는 단계다.

reveal order:

```text
PLAYER_CARD_1
BANKER_CARD_1
PLAYER_CARD_2
BANKER_CARD_2
PLAYER_CARD_3 if present
BANKER_CARD_3 if present
```

각 reveal slot은 다음 중 하나로 완료된다.

```text
squeezer가 squeeze:complete 전송
서버 timeout
```

카드 값은 reveal 완료 시점에만 broadcast한다.

SQUEEZE는 UX 단계이며 결과를 바꾸지 않는다.

진행 원칙:

```text
현재 reveal slot만 active 상태다.
squeezer만 squeeze:progress와 squeeze:complete를 보낼 수 있다.
관전자는 squeeze:progressed와 card:revealed를 받는다.
progress는 0-100 정수다.
progress는 card value, suit, total을 포함하지 않는다.
timeout 또는 disconnect 시 system auto reveal한다.
```

### 4.5 SETTLING

서버가 결과를 계산하고 포인트를 정산한다.

결과:

```text
PLAYER
BANKER
TIE
```

정산 중에는 모든 point change가 idempotent transaction으로 처리되어야 한다.

### 4.6 SETTLED

정산 결과를 테이블에 표시한다.

### 4.7 ROUND_END

결과를 일정 시간 보여준 뒤 다음 라운드로 넘어간다.

기본 시간:

```text
5초
```

---

## 5. Baccarat Draw Rules

Natural:

```text
Player 또는 Banker 초기 2장 total이 8 또는 9면 추가 카드를 뽑지 않는다.
```

Player rule:

```text
0-5: draw
6-7: stand
8-9: natural
```

Banker rule when Player stands:

```text
Banker 0-5: draw
Banker 6-7: stand
```

Banker rule when Player draws a third card:

| Banker total | Banker draws when Player third card is |
|---:|---|
| 0-2 | any card |
| 3 | any card except 8 |
| 4 | 2-7 |
| 5 | 4-7 |
| 6 | 6-7 |
| 7 | never |

Card values for this table:

```text
A = 1
2-9 = face value
10/J/Q/K = 0
```

---

## 5.5 Shoe, Roadmap, And Result History

### 5.5.1 Shoe Policy

MVP shoe settings:

```text
deckCount = 8
shoePenetrationPercent = 75
minimumCardsBeforeRound = 6
```

Round start rule:

```text
round 중에는 절대 reshuffle하지 않는다.
round 시작 전 cut-card position을 넘겼거나 remaining card가 6장 미만이면 새 shoe를 시작한다.
```

Shoe state is server-only.

Do not broadcast:

```text
remaining card order
future cards
server seed
encrypted shoe state
```

Clients may receive only display-safe shoe metadata:

```text
shoeId
shoeNo
cardsDealt
cardsRemaining
penetrationPercent
willShuffleAfterRound
```

### 5.5.2 Result History

바카라 MVP는 두 가지 결과판을 제공한다.

```text
Bead Plate
Basic Big Road
```

Both are display-only.

They do not affect:

```text
card dealing
bet validity
payout
settlement
```

Bead Plate:

```text
settled round를 시간순으로 grid에 채운다.
Player = blue
Banker = red
Tie = green
Natural은 optional badge로 표시할 수 있다.
```

Basic Big Road:

```text
Player/Banker streak을 표시한다.
Tie는 새 streak cell을 만들지 않고 현재 cell에 tie badge/count로 표시한다.
첫 결과가 Tie인 경우 별도 Tie marker를 허용한다.
```

MVP에서 제외:

```text
Big Eye Boy
Small Road
Cockroach Pig
roadmap prediction
```

Roadmap source of truth:

```text
settled baccarat_rounds
```

Roadmap snapshots may be cached for fast table:state rendering, but they must be rebuildable from settled rounds.

---

## 6. Client To Server Events

### 6.1 table:join

```ts
type BaccaratTableJoinPayload = {
  tableId: string;
};
```

### 6.2 table:leave

```ts
type BaccaratTableLeavePayload = {
  tableId: string;
};
```

### 6.3 bet:place

```ts
type BaccaratPlaceBetPayload = {
  commandId: string;
  tableId: string;
  betType: "PLAYER" | "BANKER" | "TIE";
  amount: string;
};
```

규칙:

```text
commandId는 필수다.
같은 commandId 재시도는 같은 결과를 반환해야 한다.
amount는 string으로 전달하고 서버에서 bigint로 파싱한다.
```

### 6.4 squeeze:progress

선정된 squeezer가 카드 reveal 진행도를 보낼 수 있다.

```ts
type BaccaratSqueezeProgressPayload = {
  tableId: string;
  roundId: string;
  revealId: string;
  progress: number;
};
```

규칙:

```text
progress는 0-100 정수다.
서버는 rate limit을 적용한다.
progress에는 card value가 포함되지 않는다.
```

### 6.5 squeeze:complete

선정된 squeezer가 현재 reveal slot을 완료한다.

```ts
type BaccaratSqueezeCompletePayload = {
  tableId: string;
  roundId: string;
  revealId: string;
};
```

서버는 revealId와 현재 squeezer를 검증한 뒤 실제 카드 값을 broadcast한다.

---

## 7. Server To Client Events

### 7.1 table:state

```ts
type BaccaratTableState = {
  tableId: string;
  status: "OPEN" | "MAINTENANCE" | "CLOSED";
  phase:
    | "WAITING"
    | "WAITING_BETS"
    | "DEALING"
    | "SQUEEZE"
    | "SETTLING"
    | "SETTLED"
    | "ROUND_END"
    | "CANCELLED";
  round: BaccaratRoundSnapshot | null;
  betting: BaccaratBettingSnapshot;
  shoe: BaccaratShoeSnapshot;
  player: BaccaratHandSnapshot;
  banker: BaccaratHandSnapshot;
  reveal: BaccaratRevealSnapshot | null;
  roadmaps: BaccaratRoadmapSnapshot;
  recentRounds: BaccaratRoundResultView[];
  timers: BaccaratTimerSnapshot;
  version: number;
  updatedAt: string;
};
```

### 7.2 table:event

```ts
type BaccaratTableEvent = {
  tableId: string;
  type:
    | "TABLE_JOINED"
    | "BET_PLACED"
    | "ROUND_STARTED"
    | "SHOE_STARTED"
    | "SQUEEZE_STARTED"
    | "CARD_REVEALED"
    | "ROUND_SETTLED"
    | "ROUND_RESET"
    | "PLAYER_DISCONNECTED";
  actorUserId: string | null;
  stateVersion: number;
  createdAt: string;
};
```

### 7.3 squeeze:progressed

```ts
type BaccaratSqueezeProgressedEvent = {
  tableId: string;
  roundId: string;
  revealId: string;
  squeezerUserId: string | null;
  progress: number;
};
```

### 7.4 card:revealed

```ts
type BaccaratCardRevealedEvent = {
  tableId: string;
  roundId: string;
  revealId: string;
  slot:
    | "PLAYER_CARD_1"
    | "BANKER_CARD_1"
    | "PLAYER_CARD_2"
    | "BANKER_CARD_2"
    | "PLAYER_CARD_3"
    | "BANKER_CARD_3";
  card: BaccaratCardView;
  nextReveal: BaccaratRevealSnapshot | null;
};
```

### 7.5 round:settled

```ts
type BaccaratRoundSettledEvent = {
  tableId: string;
  roundId: string;
  outcome: "PLAYER" | "BANKER" | "TIE";
  playerTotal: number;
  bankerTotal: number;
  isNatural: boolean;
  totalCards: number;
  results: Array<{
    playerId: string;
    nickname: string;
    betType: "PLAYER" | "BANKER" | "TIE";
    betAmount: string;
    payoutAmount: string;
    netAmount: string;
  }>;
  roadmaps: BaccaratRoadmapSnapshot;
};
```

`round:settled`는 table room broadcast다.

wallet balance는 포함하지 않는다.

### 7.6 wallet:updated

```ts
type BaccaratWalletUpdatedEvent = {
  balance: string;
  delta: string;
  reason: "BET_PLACED" | "PAYOUT" | "PUSH_REFUND" | "CANCEL_REFUND";
  ledgerId: string;
};
```

`wallet:updated`는 `user:{userId}` private room에만 보낸다.

---

## 8. View Types

```ts
type BaccaratRoundSnapshot = {
  roundId: string;
  shoeId: string;
  roundNo: number;
  status:
    | "WAITING_BETS"
    | "DEALING"
    | "SQUEEZE"
    | "SETTLING"
    | "SETTLED"
    | "CANCELLED";
  outcome: "PLAYER" | "BANKER" | "TIE" | null;
  resultFlags: {
    isNatural: boolean;
    totalCards: number | null;
  };
};

type BaccaratBettingSnapshot = {
  minBet: string;
  maxMainBet: string;
  maxTotalBetPerUser: string;
  canPlaceBet: boolean;
  totals: {
    player: string;
    banker: string;
    tie: string;
  };
  myBet: {
    betId: string;
    betType: "PLAYER" | "BANKER" | "TIE";
    amount: string;
    status: "PLACED" | "SETTLED" | "CANCELLED";
  } | null;
};

type BaccaratShoeSnapshot = {
  shoeId: string;
  shoeNo: number;
  deckCount: number;
  cardsDealt: number;
  cardsRemaining: number;
  penetrationPercent: number;
  willShuffleAfterRound: boolean;
};

type BaccaratHandSnapshot = {
  cards: BaccaratCardView[];
  total: number | null;
  isNatural: boolean;
};
```

`BaccaratHandSnapshot.total` must remain `null` until the total can be shown without revealing hidden card values.

Recommended:

```text
WAITING_BETS: null
DEALING: null
SQUEEZE: null until all cards in that hand are revealed
SETTLING/SETTLED: final total
```

```ts
type BaccaratCardView =
  | {
      slot:
        | "PLAYER_CARD_1"
        | "BANKER_CARD_1"
        | "PLAYER_CARD_2"
        | "BANKER_CARD_2"
        | "PLAYER_CARD_3"
        | "BANKER_CARD_3";
      rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
      suit: "clubs" | "diamonds" | "hearts" | "spades";
      hidden?: false;
    }
  | {
      slot:
        | "PLAYER_CARD_1"
        | "BANKER_CARD_1"
        | "PLAYER_CARD_2"
        | "BANKER_CARD_2"
        | "PLAYER_CARD_3"
        | "BANKER_CARD_3";
      hidden: true;
    };

type BaccaratRevealSnapshot = {
  revealId: string;
  slot:
    | "PLAYER_CARD_1"
    | "BANKER_CARD_1"
    | "PLAYER_CARD_2"
    | "BANKER_CARD_2"
    | "PLAYER_CARD_3"
    | "BANKER_CARD_3";
  squeezerUserId: string | null;
  status: "PENDING" | "ACTIVE" | "REVEALED" | "SKIPPED";
  startedAt: string | null;
  endsAt: string;
  progress: number;
  isAutoReveal: boolean;
};

type BaccaratTimerSnapshot = {
  bettingEndsAt: string | null;
  revealEndsAt: string | null;
  roundEndsAt: string | null;
};

type BaccaratRoundResultView = {
  roundId: string;
  roundNo: number;
  outcome: "PLAYER" | "BANKER" | "TIE";
  playerTotal: number;
  bankerTotal: number;
  isNatural: boolean;
  totalCards: number;
};

type BaccaratRoadmapSnapshot = {
  beadPlate: Array<{
    roundId: string;
    row: number;
    col: number;
    outcome: "PLAYER" | "BANKER" | "TIE";
    playerTotal: number;
    bankerTotal: number;
    isNatural: boolean;
  }>;
  bigRoad: Array<{
    roundId: string;
    row: number;
    col: number;
    outcome: "PLAYER" | "BANKER";
    tieCount: number;
  }>;
};
```

---

## 9. Error Codes

```text
UNAUTHORIZED
TABLE_NOT_FOUND
TABLE_NOT_OPEN
INVALID_TABLE_ID
INVALID_COMMAND_ID
INVALID_BET_TYPE
INVALID_BET_AMOUNT
BETTING_CLOSED
BET_ALREADY_PLACED
BET_TOO_LOW
BET_TOO_HIGH
WALLET_NOT_FOUND
WALLET_NOT_ACTIVE
INSUFFICIENT_BALANCE
IDEMPOTENCY_CONFLICT
ROUND_NOT_ACTIVE
ROUND_NOT_FOUND
REVEAL_NOT_ACTIVE
NOT_SQUEEZER
INVALID_REVEAL_ID
SQUEEZE_RATE_LIMITED
SHOE_NOT_READY
ROUND_CANCELLED
SETTLEMENT_CONFLICT
UNKNOWN_ERROR
```

---

## 10. Reconnect

재접속 시 서버는 다음을 다시 보낸다.

```text
현재 table:state
현재 phase
현재 betting totals
내 베팅 정보
현재 reveal slot
이미 공개된 카드
아직 공개되지 않은 hidden placeholders
shoe display metadata
recentRounds
roadmaps
private wallet:updated 또는 wallet snapshot
```

reconnect 시에도 hidden card value는 공개 전까지 보내지 않는다.

재접속 응답은 최근 이벤트 replay가 없어도 화면을 복구할 수 있는 full snapshot이어야 한다.

---

## 11. 이벤트 설계 원칙

```text
클라이언트는 베팅 의도와 squeeze interaction만 보낸다.
서버가 카드와 결과를 결정한다.
서버가 reveal 가능한 카드만 공개한다.
table:state는 언제든 재동기화 가능한 source of truth다.
wallet balance는 private event로만 보낸다.
squeeze progress는 UX 이벤트이고 정산에 영향을 주지 않는다.
```
