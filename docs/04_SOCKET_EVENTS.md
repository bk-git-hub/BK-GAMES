# Socket Events

BK Games의 첫 게임인 실시간 블랙잭 테이블의 Socket.IO 이벤트 계약 초안이다.

---

## 1. 네임스페이스

```text
/blackjack
```

---

## 2. 연결 인증

클라이언트는 연결 시 game token을 전달한다.

```ts
const socket = io(`${GAME_SERVER_URL}/blackjack`, {
  auth: {
    token: gameToken,
  },
});
```

NestJS Gateway는 token 검증 후 다음 정보를 socket에 저장한다.

```text
socket.data.userId
socket.data.nickname
socket.data.role
```

---

## 3. Client → Server

포인트 변경 가능성이 있는 요청은 `commandId`를 포함한다.  
같은 요청을 재시도할 때는 같은 `commandId`를 재사용하며, 서버는 `userId + commandId` 기준으로 중복 처리를 막는다.

## 3.1 table:join

테이블에 입장한다.

```ts
type TableJoinPayload = {
  tableId: string;
};
```

성공 시 서버는 `table:state`를 전송한다.

---

## 3.2 table:leave

테이블에서 나간다.

```ts
type TableLeavePayload = {
  tableId: string;
};
```

라운드 중 이미 베팅한 경우 라운드는 계속 진행된다.

---

## 3.3 seat:take

좌석에 앉는다.

```ts
type SeatTakePayload = {
  tableId: string;
  seatNo: number;
};
```

에러:

```text
SEAT_ALREADY_TAKEN
ALREADY_SEATED
TABLE_NOT_OPEN
INVALID_SEAT
```

---

## 3.4 seat:leave

좌석에서 일어난다.

```ts
type SeatLeavePayload = {
  tableId: string;
};
```

라운드 중에는 즉시 좌석 해제를 제한할 수 있다.  
이미 베팅한 유저는 라운드 종료 후 좌석 해제 처리한다.

---

## 3.5 round:bet

현재 라운드에 베팅한다.

```ts
type RoundBetPayload = {
  commandId: string;
  tableId: string;
  amount: number;
};
```

에러:

```text
NOT_SEATED
NOT_BETTING_PHASE
ALREADY_BET
BET_TOO_LOW
BET_TOO_HIGH
INSUFFICIENT_BALANCE
```

---

## 3.6 player:hit

현재 턴에서 Hit 요청을 보낸다.

```ts
type PlayerHitPayload = {
  tableId: string;
};
```

에러:

```text
NOT_YOUR_TURN
ACTION_NOT_ALLOWED
ROUND_NOT_ACTIVE
```

---

## 3.7 player:stand

현재 턴에서 Stand 요청을 보낸다.

```ts
type PlayerStandPayload = {
  tableId: string;
};
```

---

## 3.8 player:double

현재 턴에서 Double 요청을 보낸다.

```ts
type PlayerDoublePayload = {
  commandId: string;
  tableId: string;
};
```

에러:

```text
DOUBLE_NOT_ALLOWED
INSUFFICIENT_BALANCE
```

---

## 4. Server → Client

## 4.1 table:state

테이블 전체 상태를 전송한다.

```ts
type TableStateEvent = {
  tableId: string;
  status: "OPEN" | "PAUSED" | "CLOSED";
  phase:
    | "WAITING"
    | "BETTING"
    | "DEALING"
    | "PLAYER_TURNS"
    | "DEALER_TURN"
    | "SETTLEMENT"
    | "ROUND_END";
  seats: SeatView[];
  dealer: DealerView;
  round: RoundView | null;
  timers: {
    phaseEndsAt: string | null;
    turnEndsAt: string | null;
  };
};
```

---

## 4.2 seat:updated

좌석 상태가 바뀌었을 때 전송한다.

```ts
type SeatUpdatedEvent = {
  tableId: string;
  seat: SeatView;
};
```

---

## 4.3 round:betting_started

베팅 단계 시작.

```ts
type RoundBettingStartedEvent = {
  tableId: string;
  roundId: string;
  endsAt: string;
  minBet: number;
};
```

---

## 4.4 round:dealt

카드 분배 완료.

```ts
type RoundDealtEvent = {
  tableId: string;
  roundId: string;
  seats: SeatView[];
  dealer: DealerView;
};
```

딜러 hole card는 숨김 처리한다.

---

## 4.5 turn:started

특정 유저의 턴 시작.

```ts
type TurnStartedEvent = {
  tableId: string;
  roundId: string;
  seatNo: number;
  playerId: string;
  endsAt: string;
  availableActions: Array<"HIT" | "STAND" | "DOUBLE">;
};
```

---

## 4.6 player:acted

플레이어 액션 결과.

```ts
type PlayerActedEvent = {
  tableId: string;
  roundId: string;
  seatNo: number;
  action: "HIT" | "STAND" | "DOUBLE" | "TIMEOUT_STAND";
  seat: SeatView;
};
```

---

## 4.7 dealer:played

딜러 턴 결과.

```ts
type DealerPlayedEvent = {
  tableId: string;
  roundId: string;
  dealer: DealerView;
};
```

---

## 4.8 round:settled

라운드 정산 결과.

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
```

`round:settled`는 테이블 전체 broadcast 이벤트다.  
`walletBalance`는 절대 포함하지 않는다.

---

## 4.9 wallet:updated

개인 지갑 변경 결과.

```ts
type WalletUpdatedEvent = {
  balance: number;
  delta: number;
  reason: string;
  ledgerId: string;
};
```

이 이벤트는 `user:{userId}` private room에만 전송한다.  
테이블 room 전체 broadcast에 포함하지 않는다.

---

## 4.10 error

요청 실패.

```ts
type SocketErrorEvent = {
  code: string;
  message: string;
};
```

---

## 5. View Types

```ts
type SeatView = {
  seatNo: number;
  playerId: string | null;
  nickname: string | null;
  state:
    | "EMPTY"
    | "SEATED"
    | "BET_PLACED"
    | "PLAYING"
    | "STOOD"
    | "BUST"
    | "SETTLED"
    | "DISCONNECTED";
  betAmount: number | null;
  cards: CardView[];
  score: number | null;
  isCurrentTurn: boolean;
};

type DealerView = {
  cards: CardView[];
  visibleScore: number | null;
  score: number | null;
};

type CardView =
  | {
      suit: "SPADE" | "HEART" | "DIAMOND" | "CLUB";
      rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
      hidden?: false;
    }
  | {
      hidden: true;
    };
```

---

## 6. 이벤트 설계 원칙

```text
클라이언트 요청은 의도만 전달한다.
서버 응답은 결과 상태를 전달한다.
클라이언트는 상태를 추측하지 않는다.
table:state는 언제든 재동기화 가능한 source of truth 역할을 한다.
지갑 잔액과 포인트 원장은 private event로만 전송한다.
```
