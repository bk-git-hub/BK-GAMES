# BK-0001 Codex ticket board bootstrap

---
id: BK-0001
title: Codex ticket board bootstrap
status: Done
owner_thread: Planner
priority: P1
area: Workflow
created: 2026-07-04
updated: 2026-07-04
depends_on:
related_files: tickets, scripts/update-ticket-board.mjs, ENGINEERING_LOG.md
---

## Goal

Codex thread들이 티켓을 발행하고, 상태를 바꾸고, 공통 상황판을 확인할 수 있는 로컬 운영 구조를 만든다.

## Scope

- `tickets/` 아래 티켓 workflow 문서, backlog, template, 첫 bootstrap ticket을 추가한다.
- 티켓 frontmatter를 읽어 `tickets/BOARD.md`를 재생성하는 Node 스크립트를 추가한다.
- 스크립트가 새 티켓 발행, 상태 변경, 담당 thread 변경을 지원하게 한다.
- 공개 가능한 작업 요약은 `ENGINEERING_LOG.md`에 남긴다.
- 상세 handoff는 local-only `THREAD_SYNC.md`에 남긴다.

## Out Of Scope

- 외부 Jira, Linear, GitHub Issues 연동
- 웹 UI 대시보드 구현
- 자동 Codex thread 생성
- DB, 인증, 포인트, socket contract 변경

## Expected Files

- `tickets/00_WORKFLOW.md`
- `tickets/TICKET_TEMPLATE.md`
- `tickets/BACKLOG.md`
- `tickets/BOARD.md`
- `tickets/BK-0001-codex-ticket-board.md`
- `scripts/update-ticket-board.mjs`
- `ENGINEERING_LOG.md`
- `THREAD_SYNC.md`

## Validation

- `node scripts/update-ticket-board.mjs`
- `node scripts/update-ticket-board.mjs new --title "Temporary ticket smoke" --owner Planner --priority P3 --area Workflow`
- `node scripts/update-ticket-board.mjs status BK-0002 Archived`
- temporary smoke ticket deletion after validation
- `git diff --cached --name-only`
- `git diff --cached`

## Done Criteria

- [x] Scope report was provided before work started.
- [x] Ticket workflow docs exist.
- [x] Board generation script exists.
- [x] Situation board can be regenerated from ticket files.
- [x] New ticket and status update commands are smoke-tested.
- [x] Only ticket-system files are staged.
- [x] Commit is created and reported in the final response.

## Result

Done. Verification summary is listed in this ticket and the commit hash is reported in the final response.

## Notes

- `tickets/BOARD.md` is intentionally a managed project artifact so every thread can read the same situation board.
