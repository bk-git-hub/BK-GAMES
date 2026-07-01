# Database Schema

상점/컬렉터블을 제외한 MVP 데이터 모델이다.

---

## 1. 포함 테이블

| 테이블 | 목적 |
|---|---|
| auth tables | Better Auth가 생성 |
| user_profiles | 서비스 유저 프로필/권한 |
| wallets | 현재 포인트 잔액 |
| point_ledgers | 모든 포인트 증감 원장 |
| daily_reward_claims | 일일 보상 수령 기록 |
| blackjack_tables | 블랙잭 테이블 설정 |
| blackjack_rounds | 라운드 기록 |
| blackjack_round_players | 라운드별 참여 유저/좌석/결과 |
| admin_audit_logs | 관리자 작업 감사 로그 |

상점 관련 테이블은 MVP에서 제외한다.

제외 테이블:

```text
items
inventories
equipped_profiles
shop_purchases
```

---

## 2. user_profiles

Better Auth의 user table을 확장하는 서비스 프로필 테이블이다.

```sql
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  nickname VARCHAR(30) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
```

---

## 3. wallets

```sql
CREATE TABLE wallets (
  user_id TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0)
);
```

---

## 4. point_ledgers

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

`delta` 부호 규칙:

```text
포인트 증가: 양수
포인트 감소: 음수
```

`balance_before`와 `balance_after`는 감사/복구를 위해 반드시 기록한다.  
`idempotency_key`는 중복 베팅, 중복 정산, 중복 환불을 막기 위해 필수다.

### type

```text
SIGNUP_BONUS
DAILY_REWARD
BET
DOUBLE_BET
WIN
BLACKJACK_WIN
PUSH
REFUND
ADMIN_ADJUST
SYSTEM_REVERT
```

---

## 5. daily_reward_claims

```sql
CREATE TABLE daily_reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  claimed_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  streak INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT daily_reward_unique_per_day UNIQUE (user_id, claimed_date)
);
```

---

## 6. blackjack_tables

초기에는 `main` 테이블 하나만 seed한다.

```sql
CREATE TABLE blackjack_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  seat_count INT NOT NULL DEFAULT 5,
  min_bet BIGINT NOT NULL DEFAULT 100,
  max_bet BIGINT,
  betting_time_limit_sec INT NOT NULL DEFAULT 15,
  turn_time_limit_sec INT NOT NULL DEFAULT 20,
  round_end_delay_sec INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

초기 seed:

```sql
INSERT INTO blackjack_tables (
  code,
  name,
  status,
  seat_count,
  min_bet,
  betting_time_limit_sec,
  turn_time_limit_sec,
  round_end_delay_sec
) VALUES (
  'main',
  'Main Table',
  'OPEN',
  5,
  100,
  15,
  20,
  5
);
```

---

## 7. blackjack_rounds

라운드 단위 기록이다.

```sql
CREATE TABLE blackjack_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES blackjack_tables(id),
  status VARCHAR(30) NOT NULL,
  phase VARCHAR(30) NOT NULL,
  dealer_cards JSONB NOT NULL DEFAULT '[]',
  shoe_snapshot JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  betting_started_at TIMESTAMPTZ,
  betting_ended_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### status

```text
IN_PROGRESS
SETTLED
CANCELLED
```

### phase

```text
WAITING
BETTING
DEALING
PLAYER_TURNS
DEALER_TURN
SETTLEMENT
ROUND_END
```

---

## 8. blackjack_round_players

라운드에 실제 베팅 참여한 유저를 저장한다.

```sql
CREATE TABLE blackjack_round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES blackjack_rounds(id),
  user_id TEXT NOT NULL,
  seat_no INT NOT NULL,
  bet_amount BIGINT NOT NULL,
  final_bet_amount BIGINT NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]',
  final_score INT,
  status VARCHAR(30) NOT NULL,
  result VARCHAR(40),
  payout BIGINT NOT NULL DEFAULT 0,
  net_profit BIGINT NOT NULL DEFAULT 0,
  acted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT blackjack_round_players_unique_seat UNIQUE (round_id, seat_no),
  CONSTRAINT blackjack_round_players_unique_user UNIQUE (round_id, user_id)
);
```

### status

```text
BET_PLACED
PLAYING
STOOD
BUST
SETTLED
DISCONNECTED
```

### result

```text
PLAYER_BLACKJACK
PLAYER_WIN
DEALER_WIN
PUSH
PLAYER_BUST
DEALER_BUST
CANCELLED
```

---

## 9. admin_audit_logs

```sql
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 10. 인덱스 후보

```sql
CREATE INDEX point_ledgers_user_created_idx
ON point_ledgers(user_id, created_at DESC);

CREATE INDEX point_ledgers_reference_idx
ON point_ledgers(reference_type, reference_id);

CREATE INDEX point_ledgers_type_created_idx
ON point_ledgers(type, created_at DESC);

CREATE INDEX blackjack_rounds_table_created_idx
ON blackjack_rounds(table_id, created_at DESC);

CREATE INDEX blackjack_round_players_user_created_idx
ON blackjack_round_players(user_id, created_at DESC);

CREATE INDEX daily_reward_claims_user_date_idx
ON daily_reward_claims(user_id, claimed_date DESC);
```

---

## 11. 트랜잭션 필수 작업

다음 작업은 반드시 트랜잭션으로 처리한다.

- 회원가입 보너스 지급
- 일일 보상 지급
- 라운드 베팅
- Double 추가 베팅
- 라운드 정산
- 서버 재시작 시 라운드 취소/환불
- 관리자 포인트 조정

모든 포인트 변경 transaction은 `wallet row lock`, `balance_before`, `balance_after`, `point_ledger`, `idempotency_key`를 함께 처리한다.

---

## 12. 메모리 상태와 DB 상태

### game-server 메모리 상태

- 현재 테이블 좌석
- 현재 라운드 phase
- 현재 shoe
- 현재 턴
- 타이머
- 연결된 socket

### DB 영구 상태

- 포인트 잔액
- 포인트 원장
- 라운드 기록
- 라운드 참여자 기록
- 정산 결과
- 관리자 감사 로그

원칙:

```text
실시간 진행은 메모리
포인트와 감사 기록은 DB
```
