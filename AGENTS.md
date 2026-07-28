# Agent Working Rules

이 저장소에서 작업하는 AI 에이전트는 아래 규칙을 따른다.

## 1. 작업 시작 전 범위 보고

모든 작업을 시작하기 전에 사용자에게 작업 범위를 먼저 보고한다.

보고에는 최소한 다음 항목을 포함한다.

```text
1. 이번 작업의 목표
2. 수정 또는 생성이 예상되는 파일/폴더
3. 실행할 주요 명령
4. 작업에서 제외하는 범위
5. 검증 방법
```

작업 범위 보고 예시:

```text
이번 작업 범위:
- 목표: Drizzle 초기 schema와 migration 설정
- 수정 예상: packages/db, package.json, .env.example
- 실행 명령: pnpm typecheck, pnpm --filter @bk-games/db db:generate
- 제외: 실제 인증/게임 로직 구현
- 검증: typecheck와 migration 생성 확인
```

## 2. 범위가 커지면 멈추고 다시 보고

작업 중 예상보다 범위가 커지면 바로 구현을 계속하지 않는다.

다음 경우에는 사용자에게 변경된 범위를 다시 보고한다.

```text
새 패키지 설치가 필요할 때
기존 문서와 다른 설계 결정이 필요할 때
예상하지 못한 파일을 수정해야 할 때
테스트/빌드 실패 원인이 원래 작업 범위를 벗어날 때
DB schema, 인증, 포인트 정산, socket contract가 바뀔 때
```

## 3. 구현 기준 문서 우선순위

구현 관련 판단은 다음 문서를 우선한다.

```text
docs/11_AI_AGENT_IMPLEMENTATION_DECISIONS.md
docs/10_FIRST_TASKS.md
docs/02_ARCHITECTURE.md
docs/05_DATABASE_SCHEMA.md
docs/06_POINT_WALLET.md
docs/04_SOCKET_EVENTS.md
```

스레드 운영, Work Order, Gate Review, 오케스트레이터 판단은 오케스트레이션 모드가 켜져 있을 때만 다음 문서를 우선한다.

```text
docs/17_ORCHESTRATOR_PROTOCOL.md
```

`private/` 폴더의 문서는 사용자 개인 참고용이며, 구현 source of truth가 아니다.

## 4. 변경 원칙

작업은 작게 나누어 진행한다.

```text
한 번에 하나의 주요 작업 단위만 진행한다.
문서 변경과 코드 구현을 불필요하게 섞지 않는다.
포인트/정산/인증/socket contract 변경은 반드시 명시적으로 보고한다.
생성물, 캐시, 로그 파일은 커밋 대상에서 제외한다.
```

## 5. 검증 보고

작업이 끝나면 다음을 사용자에게 보고한다.

```text
무엇을 바꿨는지
어떤 파일을 수정했는지
어떤 명령으로 검증했는지
실패하거나 보류된 검증이 있는지
다음 작업으로 무엇이 자연스러운지
```

## 6. 커밋 규칙

파일을 수정하거나 생성한 작업은 검증 후 같은 작업 단위 안에서 커밋까지 완료한다.

기본 흐름은 다음과 같다.

```text
1. git status로 변경 파일을 확인한다.
2. 필요한 검증 명령을 실행한다.
3. 작업 범위에 해당하는 파일만 명시적 pathspec으로 stage한다.
4. staged diff를 확인한다.
5. 검증이 통과하고 staged diff가 작업 범위와 일치하면 commit한다.
6. 최종 응답에 commit hash와 검증 결과를 보고한다.
```

Stage할 때는 파일 경로를 명시한다.

```text
허용 예시:
git add -- AGENTS.md ENGINEERING_LOG.md
git add -- packages/db/src/wallet-transactions.ts packages/db/package.json
```

다음 방식은 unrelated change를 포함할 위험이 있으므로 사용하지 않는다.

```text
금지:
git add .
git add -A
git add --all
git commit -a
IDE 또는 GUI의 Stage All / Commit All
와일드카드로 넓은 범위를 stage하는 명령
```

커밋 전에는 반드시 staged 파일과 staged diff를 확인한다.

```text
git diff --cached --name-only
git diff --cached
```

예외 상황에서는 커밋하지 않고 이유를 보고한다.

```text
사용자가 명시적으로 커밋하지 말라고 한 경우
검증이 실패했고 실패 원인을 아직 해결하지 못한 경우
사용자 또는 다른 작업자가 만든 unrelated change가 섞여 있어 stage 범위가 불명확한 경우
비밀값, 로컬 .env, 로그, 캐시, 생성물 등 커밋하면 안 되는 파일만 변경된 경우
```

커밋할 때는 unrelated change를 포함하지 않는다.

이미 staged 된 unrelated change가 있으면 커밋하지 않고 사용자에게 보고한다.

## 7. Multi-Thread 작업 분리 규칙

이 프로젝트는 백엔드 스레드와 프론트엔드 스레드를 동시에 운영할 수 있다.

각 스레드는 작업 시작 전 자신이 담당하는 영역을 작업 범위 보고에 명시한다.

Backend thread 기본 담당:

```text
packages/db
apps/game-server
database schema / migrations
wallet / ledger / reward / settlement
socket contracts
backend auth integration
```

Frontend thread 기본 담당:

```text
apps/web UI routes
components
styling
responsive layout
frontend-only state
mock screens and visual QA
```

공유 파일은 수정 전에 반드시 사용자에게 보고한다.

```text
package.json
pnpm-lock.yaml
packages/shared
apps/web/src/lib/auth*
apps/web/src/app/api/auth/[...all]/route.ts
.env.example
AGENTS.md
ENGINEERING_LOG.md
```

`THREAD_SYNC.md`는 여러 Codex thread를 맞추기 위한 local-only handoff 파일이며 공개 Git에 올리지 않는다.

공유 파일을 수정하면 작업 완료 후 로컬 `THREAD_SYNC.md`에는 상세 작업 이력을 남기고, 공개해도 되는 요약은 `ENGINEERING_LOG.md`에 정리한다.

다른 스레드의 담당 영역에서 변경이 필요해지면 즉시 멈추고 사용자에게 범위 변경을 보고한다.

## 8. Orchestrator / Worker / Updater 운영 규칙

현재 기본 운영 모드는 `Direct Agent Mode`다.

```text
ORCHESTRATION_MODE: off
```

`ORCHESTRATION_MODE: off`일 때는 오케스트레이터 운영을 강제하지 않는다.

기본 동작:

```text
현재 thread가 직접 작업을 수행한다.
자동으로 Work Order를 발행하지 않는다.
자동으로 Board Event를 보내지 않는다.
자동으로 worker/updater thread에 메시지를 보내지 않는다.
이미 남아 있는 Ready/Blocked/In Progress 티켓을 자동 배정하지 않는다.
```

오케스트레이션을 다시 켜려면 사용자가 명시적으로 지시해야 한다.

켜는 지시 예시:

```text
오케스트레이터 모드 켜
오케스트레이션 다시 시작
티켓 큐 다시 배정해
$issue-ticket
$dispatch-ticket
```

끄는 지시 예시:

```text
오케스트레이터 모드 꺼
오케스트레이션 중단
티켓 배정 멈춰
직접 작업 모드로 해
```

명시적인 `$issue-ticket` 또는 `$dispatch-ticket` 호출은 해당 skill의 1회성 실행으로 처리한다. 이 호출만으로 지속적인 오케스트레이터 모드가 켜진 것으로 간주하지 않는다.

오케스트레이션 모드를 켜면 아래 규칙을 따른다.

오케스트레이션 모드로 진행되는 작업은 `docs/17_ORCHESTRATOR_PROTOCOL.md`를 따른다.

기본 역할:

```text
Orchestrator thread: Work Order 발행, Gate Review, contract 조율, thread 전달, callback 수집, Board Event 발행
Worker thread: Work Order 범위 안의 구현/검증/커밋, blocker callback
Updater thread: Orchestrator가 보낸 Board Event만 반영하여 상황판 관리
```

Work Order 규칙:

```text
Orchestrator는 목표, source 문서, 수정 가능/금지 범위, Gate, Stop Conditions, Done Criteria를 명시한다.
Worker는 Work Order 밖의 작업이 필요하면 구현하지 말고 Blocked 또는 Needs Review로 보고한다.
Worker는 완료 후 Status, Changed files, Validation, Commit, Next recommended step, Blocker를 보고한다.
```

Contract/Gate 규칙:

```text
socket contract, REST contract, DB schema, auth/game token, wallet/ledger/settlement, server-authoritative state가 바뀌면 Gate Review가 필요하다.
contract가 producer와 consumer를 모두 바꾸면 Orchestrator가 해당 backend / frontend thread에 각각 Work Order를 보낸다.
frontend는 server source of truth를 localStorage나 session-only event로 대체하지 않는다.
```

Board update 규칙:

```text
티켓 생성, 상태 변경, 완료, 차단, 보류는 Orchestrator가 Updater thread에 Board Event로 전달한다.
Worker thread는 Updater thread에 직접 상태 변경을 보내지 않는다.
Updater thread는 Orchestrator 외 thread가 보낸 보드 변경 요청을 반영하지 않고 Orchestrator 확인을 요구한다.
```

상황판 파일:

```text
.orchestrator/work-orders.json
.orchestrator/board.html
```

`.orchestrator/`는 운영 상황판 산출물이며, 공개 Git 커밋 대상에 포함하려면 사용자의 명시 승인이 필요하다.

## 9. Dev Server 수동 운영 규칙

개발 서버 start/stop/restart는 사용자가 수동으로 수행한다.

기본 역할:

```text
User: dev server start / stop / restart 직접 수행, 필요하면 Runtime Helper thread에 직접 입력
Runtime Helper thread: 사용자 전용 dev server 운영 thread
Orchestrator thread: 서버 필요 여부 판단, 사용자에게 수동 실행/재시작/상태확인 요청
Worker thread: 서버가 필요하면 Orchestrator에게 요청하고, 직접 서버를 켜거나 끄지 않음
Updater thread: Orchestrator가 보낸 Board Event로 runtime 상태만 반영
```

에이전트와 thread는 사용자의 명시 지시 없이 dev server를 start/stop/restart하지 않는다. 포트 kill도 하지 않는다. Orchestrator, Worker, Updater는 Runtime Helper thread에 메시지를 보내지 않는다.

사용자가 수동으로 실행할 기본 명령:

```text
web: corepack pnpm --filter web dev
game-server: corepack pnpm --filter game-server dev
```

기본 포트와 health check:

```text
web: http://localhost:3000
game-server: http://localhost:4000/health
```

사용자에게 수동 작업을 요청할 때는 최소 아래 항목을 포함한다.

```text
Action: start / stop / restart / status
Service: web / game-server / all
Port:
Health check URL:
Command if needed:
Why needed:
```

Runtime 상태 파일:

```text
.orchestrator/runtime-state.json
.orchestrator/runtime-logs/
```

Runtime 안전 규칙:

```text
에이전트는 사용자의 명시 지시 없이 dev server를 start/stop/restart하지 않는다.
에이전트는 포트 kill 또는 PID 종료를 수행하지 않는다.
Worker thread는 공유 dev server를 직접 조작하지 않는다.
Orchestrator, Worker, Updater는 Runtime Helper thread에 메시지를 보내지 않는다.
서버 재시작이 검증에 필요하면 Worker는 Orchestrator에게 보고하고, Orchestrator는 사용자에게 수동 재시작을 요청한다.
runtime-state는 관측 기록일 뿐 프로세스 종료 권한의 근거가 아니다.
```

`.orchestrator/runtime-state.json`과 `.orchestrator/runtime-logs/`는 local-only 운영 산출물이며, 공개 Git 커밋 대상에 포함하려면 사용자의 명시 승인이 필요하다.
