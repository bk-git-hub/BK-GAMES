# Point Wallet

무료 포인트 지갑과 원장 정책을 정의한다.

---

## 1. 핵심 원칙

```text
포인트는 무료로만 지급한다.
포인트는 현금화할 수 없다.
포인트는 유저 간 이전할 수 없다.
포인트 증감은 반드시 PointLedger에 기록한다.
```

---

## 2. 초기 지급 정책

| 항목 | 값 |
|---|---:|
| 가입 보너스 | 10,000P |
| 일일 보상 | 3,000P |
| 7일 연속 출석 보너스 | 10,000P |
| 최소 베팅 | 100P |

---

## 3. 최대 초기 베팅

최대 베팅액은 서버에서 계산하고 서버에서 최종 검증한다.  
클라이언트가 보여주는 값은 UI 표시용일 뿐이며, 클라이언트 요청의 `amount`는 신뢰하지 않는다.

MVP의 `maxBet`은 최초 베팅 한도를 의미한다.

공식:

```text
policyCap = blackjack_tables.max_bet ?? dailyReward * 2
maxInitialBet = min(floor(walletBalance * 0.1), policyCap)
```

기본값:

```text
dailyReward = 3,000P
dailyReward * 2 = 6,000P
```

따라서 최대 베팅은 다음과 같다.

```text
maxInitialBet = min(floor(walletBalance * 0.1), 6,000P)
```

Double은 최초 베팅 한도를 다시 계산하지 않는다.  
Double은 `wallet.balance >= currentBet`을 만족해야 하며, 성공 시 `finalBetAmount = currentBet * 2`가 된다.

---

## 4. 베팅 차감

베팅은 라운드 시작 전에 선차감한다.

```text
round:bet
→ wallet balance 차감
→ PointLedger BET 기록
→ round player betAmount 저장
```

이유:

- 라운드 중 연결이 끊겨도 베팅을 확정하기 위해
- 정산 시 payout만 계산하면 되도록 하기 위해
- 동시성 문제를 줄이기 위해

---

## 5. 정산

### 5.1 패배

```text
payout = 0
netProfit = -betAmount
```

베팅 시 이미 차감했으므로 추가 원장 기록은 선택사항이다.  
MVP에서는 별도 LOSE 원장은 남기지 않는다.

### 5.2 Push

```text
payout = finalBetAmount
netProfit = 0
ledger type = PUSH
```

### 5.3 일반 승리

```text
payout = finalBetAmount * 2
netProfit = finalBetAmount
ledger type = WIN
```

### 5.4 Blackjack

```text
payout = finalBetAmount * 2.5
netProfit = finalBetAmount * 1.5
ledger type = BLACKJACK_WIN
```

정수 포인트만 사용하므로 3:2 배당 계산 시 소수점 처리를 명확히 해야 한다.

권장:

```text
payout = finalBetAmount + floor(finalBetAmount * 3 / 2)
```

---

## 6. Double

Double은 추가 베팅을 차감한다.

```text
currentBet = 1,000P
Double 요청
→ 추가 1,000P 차감
→ PointLedger DOUBLE_BET 기록
→ finalBetAmount = 2,000P
```

---

## 7. 서버 재시작/라운드 취소 환불

서버 재시작으로 `IN_PROGRESS` 라운드를 취소하면, 해당 라운드의 확정 베팅을 환불한다.

```text
refundAmount = finalBetAmount
ledger type = REFUND
round status = CANCELLED
idempotencyKey = refund:{roundId}:{userId}
```

주의:

이미 SETTLED된 라운드는 환불하지 않는다.
같은 라운드와 유저에 대해 REFUND가 두 번 지급되면 안 된다.

---

## 8. 동시성 제어

포인트를 변경하는 모든 작업은 다음을 지킨다.

```text
DB transaction
wallet row lock
balance 확인
wallet update
point_ledger insert
idempotency_key 기록
commit
```

동일 유저가 동시에 여러 요청을 보내도 잔액이 음수가 되면 안 된다.

---

## 9. 원장 reference

원장 기록은 관련 리소스를 참조한다.

| type | referenceType | referenceId |
|---|---|---|
| BET | BLACKJACK_ROUND | roundId |
| DOUBLE_BET | BLACKJACK_ROUND | roundId |
| WIN | BLACKJACK_ROUND | roundId |
| BLACKJACK_WIN | BLACKJACK_ROUND | roundId |
| PUSH | BLACKJACK_ROUND | roundId |
| REFUND | BLACKJACK_ROUND | roundId |
| DAILY_REWARD | DAILY_REWARD_CLAIM | claimId |
| ADMIN_ADJUST | ADMIN_AUDIT_LOG | auditLogId |

---

## 10. MVP에서 포인트 사용처

초기 MVP의 포인트 사용처는 첫 게임인 블랙잭 베팅뿐이다.

상점/컬렉터블은 제외한다.
