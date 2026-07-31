# BK Games Docs Index

BK Games 문서 인덱스다.

일부 초기 문서는 프로젝트 시작 시점의 MVP 설계 기록을 포함한다. 현재 구현/노출 상태를 빠르게 확인할 때는 루트 `README.md`와 `docs/17_BACKEND_TECHNICAL_OVERVIEW.md`를 우선한다.

```text
현재 visible game lineup = BK Derby + Blackjack + Baccarat
```

Boxing은 현재 visible game list, web route, game-server module, DB transaction helper에 연결되어 있지 않다. `16_BOXING_BACKEND_SPEC.md`는 재활성화 전까지 archived/future backend-facing spec으로 취급한다.

---

## 문서 목록

| 파일 | 목적 |
|---|---|
| `01_FINAL_SCOPE.md` | 초기 Blackjack-first MVP 범위와 제외 범위 |
| `02_ARCHITECTURE.md` | 모노레포/서버 구조 |
| `03_REALTIME_BLACKJACK_TABLE_SPEC.md` | 테이블제 실시간 블랙잭 스펙 |
| `04_SOCKET_EVENTS.md` | Socket.IO 이벤트 계약 |
| `05_DATABASE_SCHEMA.md` | DB 모델 초안 |
| `06_POINT_WALLET.md` | 포인트 지갑/원장/정산 정책 |
| `07_API_SPEC.md` | Web API/BFF API 초안 |
| `08_ADMIN_SPEC.md` | 관리자 기능 |
| `09_INITIAL_SETUP.md` | 프로젝트 생성 순서 |
| `10_FIRST_TASKS.md` | 첫 작업/커밋 단위 |
| `11_AI_AGENT_IMPLEMENTATION_DECISIONS.md` | AI 에이전트용 확정 구현 기준 |
| `12_BACCARAT_SCOPE.md` | 바카라 MVP 범위와 제외 범위 |
| `13_BACCARAT_REALTIME_TABLE_SPEC.md` | 실시간 바카라 테이블 스펙 |
| `14_BACCARAT_IMPLEMENTATION_PLAN.md` | 바카라 구현 순서와 작업 단위 |
| `15_HORSE_RACING_BACKEND_SPEC.md` | 실시간 경마 백엔드 구현 사양 |
| `16_BOXING_BACKEND_SPEC.md` | archived/future 복싱 백엔드 사양, 현재 활성 게임 아님 |
| `17_BACKEND_TECHNICAL_OVERVIEW.md` | 현재 백엔드 구조/기술 선택/포트폴리오 설명 기준 |
| `18_BACKEND_DEPLOYMENT_CHECKLIST.md` | 백엔드 배포 전 환경변수/DB 초기화/검증 체크리스트 |

`private/` 폴더의 문서는 개인 참고용이다.
구현 에이전트는 `docs/` 문서와 `11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`를 기준으로 작업한다.

---

## 현재 방향

```text
Next.js 단일 풀스택 앱으로 시작하지 않는다.
Next.js web + 별도 NestJS realtime game-server 구조로 시작한다.
```

이유:

- 첫 게임인 블랙잭이 실시간 멀티플레이이기 때문
- 테이블/좌석/라운드/타이머/재접속/동시성 관리가 필요하기 때문
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
