# Codex Ticket Workflow

이 폴더는 여러 Codex thread가 사람이 티켓을 보고 일하듯 움직이기 위한 로컬 작업 운영판이다.

## Source Of Truth

- 티켓의 실제 상태는 `tickets/BK-*.md` 파일의 frontmatter에 둔다.
- `tickets/BOARD.md`는 스크립트가 재생성하는 상황판이다.
- `tickets/BACKLOG.md`는 사람이 우선순위와 다음 후보를 정리하는 큐다.
- `THREAD_SYNC.md`는 local-only handoff다. 공개 커밋 대상이 아니다.
- 공개 가능한 작업 요약은 `ENGINEERING_LOG.md`에 남긴다.

## Commands

티켓 발행:

```powershell
node scripts/update-ticket-board.mjs new --title "Wallet ledger smoke cleanup" --owner Backend --priority P1 --area "packages/db"
```

상태 변경:

```powershell
node scripts/update-ticket-board.mjs status BK-0002 "In Progress"
node scripts/update-ticket-board.mjs status BK-0002 Review
node scripts/update-ticket-board.mjs status BK-0002 Done
```

담당 thread 변경:

```powershell
node scripts/update-ticket-board.mjs assign BK-0002 Frontend
```

상황판 재생성:

```powershell
node scripts/update-ticket-board.mjs
```

## Status Lifecycle

```text
Ready -> In Progress -> Review -> Done
                    \-> Blocked
Done -> Archived
```

상태 의미:

- `Ready`: thread가 집어갈 수 있다.
- `In Progress`: 특정 thread가 작업 중이다.
- `Review`: 구현은 끝났고 검토 또는 후속 확인이 필요하다.
- `Blocked`: 사용자 결정, 외부 상태, 다른 thread 작업이 필요하다.
- `Done`: 검증과 커밋까지 끝났다.
- `Archived`: 완료 후 장기 보관 상태다.

## Thread Rules

- 한 thread는 한 번에 티켓 하나만 처리한다.
- 작업 시작 전 `AGENTS.md` 규칙에 따라 범위를 보고한다.
- 티켓 범위 밖 파일이 필요해지면 멈추고 변경된 범위를 보고한다.
- `package.json`, `pnpm-lock.yaml`, `packages/shared`, auth 파일, `.env.example`, `AGENTS.md`, `ENGINEERING_LOG.md`는 공유 파일로 취급한다.
- 공유 파일을 바꾸면 `THREAD_SYNC.md`에는 상세 handoff를 남기고, 공개 가능한 요약은 `ENGINEERING_LOG.md`에 남긴다.
- 작업 완료 후 티켓 본문에 결과와 검증 요약을 업데이트한 뒤 상황판을 재생성한다.
- 최종 응답에는 `AGENTS.md` 규칙에 따라 commit hash를 보고한다.

## Suggested Thread Prompts

Backend thread:

```text
Backend thread야. tickets/BK-0002를 처리해줘.
AGENTS.md와 tickets/00_WORKFLOW.md를 따르고, 검증 후 커밋까지 해줘.
```

Frontend thread:

```text
Frontend thread야. tickets/BK-0003을 처리해줘.
앱 UI 영역만 수정하고, 공유 파일이 필요하면 먼저 범위 변경을 보고해줘.
```

Review thread:

```text
Review thread야. 최근 커밋과 tickets/BOARD.md를 기준으로 Review 상태 티켓만 코드 리뷰해줘.
버그, 회귀 위험, 누락 테스트를 우선해서 보고해줘.
```
