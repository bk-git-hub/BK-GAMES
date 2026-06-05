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
2. 작업 범위에 해당하는 파일만 stage한다.
3. 필요한 검증 명령을 실행한다.
4. 검증이 통과하면 commit한다.
5. 최종 응답에 commit hash와 검증 결과를 보고한다.
```

예외 상황에서는 커밋하지 않고 이유를 보고한다.

```text
사용자가 명시적으로 커밋하지 말라고 한 경우
검증이 실패했고 실패 원인을 아직 해결하지 못한 경우
사용자 또는 다른 작업자가 만든 unrelated change가 섞여 있어 stage 범위가 불명확한 경우
비밀값, 로컬 .env, 로그, 캐시, 생성물 등 커밋하면 안 되는 파일만 변경된 경우
```

커밋할 때는 unrelated change를 포함하지 않는다.

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
THREAD_SYNC.md
```

공유 파일을 수정하면 작업 완료 후 `THREAD_SYNC.md`에 변경 이유와 영향을 기록한다.

다른 스레드의 담당 영역에서 변경이 필요해지면 즉시 멈추고 사용자에게 범위 변경을 보고한다.
