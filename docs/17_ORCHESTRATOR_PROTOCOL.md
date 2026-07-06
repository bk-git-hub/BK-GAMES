# Orchestrator Protocol

이 문서는 BK Games 개발을 여러 Codex thread로 진행할 때, 오케스트레이터 thread가 어떤 조건에서 개발 thread에 작업을 전달하고 언제 사용자에게 멈춰서 물어봐야 하는지 정의한다.

이 프로토콜은 경마 개발 완료 이후부터 단계적으로 도입한다. 경마 마무리 중에는 기존 작업 흐름을 흔들지 않는다.

---

## 1. 목적

BK Games는 단순 웹앱이 아니라 실시간 멀티플레이 포인트 게임 플랫폼이다.

따라서 개발 운영의 목표는 "작업을 많이 자동화하는 것"이 아니라 다음을 보장하는 것이다.

```text
사용자는 게임 기획과 직접 플레이 피드백에 집중한다.
오케스트레이터는 확정 명세를 개발 단계로 나누고 각 thread에 전달한다.
개발 thread는 Ready 된 작업만 수행한다.
포인트, 정산, socket source of truth, server-authoritative state는 Gate 없이 변경하지 않는다.
```

---

## 2. Human-In-The-Loop 지점

사용자 개입이 반드시 필요한 영역:

```text
게임 기획
게임 규칙 확정
재미/템포/UX 감각 판단
직접 플레이 후 피드백
포인트/보상/정산 정책 변경 승인
server-authoritative 구조 변경 승인
```

오케스트레이터가 사용자 개입 없이 진행할 수 있는 영역:

```text
확정 명세 읽기
작업 단계 분해
Backend / Frontend / Review thread용 Work Order 작성
명확한 다음 단계 전달
개발 thread 결과 읽기
검증 결과 요약
명세 범위 안의 후속 단계 진행
```

---

## 3. Thread Roles

### Game Design Thread

사용자와 함께 게임을 기획하고 최종 명세서를 만든다.

책임:

- 게임 컨셉, 규칙, 화면 흐름, 사용자 경험 정리
- 사용자 판단이 필요한 질문 제기
- 최종 명세서 발행

금지:

- 개발 thread에 직접 구현 지시
- Gate Review 없이 구현 Ready 판정

### Orchestrator Thread

확정 명세를 개발 가능한 단계로 바꾸고 thread 간 진행을 조율한다.

책임:

- 명세와 관련 source 문서 읽기
- 작업 단계를 작게 나누기
- 각 단계의 owner thread 결정
- Gate Review 수행
- Work Order 작성
- `send_message_to_thread`로 개발 thread에 전달
- `read_thread`로 결과 확인
- dev server가 필요하면 사용자에게 수동 실행/재시작 요청
- 다음 단계 진행 또는 사용자 호출 결정

금지:

- 사용자 승인 없이 게임 규칙 변경
- 사용자 승인 없이 포인트/정산 정책 변경
- Gate 없이 socket contract 또는 source of truth 변경
- 개발 thread가 보고한 blocker를 임의로 우회

### Backend Thread

기본 담당:

```text
packages/db
apps/game-server
database schema / migrations
wallet / ledger / reward / settlement
socket contracts
backend auth integration
```

### Frontend Thread

기본 담당:

```text
apps/web UI routes
components
styling
responsive layout
frontend-only state
mock screens and visual QA
```

### Review / QA Thread

책임:

- diff review
- contract mismatch 확인
- regression risk 확인
- browser/play smoke 준비
- 사용자 playtest 전 상태 요약

### Runtime Helper Thread

사용자 전용 dev server 운영 thread다. Orchestrator, Worker, Updater는 이 thread에 메시지를 보내지 않는다.

기본 담당:

```text
사용자가 직접 입력한 dev server start / stop / restart / status 수행
사용자가 요청한 port / PID / health check 확인
사용자가 요청한 runtime log 확인
```

사용자가 수동으로 실행할 기본 명령:

```text
web: corepack pnpm --filter web dev
game-server: corepack pnpm --filter game-server dev
```

금지:

- Orchestrator / Worker / Updater가 이 thread에 runtime 지시 메시지 전송
- 다른 thread의 callback 대상으로 사용
- runtime 작업 중 코드 수정
- DB migration 또는 seed 실행

---

## 4. Development State Loop

작업은 아래 상태를 따른다.

```text
Idea
-> Intake
-> Gate Review
-> Ready
-> In Progress
-> Review
-> Done
-> Archived
```

### Idea

아직 구현하지 않는다.

허용:

- 질문
- 문제 정의
- 기획 방향 탐색

금지:

- 파일 생성
- 코드 수정
- 자동화 구현

### Intake

작업 후보를 개발 가능한 형태로 정리한다.

필수 정리:

```text
목표
배경
사용자 기대
성공 기준
제외 범위
관련 source 문서
사용자 판단 필요 여부
```

### Gate Review

구현을 시작해도 되는지 확인한다.

Risk type이 아래에 해당하면 Gate Review가 필수다.

```text
realtime/socket
wallet/ledger
reward/settlement
auth/game token
database schema
server-authoritative gameplay
preview/mock route promotion
```

### Ready

개발 thread가 처리할 수 있는 상태다.

Ready 조건:

```text
목표가 한 문장으로 명확하다.
수정 가능 파일/폴더가 정해져 있다.
제외 범위가 정해져 있다.
검증 명령이 정해져 있다.
Stop Conditions가 정해져 있다.
필요한 Gate가 통과되었다.
```

### In Progress

개발 thread가 실제 작업 중인 상태다.

규칙:

- thread 하나는 주요 작업 단위 하나만 처리한다.
- 범위가 커지면 멈추고 보고한다.
- AGENTS.md의 stage/commit 규칙을 따른다.

### Review

구현 완료 후 검증/리뷰 단계다.

확인:

- staged diff가 범위와 일치하는가
- 검증 명령이 통과했는가
- socket/포인트/정산/인증 side effect가 보고되었는가
- 사용자 playtest가 필요한가

### Done

작업 완료 상태다.

Done 조건:

```text
검증 결과 보고 완료
커밋 완료
commit hash 보고
다음 자연스러운 단계가 명시됨
```

---

## 5. Work Order Format

오케스트레이터가 개발 thread에 보내는 메시지는 항상 아래 형식을 따른다.

```text
[Role]
너는 Backend thread다.

[Work Order]
이번 단계의 목표는 ...

[Source]
읽어야 할 문서:
- docs/...

[Scope]
수정 가능:
- path/...

수정 금지:
- path/...

[Gate]
Risk type:
Producer:
Consumer:
Cadence:
Source of truth:
Frontend allowed logic:
Frontend forbidden logic:
Verification:

[Stop Conditions]
아래가 필요하면 구현하지 말고 보고:
- ...

[Done Criteria]
- 작업 시작 전 범위 보고
- 검증 통과
- 작업 범위 파일만 명시적 pathspec으로 stage
- staged diff 확인
- commit
- 결과 보고
```

개발 thread는 완료 후 아래 형식으로 보고한다.

```text
Status: Done / Blocked / Needs Review
Changed files:
Validation:
Commit:
Next recommended step:
Blocker:
```

---

## 6. Realtime / Socket Gate

Realtime 또는 socket 기반 작업은 event 이름 존재만으로 Ready 처리하지 않는다.

필수 matrix:

```text
Event:
Producer:
Consumer:
Cadence:
Source of truth:
Frontend allowed logic:
Frontend forbidden logic:
Verification:
```

예시:

```text
Event: RACE_TICK
Producer: apps/game-server RacingGateway
Consumer: apps/web BK Derby page
Cadence: 100ms or 200ms during RUNNING
Source of truth: server
Frontend allowed logic: interpolation between server ticks
Frontend forbidden logic: final order/rank/finish time calculation
Verification: two-client socket smoke + cadence measurement + settlement match
```

완료 기준은 이벤트 이름이 아니라 behavior다.

좋은 완료 기준:

```text
RUNNING 동안 서버가 실제로 N ms마다 tick을 emit한다.
10초 동안 기대 tick 수의 80% 이상을 수신한다.
두 클라이언트가 같은 tickSeq에서 같은 positions를 받는다.
final tick order와 settlement result가 일치한다.
reconnect 시 latest authoritative tick으로 복구된다.
```

---

## 7. Dev Server Manual Operations

개발 서버는 thread 공용 로컬 자원이므로 사용자가 수동으로 start/stop/restart한다.

### Ownership

```text
User: dev server start / stop / restart 직접 수행, 필요하면 Runtime Helper thread에 직접 입력
Runtime Helper: 사용자 전용 dev server 운영 thread
Orchestrator: 서버 필요 여부 판단, 사용자에게 수동 실행/재시작/상태확인 요청
Worker: dev server 필요 사항을 Orchestrator에게 보고
Updater: Orchestrator가 보낸 Board Event만 상황판에 반영
```

에이전트와 thread는 사용자의 명시 지시 없이 dev server를 start/stop/restart하지 않는다. 포트 kill도 하지 않는다. Orchestrator, Worker, Updater는 Runtime Helper thread에 메시지를 보내지 않는다.

### Runtime State

Runtime Helper는 관측한 로컬 상태를 아래 파일에 기록할 수 있다.

```text
.orchestrator/runtime-state.json
```

권장 필드:

```text
service
status
port
pid
command
workingDirectory
healthUrl
owner
startedAt
lastHealthCheckAt
lastError
```

로그 파일이 필요하면 아래 폴더를 사용한다.

```text
.orchestrator/runtime-logs/
```

`.orchestrator/runtime-state.json`과 `.orchestrator/runtime-logs/`는 local-only 운영 산출물이다. 공개 Git에 포함하려면 사용자 승인이 필요하다.

### User Runtime Request Format

오케스트레이터가 사용자에게 dev server 수동 조작을 요청할 때는 아래 형식을 따른다.

```text
[Runtime Request For User]
Action: start / stop / restart / status
Service: web / game-server / all

[Suggested Command]
Command:
Working directory:

[Why]
Reason:

[Expected Check]
URL:
Expected:
```

사용자가 수동으로 실행할 기본 서비스:

```text
web
command: corepack pnpm --filter web dev
port: 3000
health: http://localhost:3000

game-server
command: corepack pnpm --filter game-server dev
port: 4000
health: http://localhost:4000/health
```

### Safety Rules

```text
에이전트는 사용자의 명시 지시 없이 dev server를 start/stop/restart하지 않는다.
에이전트는 port kill 또는 PID 종료를 수행하지 않는다.
Worker thread는 공유 dev server를 직접 조작하지 않는다.
Orchestrator, Worker, Updater는 Runtime Helper thread에 메시지를 보내지 않는다.
서버 재시작이 검증에 필요하면 Worker는 Orchestrator에게 보고하고, Orchestrator는 사용자에게 수동 재시작을 요청한다.
runtime-state는 관측 기록일 뿐 프로세스 종료 권한의 근거가 아니다.
```

---

## 8. Stop Conditions

오케스트레이터 또는 개발 thread는 아래 상황에서 구현을 멈추고 사용자에게 보고한다.

```text
게임 규칙 변경이 필요하다.
포인트/보상/정산 정책 변경이 필요하다.
DB schema 변경이 필요하다.
socket contract 변경이 필요하다.
frontend가 server source of truth를 재현/예측해야 한다.
preview/mock route를 실제 게임 route로 승격해야 한다.
명세와 현재 구현이 충돌한다.
검증 실패 원인이 원래 작업 범위를 벗어난다.
새 패키지 설치가 필요하다.
검증에 필요한 dev server가 꺼져 있어 사용자 수동 실행이 필요하다.
dev server 재시작이 필요하다.
port kill 또는 PID 종료가 필요하다.
```

멈춤 보고에는 최소 아래를 포함한다.

```text
무엇이 막혔는지
왜 현재 범위를 넘어서는지
가능한 선택지
추천 선택지
사용자가 결정해야 하는 항목
```

---

## 9. Adoption Plan

이 프로토콜은 단계적으로 도입한다.

### Phase 0. 경마는 기존 흐름으로 마무리

새 운영 시스템을 끼워 넣지 않는다.

완료 기준:

```text
경마 핵심 플레이 가능
큰 blocker 없음
남은 작업을 polish 또는 후속 기능으로 분리 가능
```

### Phase 1. 프로토콜 문서화

이 문서가 해당 단계의 산출물이다.

자동화 없음.
Notion DB 없음.
thread 자동 전송 없음.

### Phase 2. 수동 Work Order 운영

오케스트레이터가 Work Order 초안을 만들고 사용자가 승인한다.

전달은 사용자가 직접 복사하거나, 사용자 승인 후 오케스트레이터가 전송한다.

### Phase 3. 승인 후 thread message 전송

오케스트레이터가 `send_message_to_thread`를 사용하되, 보내기 전 사용자에게 초안을 보여준다.

### Phase 4. 제한적 자동 진행

명세와 Gate 안에서 명확한 후속 단계만 자동 전송한다.

자동 가능:

```text
같은 phase 안의 후속 검증
실패한 테스트 재실행
명세에 이미 적힌 다음 구현 단계
문서에 적힌 검증 명령 수행
현재 thread에서 단순 HTTP health 확인
```

자동 금지:

```text
게임 규칙 변경
경제/정산 정책 변경
socket contract 큰 변경
DB schema 변경
server-authoritative 구조 변경
dev server start/stop/restart
port/PID kill
```

### Phase 5. Notion 상태판 연결

Notion은 상태판과 승인 기록만 담당한다.

Repo-local 문서가 실행 규칙의 source of truth다.

### Phase 6. 다음 신규 게임부터 full loop 적용

사용자 개입 지점:

```text
기획 승인
직접 플레이 피드백
정책/구조 변경 승인
```

오케스트레이터 담당:

```text
명세 읽기
Gate Review
단계 분할
thread 전달
결과 수집
후속 단계 진행
사용자 호출
```

---

## 10. Current Non-Goals

이 문서는 아래를 구현하지 않는다.

```text
티켓 시스템
Notion database schema
자동 상태 업데이트
자동 thread 생성
자동 PR 생성
dev server 자동 start/stop/restart
경마/블랙잭/복싱 기능 구현
```

이 문서의 목적은 자동화 전에 운영 프로토콜을 먼저 고정하는 것이다.
