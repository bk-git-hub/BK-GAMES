# Realtime Blackjack Table Spec

BK Games의 첫 게임인 테이블제 실시간 블랙잭 게임의 룰과 상태를 정의한다.

---

## 1. 핵심 모델

```text
BlackjackTable
BlackjackSeat
BlackjackRound
RoundPlayer
Dealer
Shoe
```

초기에는 활성 테이블이 1개뿐이지만, 코드와 DB는 다중 테이블을 고려한다.

---

## 2. 테이블

### 2.1 초기 테이블 설정

```text
tableId: main
name: Main Table
seatCount: 5
minBet: 100P
maxInitialBet: min(floor(userPoint * 0.1), dailyReward * 2)
bettingTimeLimit: 15s
turnTimeLimit: 20s
roundEndDelay: 5s
```

### 2.2 테이블 상태

```text
OPEN
PAUSED
CLOSED
```

| 상태 | 설명 |
|---|---|
| OPEN | 입장/착석/플레이 가능 |
| PAUSED | 새 라운드 시작 중지 |
| CLOSED | 입장 불가 |

---

## 3. 좌석

### 3.1 좌석 번호

```text
1, 2, 3, 4, 5
```

### 3.2 좌석 규칙

- 한 좌석에는 한 명만 앉을 수 있다.
- 한 유저는 같은 테이블에서 하나의 좌석만 점유할 수 있다.
- 라운드 중에는 착석/퇴장 정책을 제한할 수 있다.
- 라운드 중 퇴장해도 이미 건 베팅은 유효하다.

### 3.3 좌석 상태

```text
EMPTY
SEATED
BET_PLACED
PLAYING
STOOD
BUST
SETTLED
DISCONNECTED
```

---

## 4. 라운드 상태 머신

```text
WAITING
→ BETTING
→ DEALING
→ PLAYER_TURNS
→ DEALER_TURN
→ SETTLEMENT
→ ROUND_END
→ BETTING
```

### 4.1 WAITING

라운드 시작 대기 상태다.

진입 조건:

- 테이블이 처음 열렸을 때
- 착석 유저가 없을 때
- 테이블이 PAUSED일 때

종료 조건:

- 최소 1명 이상 착석
- 테이블 상태 OPEN
- 다음 라운드 시작 가능

---

### 4.2 BETTING

착석 유저들이 베팅하는 단계다.

규칙:

- 제한 시간은 기본 15초다.
- 베팅하지 않은 유저는 해당 라운드에 참여하지 않는다.
- 베팅한 유저만 카드를 받는다.
- 베팅 시 포인트를 선차감한다.

---

### 4.3 DEALING

서버가 카드를 분배한다.

```text
각 참여 유저: 카드 2장
딜러: upCard 1장 + holeCard 1장
```

딜러의 holeCard는 비공개 상태로 broadcast한다.

---

### 4.4 PLAYER_TURNS

좌석 순서대로 각 유저가 행동한다.

순서:

```text
seat 1 → seat 2 → seat 3 → seat 4 → seat 5
```

단, 해당 라운드에 베팅하지 않은 좌석은 스킵한다.

가능 액션:

```text
Hit
Stand
Double
```

Split은 MVP에서 제외한다.

---

### 4.5 DEALER_TURN

모든 플레이어 턴이 끝나면 딜러가 자동 진행한다.

딜러 룰:

```text
16 이하: Hit
17 이상: Stand
Soft 17: Stand
```

---

### 4.6 SETTLEMENT

좌석별 결과를 계산하고 포인트를 정산한다.

결과:

```text
PLAYER_BLACKJACK
PLAYER_WIN
DEALER_WIN
PUSH
PLAYER_BUST
DEALER_BUST
```

---

### 4.7 ROUND_END

결과를 일정 시간 보여준 뒤 다음 라운드로 넘어간다.

기본 시간:

```text
5초
```

---

## 5. 블랙잭 룰

| 항목 | 정책 |
|---|---|
| 덱 | 6덱 슈 |
| 딜러 룰 | Soft 17 Stand |
| 블랙잭 배당 | 3:2 |
| 일반 승리 | 1:1 |
| 무승부 | Push |
| 플레이어 액션 | Hit, Stand, Double |
| Split | MVP 제외 |
| Insurance | 제외 |
| Surrender | 제외 |

---

## 6. 액션 규칙

### 6.1 Bet

가능 조건:

```text
phase = BETTING
user is seated
user has not bet in current round
amount >= minBet
amount <= serverCalculatedMaxInitialBet
wallet.balance >= amount
```

처리:

```text
wallet 차감
PointLedger BET 기록
RoundPlayer 생성 또는 갱신
seat state = BET_PLACED
```

---

### 6.2 Hit

가능 조건:

```text
phase = PLAYER_TURNS
currentTurnUserId = userId
player is not bust
player has not stood
```

처리:

```text
카드 1장 draw
점수 계산
버스트면 seat state = BUST
다음 턴으로 이동
```

---

### 6.3 Stand

가능 조건:

```text
phase = PLAYER_TURNS
currentTurnUserId = userId
```

처리:

```text
seat state = STOOD
다음 턴으로 이동
```

---

### 6.4 Double

가능 조건:

```text
phase = PLAYER_TURNS
currentTurnUserId = userId
player cards.length = 2
wallet.balance >= currentBet
```

처리:

```text
추가 베팅 차감
PointLedger DOUBLE_BET 기록
finalBetAmount = currentBet * 2
카드 1장 draw
자동 Stand 또는 Bust
다음 턴으로 이동
```

Double은 최초 베팅 한도를 다시 계산하지 않는다.  
Double은 `wallet.balance >= currentBet`일 때만 허용한다.

---

## 7. 타임아웃 처리

### 7.1 Betting timeout

베팅하지 않은 착석 유저는 해당 라운드를 스킵한다.

```text
no bet → round participant 아님
```

### 7.2 Player turn timeout

플레이어 턴에서 제한 시간을 넘기면 자동 Stand 처리한다.

이유:

- 연결 끊김 유저 때문에 라운드가 멈추는 것을 방지
- 자동 Hit보다 손실/조작 논란이 적음

---

## 8. 재접속 처리

유저가 재접속하면 다음 정보를 복원한다.

- 현재 테이블 상태
- 내 좌석 번호
- 현재 라운드 참여 여부
- 내 카드
- 현재 턴
- 남은 타이머
- 지갑 잔액

---

## 9. 서버 권위

클라이언트는 요청만 보낸다.

클라이언트가 결정할 수 없는 것:

- 카드 draw
- 카드 순서
- 딜러 hole card
- 승패 판정
- payout
- 포인트 증감
- 라운드 phase 전환
- 턴 순서

---

## 10. 단일 테이블 운영의 장점

- 초기 UX 검증이 빠르다.
- 실시간 동기화 범위가 작다.
- 서버 메모리 상태 관리가 단순하다.
- 운영자가 로그를 추적하기 쉽다.
- 유저가 적어도 같은 공간에 모이는 느낌을 줄 수 있다.

---

## 11. 추후 다중 테이블 확장

다음 조건이 충족되면 다중 테이블을 검토한다.

- 동시 접속자가 좌석 수를 지속적으로 초과
- 관전자 대기 시간이 길어짐
- 베팅 한도별 테이블이 필요해짐
- 초보/고액/이벤트 테이블 분리가 필요해짐
