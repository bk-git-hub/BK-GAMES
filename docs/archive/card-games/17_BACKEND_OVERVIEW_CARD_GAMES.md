> **Dormant (휴면)**: 블랙잭/바카라는 2026-10-01부터 기본값으로 꺼져 있다 (`CARD_GAMES_ENABLED`). 이 문서는 되살릴 때를 위한 보관본이며, 현재 상태와 재활성화 절차는 [00_INDEX.md](./00_INDEX.md)를 본다.

# Backend Technical Overview — Card Games (Archived)

`docs/17_BACKEND_TECHNICAL_OVERVIEW.md`가 경마 전용으로 정리되면서 떼어낸 블랙잭/바카라 부분이다.

아래 내용은 2026-10-01 시점(태그 `archive/card-games-2026-10-01`, commit `7cba3da`)의 원문을 그대로 옮긴 것이다. 두 게임의 "구현된 상태"를 설명하는 유일한 문서이므로 내용을 고치지 않는다. 원문의 "구현됨"은 코드가 존재한다는 뜻이며, 스위치가 꺼진 기본 배포에서는 동작하지 않는다.

원문에 적힌 `docs/03_...`, `docs/12_...`, `docs/13_...`, `docs/14_...` 경로는 이제 이 폴더(`docs/archive/card-games/`) 안에 있다.

---

## 원문: 6. Socket Contract와 Private Event — namespace 표의 카드 게임 행

| 게임 | namespace | 주요 server event |
|---|---|---|
| Blackjack | `/blackjack` | `table:state`, `table:event`, `wallet:updated`, `error` |
| Baccarat | `/baccarat` | `table:state`, `table:event`, `bet:accepted`, `card:revealed`, `round:settled`, `wallet:updated`, `error` |

Public table room에 보낼 수 있는 것 중 카드 게임 항목:

- visible cards
- seats/viewer count

Private user room/socket에만 보낼 것 중 카드 게임 항목:

- user-specific bet result
- viewer-specific `myBet`

---

## 원문: 7.1 Blackjack

상태:

```text
실시간 테이블 backend 구현됨
```

주요 구현:

- `/blackjack` Socket.IO namespace
- table join/leave
- seat take/leave
- 한 사용자가 여러 좌석 점유 가능
- live bet이 없는 disconnected seat 자동 release
- live bet이 있는 seat는 round reset 전까지 유지
- betting timer 기반 round start
- card-by-card dealing event
- hit / stand / double / split / surrender
- insurance / even money
- ten-value split 허용
- resplit limit
- dealer peek rule
- natural blackjack direct settlement
- wallet-backed bet/double/split/insurance transaction
- server-side settlement and private wallet update

기술적으로 설명할 수 있는 포인트:

- Blackjack table state machine
- seat/hand 단위 action validation
- multi-seat same-user scenario
- wallet reservation 실패 시 table reservation rollback
- DB settlement 결과를 public table state에 confirm하는 흐름

관련 문서:

- `docs/03_REALTIME_BLACKJACK_TABLE_SPEC.md`
- `docs/04_SOCKET_EVENTS.md`
- `docs/06_POINT_WALLET.md`

---

## 원문: 7.3 Baccarat

상태:

```text
실시간 Baccarat backend/socket runtime 구현됨
```

주요 구현:

- `/baccarat` Socket.IO namespace
- Punto Banco 기본 룰 engine
- Player / Banker / Tie payout calculation
- Bead Plate and basic Big Road helper
- Baccarat DB schema: tables, shoes, rounds, reveals, bets, actions
- main table seed
- wallet-backed bet transaction
- settlement/push/cancel refund transaction
- shared socket contract
- hidden-card-safe table state
- server-only shoe/card order
- automatic per-card reveal cadence
- private `myBet` and wallet update handling
- reconnect-safe public/private snapshot separation

Hidden-card safety:

- unrevealed card는 rank/suit/value를 가질 수 없는 hidden variant로 표현한다.
- hand total은 공개 가능한 시점 전에는 null/hidden 상태로 유지한다.
- shoe order, server seed, encrypted shoe state는 shared/client payload에 포함하지 않는다.

면접 설명:

```text
Baccarat는 서버가 shoe와 reveal 순서를 소유하고, shared type에서 hidden card와 visible card를 discriminated union으로 분리했습니다. 그래서 클라이언트가 아직 공개되지 않은 rank, suit, value를 타입상 받을 수 없도록 만들었습니다.
```

관련 문서:

- `docs/12_BACCARAT_SCOPE.md`
- `docs/13_BACCARAT_REALTIME_TABLE_SPEC.md`
- `docs/14_BACCARAT_IMPLEMENTATION_PLAN.md`

---

## 원문: 8. API Surface — 카드 게임 행

| API | 목적 |
|---|---|
| `GET /blackjack/tables` | lobby용 Blackjack table summary |

---

## 원문: 9. 검증 체계 — 카드 게임 DB smoke

```text
corepack pnpm --filter @bk-games/db smoke:blackjack-betting
corepack pnpm --filter @bk-games/db smoke:blackjack-settlement
corepack pnpm --filter @bk-games/db smoke:baccarat-betting
corepack pnpm --filter @bk-games/db smoke:baccarat-settlement
```

---

## 원문: 11. 이력서 문구로 사용 가능한 기술 성과 — 카드 게임 근거

"서버 권위형 상태 동기화"의 근거 중:

- Blackjack table state machine
- Baccarat hidden-card-safe reveal lifecycle

"기능 확장 가능한 데이터 모델 구축"의 근거 중:

- Blackjack/Racing/Baccarat game-specific tables

### 숨김 상태 보안 모델

```text
Baccarat 카드 공개 전 상태를 hidden/visible discriminated union으로 분리하고, 서버가 공개한 카드만 client-visible payload에 포함되도록 설계해 hidden state leakage를 방지
```

근거:

- `BaccaratHiddenCardView`
- `BaccaratVisibleCardView`
- server-only shoe/card order
- reconnect-safe snapshot tests

---

## 원문: 13. 문서 기준 — 카드 게임 문서

- `docs/03_REALTIME_BLACKJACK_TABLE_SPEC.md`
- `docs/12_BACCARAT_SCOPE.md`
- `docs/13_BACCARAT_REALTIME_TABLE_SPEC.md`
- `docs/14_BACCARAT_IMPLEMENTATION_PLAN.md`
