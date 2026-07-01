# API Spec

실시간 게임 서버 외에 web 앱에서 제공할 HTTP API 초안이다.

---

## 1. Auth

Better Auth route를 사용한다.

```text
/api/auth/[...all]
```

---

## 2. Game Token

## 2.1 게임 서버 접속 토큰 발급

```http
POST /api/game-token
```

### 설명

로그인된 유저가 game-server에 Socket 연결할 때 사용할 짧은 수명의 token을 발급한다.

### Response

```json
{
  "success": true,
  "data": {
    "token": "short-lived-game-token",
    "expiresAt": "2026-06-05T12:00:00.000Z",
    "gameServerUrl": "http://localhost:4000/blackjack"
  }
}
```

### 정책

- 로그인 필요
- 짧은 만료 시간
- userId 포함
- role 포함 가능
- game-server에서 검증 가능해야 함

---

## 3. Rewards

## 3.1 오늘 보상 상태 조회

```http
GET /api/rewards/today
```

## 3.2 일일 보상 수령

```http
POST /api/rewards/claim
```

---

## 4. Wallet

## 4.1 지갑 조회

```http
GET /api/wallet
```

## 4.2 포인트 원장 조회

```http
GET /api/wallet/ledger?cursor=&limit=20
```

---

## 5. Blackjack Table Read API

실시간 상태는 Socket이 담당하지만, 초기 페이지 진입/SEO/관리 용도로 조회 API를 둘 수 있다.

## 5.1 메인 테이블 정보 조회

```http
GET /api/blackjack/tables/main
```

### Response

```json
{
  "success": true,
  "data": {
    "table": {
      "code": "main",
      "name": "Main Table",
      "status": "OPEN",
      "seatCount": 5,
      "minBet": 100,
      "bettingTimeLimitSec": 15,
      "turnTimeLimitSec": 20
    }
  }
}
```

---

## 6. Admin API

관리자 API는 web 앱의 Route Handler로 제공한다.

```http
GET /api/admin/users
GET /api/admin/users/:userId
GET /api/admin/point-ledgers
GET /api/admin/blackjack/rounds
GET /api/admin/blackjack/rounds/:roundId
POST /api/admin/blackjack/tables/main/pause
POST /api/admin/blackjack/tables/main/resume
POST /api/admin/users/:userId/points/adjust
```

---

## 7. API와 Socket의 역할 분리

| 영역 | HTTP API | Socket |
|---|---|---|
| 로그인 | O | X |
| 게임 token 발급 | O | X |
| 지갑 조회 | O | 필요 시 개인 이벤트 |
| 일일 보상 | O | X |
| 테이블 입장 | X | O |
| 좌석 착석 | X | O |
| 베팅 | X | O |
| Hit/Stand/Double | X | O |
| 라운드 상태 broadcast | X | O |
| 개인 지갑 변경 알림 | X | O, private |
| 관리자 로그 조회 | O | X |

---

## 8. 원칙

```text
실시간 게임 액션은 Socket으로만 처리한다.
포인트 정산은 game-server가 DB transaction으로 처리한다.
web API는 게임 서버 상태를 직접 조작하지 않는다.
관리자 pause/resume은 web Admin API가 DB에 감사 로그를 남긴 뒤 game-server internal control API 또는 control event를 호출한다.
walletBalance와 point ledger는 전체 broadcast에 포함하지 않고 개인 이벤트로만 전송한다.
```
