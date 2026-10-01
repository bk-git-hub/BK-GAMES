# BK Games Docs Index

BK Games 문서 인덱스다.

일부 초기 문서는 프로젝트 시작 시점의 MVP 설계 기록을 포함한다. 현재 구현/노출 상태를 빠르게 확인할 때는 루트 `README.md`와 `docs/17_BACKEND_TECHNICAL_OVERVIEW.md`를 우선한다.

```text
현재 visible game lineup = BK Derby
```

블랙잭과 바카라는 2026-10-01부터 기본값으로 꺼져 있다. 코드, 단위 테스트, DB 테이블, migration은 저장소에 그대로 있고 `CARD_GAMES_ENABLED` 값이 정확히 `true`일 때만 다시 켜진다. 관련 문서는 아래 "보관 문서"에 모았다.

Boxing은 현재 visible game list, web route, game-server module, DB transaction helper에 연결되어 있지 않다. `16_BOXING_BACKEND_SPEC.md`는 재활성화 전까지 archived/future backend-facing spec으로 취급한다.

---

## 문서 목록

| 파일 | 목적 |
|---|---|
| `02_ARCHITECTURE.md` | 모노레포/서버 구조 (초기 설계, 예시는 블랙잭 기준) |
| `04_SOCKET_EVENTS.md` | Socket.IO 이벤트 계약 초안 (블랙잭 기준, 현재 계약은 `packages/shared/src/socket-events.ts`) |
| `05_DATABASE_SCHEMA.md` | DB 모델 초안 (블랙잭 기준, 현재 스키마는 `packages/db/src/schema.ts`) |
| `06_POINT_WALLET.md` | 포인트 지갑/원장/정산 정책 |
| `07_API_SPEC.md` | Web API/BFF API 초안 |
| `08_ADMIN_SPEC.md` | 관리자 기능 초안 |
| `09_INITIAL_SETUP.md` | 프로젝트 생성 순서 (historical) |
| `10_FIRST_TASKS.md` | 첫 작업/커밋 단위 (historical) |
| `11_AI_AGENT_IMPLEMENTATION_DECISIONS.md` | AI 에이전트용 확정 구현 기준 |
| `15_HORSE_RACING_BACKEND_SPEC.md` | 실시간 경마(BK Derby) 백엔드 구현 사양 |
| `16_BOXING_BACKEND_SPEC.md` | archived/future 복싱 백엔드 사양, 현재 활성 게임 아님 |
| `17_BACKEND_TECHNICAL_OVERVIEW.md` | 현재 백엔드 구조/기술 선택/포트폴리오 설명 기준 (경마 전용) |
| `18_BACKEND_DEPLOYMENT_CHECKLIST.md` | 백엔드 배포 전 환경변수/DB 초기화/검증 체크리스트 |
| `19_NEXT16_PPR_ADOPTION_PLAN.md` | Next.js 16 PPR 도입 계획과 성능 목표 |
| `20_PPR_PERFORMANCE_BASELINE.md` | PPR 적용 전·중간 성능 기준선 측정 |
| `21_PPR_FINAL_PERFORMANCE_REPORT.md` | PPR 최종 성능 보고서 |

`02`, `04`~`11`은 첫 테이블 게임이었던 블랙잭을 예시로 쓴 초기 문서다. 서버 권위, 지갑/원장 멱등성, 환불 규칙은 경마에도 그대로 적용된다. `15_HORSE_RACING_BACKEND_SPEC.md`는 구현 전에 쓴 경마 설계 스펙이고, 실제 구현과 다른 부분은 코드와 `17_BACKEND_TECHNICAL_OVERVIEW.md`가 우선한다.

`private/` 폴더의 문서는 개인 참고용이다.
구현 에이전트는 `docs/` 문서와 `11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`를 기준으로 작업한다.

---

## 보관 문서 (Archive): 휴면 중인 카드 게임

`archive/card-games/` 폴더에 블랙잭/바카라 문서를 모았다. 현재 운영 기준이 아니며, 두 게임을 되살릴 때만 읽는다. 시작점은 `archive/card-games/00_INDEX.md`다.

| 파일 | 목적 |
|---|---|
| `archive/card-games/00_INDEX.md` | 스위치 의미, 꺼진 상태의 동작, 재활성화 절차, 되살리기 전 알아둘 부채 |
| `archive/card-games/01_FINAL_SCOPE.md` | 초기 Blackjack-first MVP 범위와 제외 범위 |
| `archive/card-games/03_REALTIME_BLACKJACK_TABLE_SPEC.md` | 테이블제 실시간 블랙잭 스펙 |
| `archive/card-games/12_BACCARAT_SCOPE.md` | 바카라 MVP 범위와 제외 범위 |
| `archive/card-games/13_BACCARAT_REALTIME_TABLE_SPEC.md` | 실시간 바카라 테이블 스펙 |
| `archive/card-games/14_BACCARAT_IMPLEMENTATION_PLAN.md` | 바카라 구현 순서와 작업 단위 |
| `archive/card-games/17_BACKEND_OVERVIEW_CARD_GAMES.md` | `17`에서 떼어낸 블랙잭/바카라 백엔드 구현 설명 |
| `archive/card-games/ENGINEERING_LOG_CARD_GAMES.md` | 루트 `ENGINEERING_LOG.md`에서 떼어낸 블랙잭/바카라 기록 |

---

## 현재 방향

```text
Next.js 단일 풀스택 앱으로 시작하지 않는다.
Next.js web + 별도 NestJS realtime game-server 구조로 시작한다.
```

이유:

- 실시간 게임은 서버가 타이머와 진행 상태를 계속 쥐고 있어야 하기 때문 (처음 이 결정을 내릴 때의 기준은 첫 게임이었던 실시간 멀티플레이 블랙잭이었고, 경마의 스케줄/틱 방송에도 같은 이유가 적용된다)
- 테이블/라운드/타이머/재접속/동시성 관리가 필요하기 때문
- Next/Vercel 단독 구조는 WebSocket 게임 서버 역할에 적합하지 않고, NestJS Gateway 구조가 실시간 테이블 도메인 분리에 적합하기 때문

---

## 핵심 원칙

```text
No Cash
No Exchange
No Transfer
No Marketplace
Server Authoritative Game
Point Ledger Required
```
