# Baccarat Scope

BK Games의 두 번째 게임 후보인 실시간 바카라의 개발 범위를 정의한다.

이 문서는 실제 구현을 시작하기 전에 바카라의 제품 범위, 룰, 제외 범위, 성공 기준을 고정하기 위한 문서다.

---

## 1. 결론

바카라는 블랙잭 다음 확장 게임으로 적합하다.

이유:

```text
플레이어 액션이 적다.
라운드 상태 머신이 짧다.
정산 공식이 명확하다.
여러 유저가 같은 테이블에서 동시에 베팅하기 쉽다.
interactive squeeze로 블랙잭과 다른 UX 차별점을 만들 수 있다.
```

초기 버전은 다음을 목표로 한다.

```text
무료 포인트 기반 단일 실시간 Punto Banco 바카라 테이블
```

---

## 2. 포함 범위

초기 바카라 MVP에 포함한다.

```text
단일 바카라 테이블
테이블 입장/퇴장
관전
라운드별 베팅 창
Player / Banker / Tie 메인 베팅
서버 권위 카드 딜링
표준 Punto Banco 3장 룰
interactive squeeze reveal
자동 정산
포인트 원장 기록
private wallet:updated
최근 라운드 히스토리
Bead Plate 결과판
basic Big Road 결과판
8-deck shoe / cut-card 운영
재접속 시 squeeze/reveal 상태 복구
```

---

## 3. 제외 범위

초기 바카라 MVP에서 제외한다.

```text
Pair bet
Dragon Bonus
Super 6 / Lucky 6
Dragon 7 / Panda 8
Big / Small
Exact Tie / Egalite
Big Eye Boy / Small Road / Cockroach Pig
roadmap prediction UI
live betting
베팅 취소/수정
다중 테이블
유료 결제
포인트 송금
현금화
관리자 기능 신규 구현
```

side bet은 제외하지만 DB/API 설계는 나중에 여러 bet type을 추가할 수 있도록 막지 않는다.

---

## 4. Phase 2 후보

바카라 코어가 안정화된 뒤 다음 side bet을 검토한다.

| 후보 | 설명 | 우선순위 |
|---|---|---|
| Player Pair | Player 첫 2장이 같은 rank | 높음 |
| Banker Pair | Banker 첫 2장이 같은 rank | 높음 |
| Either Pair | Player 또는 Banker 중 하나라도 pair | 높음 |
| Perfect Pair | 같은 rank와 suit의 pair | 중간 |
| Player Bonus | Player가 natural 또는 큰 점수 차로 승리 | 중간 |
| Banker Bonus | Banker가 natural 또는 큰 점수 차로 승리 | 중간 |
| Super 6 / Lucky 6 | Banker가 6으로 승리 | 중간 |
| Dragon 7 | Banker가 3-card 7로 승리 | 낮음 |
| Panda 8 | Player가 3-card 8로 승리 | 낮음 |
| Big / Small | 총 카드 수 4장 또는 5-6장 | 낮음 |
| Big Eye Boy / Small Road / Cockroach Pig | Big Road에서 파생되는 고급 결과판 | 낮음 |

side bet이 들어가면 한 유저가 한 라운드에 여러 bet을 가질 수 있어야 한다.

MVP의 결과판은 다음으로 제한한다.

```text
Bead Plate: 라운드 결과를 시간순으로 표시
Basic Big Road: Player/Banker streak 흐름 표시, Tie는 기존 칸에 badge로 표시
```

고급 road는 베팅/정산에 영향을 주지 않는 display-only 기능이지만, 구현 복잡도가 있어 Phase 2로 둔다.

---

## 5. 기본 룰

바카라는 Punto Banco 룰을 따른다.

카드 점수:

```text
A = 1
2-9 = 표시 숫자
10/J/Q/K = 0
총점 = 카드 합계의 1의 자리
```

예시:

```text
7 + 8 = 15 -> 5
K + 9 = 9
4 + 6 + 9 = 19 -> 9
```

Natural:

```text
초기 2장 합계가 8 또는 9면 natural
Player 또는 Banker 중 하나라도 natural이면 추가 카드를 뽑지 않는다.
```

---

## 6. 기본 배당

정수 포인트만 사용한다.

| Bet | 조건 | 지급 |
|---|---|---:|
| Player | Player 승리 | bet + bet |
| Banker | Banker 승리 | bet + floor(bet * 95 / 100) |
| Tie | Tie | bet + bet * 8 |

Player / Banker 베팅에서 Tie가 발생하면 push 처리한다.

```text
Player bet + Tie result -> PUSH_REFUND
Banker bet + Tie result -> PUSH_REFUND
Tie bet + Tie result -> PAYOUT
Tie bet + Player/Banker result -> lose
```

Banker commission은 포인트 소수점 문제를 피하기 위해 다음 공식으로 계산한다.

```text
bankerPayout = bet + floor(bet * 95 / 100)
bankerNetProfit = floor(bet * 95 / 100)
```

예시:

```text
Banker bet 100P
Banker wins
payout = 100 + floor(100 * 95 / 100) = 195P
netProfit = 95P
```

---

## 7. 기본 테이블 정책

초기값은 블랙잭 정책과 비슷하게 둔다.

| 항목 | 기본값 |
|---|---:|
| 활성 테이블 수 | 1 |
| table code | main |
| min bet | 100P |
| max main bet | 6,000P |
| max total bet per user | 6,000P |
| betting time | 15초 |
| squeeze time per card | 8초 |
| round end delay | 5초 |
| deck count | 8 |
| shoe penetration | 75% |
| result board | Bead Plate + basic Big Road |
| Tie payout | 8:1 |
| Banker commission | 5% |

max bet은 클라이언트가 아니라 서버에서 검증한다.

MVP 베팅 정책:

```text
유저당 라운드 1개 main bet만 허용한다.
accepted bet은 취소할 수 없다.
accepted bet은 수정할 수 없다.
같은 commandId 재시도는 같은 bet details일 때만 idempotent 성공한다.
같은 commandId로 다른 details가 오면 IDEMPOTENCY_CONFLICT다.
이미 bet이 있는데 새 commandId로 다시 bet하면 BET_ALREADY_PLACED다.
```

Shoe 정책:

```text
8 deck shoe를 사용한다.
round 중에는 절대 reshuffle하지 않는다.
round 시작 전에 남은 카드가 부족하거나 cut-card position을 넘겼으면 새 shoe를 생성한다.
shuffle state와 남은 card order는 클라이언트에 공개하지 않는다.
```

---

## 8. Interactive Squeeze

바카라 MVP는 squeeze animation을 포함한다.

목표:

```text
유저가 카드를 직접 천천히 밀어 보거나 눌러서 공개하는 느낌을 만든다.
```

보안 원칙:

```text
hidden card value는 reveal 전 클라이언트에 보내지 않는다.
클라이언트는 카드 값을 추측하거나 결정하지 않는다.
서버가 reveal 가능한 시점에만 실제 카드를 전송한다.
```

MVP squeeze 방식:

```text
서버가 reveal slot을 지정한다.
선정된 squeezer가 squeeze motion을 조작한다.
squeezer가 완료하거나 timeout이 지나면 서버가 실제 card value를 broadcast한다.
다른 유저는 진행 애니메이션과 공개 결과를 본다.
```

squeezer 선정 기본 규칙:

```text
현재 라운드에서 가장 큰 메인 베팅을 한 유저
동률이면 먼저 베팅한 유저
없거나 연결이 끊기면 system auto reveal
```

Squeeze UX 원칙:

```text
progress는 0-100 숫자만 공유한다.
progress는 카드 값이나 suit를 암시하지 않는다.
관전자에게는 같은 progress animation만 보인다.
squeezer가 progress를 보내지 않아도 timeout으로 공개된다.
reconnect한 유저는 이미 공개된 카드와 현재 reveal slot만 받는다.
아직 공개되지 않은 card value는 reconnect에서도 숨긴다.
```

---

## 9. 성공 기준

바카라 MVP 성공 기준:

```text
여러 유저가 같은 baccarat table state를 실시간으로 본다.
베팅 창에서 Player/Banker/Tie 중 하나에 베팅할 수 있다.
같은 commandId 재시도는 포인트를 중복 차감하지 않는다.
서버가 카드를 결정하고 표준 3장 룰을 적용한다.
reveal 전 hidden card value가 클라이언트에 노출되지 않는다.
squeeze 완료 또는 timeout으로 카드가 공개된다.
Bead Plate와 basic Big Road가 settled round 기준으로 갱신된다.
shoe cut-card 이후 다음 라운드 전에 새 shoe가 시작된다.
재접속 시 현재 betting/squeeze/settled 상태를 full snapshot으로 복구한다.
정산 결과가 정확하게 wallet과 point ledger에 반영된다.
wallet:updated는 private room에만 전송된다.
서버 재시작/라운드 취소 시 미정산 베팅이 중복 없이 환불된다.
```

---

## 10. 핵심 원칙

```text
No Cash
No Exchange
No Transfer
Server Authoritative Cards
Server Authoritative Settlement
Point Ledger Required
Hidden Cards Stay Hidden Until Reveal
Squeeze Changes Reveal UX Only, Not Game Result
```
