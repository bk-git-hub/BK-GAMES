---
name: dispatch-ticket
description: Dispatch an existing orchestration ticket to exactly one idle matching worker thread, update the Board Updater that the ticket is in progress, and require the worker to callback the Orchestrator on completion, blocker, or anomaly. Use when the user asks Codex to assign, dispatch, hand off, start, send, or give an already-issued ticket/work order to a suitable idle thread. Ask the user instead of dispatching if the ticket is missing, owner/thread fit is unclear, the target thread is not idle, or the ticket involves ambiguous frontend/backend contract or Gate decisions.
---

# Dispatch Ticket

## Core Rule

Dispatch one existing ticket to one idle matching worker thread.

Allowed messages per dispatch:

```text
1 Board Updater message: mark the ticket assigned / In Progress
1 Worker message: deliver the Work Order
```

Forbidden:

```text
Sending to more than one worker thread
Sending multiple Work Orders for the same ticket in one invocation
Sending to Runtime Helper
Sending to a busy / in-progress worker
Dispatching before owner fit is clear
Dispatching contract-ambiguous work without asking the user
```

## Preconditions

Before dispatching, confirm:

```text
Ticket exists and has a ticketId
Ticket has a clear objective and success criteria
Ticket status is Ready, or the user explicitly asks to start it
Target owner type is clear
Target thread is idle
Board Updater thread is known
Orchestrator thread id is known or available from context
```

If any item is missing, ask the user one concise question instead of dispatching.

## Thread Fit

Choose the worker by responsibility, not by convenience.

```text
Backend:
packages/db
apps/game-server
database schema / migrations
wallet / ledger / reward / settlement
socket contracts
backend auth integration

Frontend:
apps/web shared UI routes
components
styling
responsive layout
frontend-only state
mock screens and visual QA

Frontend2:
racing / BK Derby frontend work when established by conversation context

Review / QA:
diff review
browser/play smoke
regression risk
contract mismatch checks
```

If a task touches both producer and consumer contracts, do not dispatch with this skill. Ask whether to split into producer/consumer tickets or run Gate Review first.

## Idle Check

Use thread inspection before dispatch.

Do not send a Work Order when the candidate thread has:

```text
an in-progress turn
an unresolved blocker from a previous ticket
unclear ownership
recent work on an unrelated conflicting area
```

If the best matching thread is busy, report that it is not idle and ask whether to wait, choose another matching idle thread, or split/reprioritize.

## Board Update

Before the worker handoff, send the Board Updater a Board Event.

```text
[Board Event]
event: ticket.assigned
source: orchestrator
ticketId:
status: In Progress
assigneeThread:
assigneeRole:
summary:
note: Dispatching exactly one Work Order to the selected idle worker.
```

If the Board Event fails, do not dispatch the worker message. Report the board update failure.

## Worker Message

Send exactly one Work Order to the selected worker.

```text
[Role]
너는 <Backend / Frontend / Frontend2 / Review / QA> thread다.

[Ticket]
ticketId:
title:
status: In Progress

[Work Order]
이번 작업의 목표는 ...

[Source]
읽어야 할 문서:
- AGENTS.md
- docs/17_ORCHESTRATOR_PROTOCOL.md
- ...

[Scope]
수정 가능:
- ...

수정 금지:
- ...

[Stop Conditions]
아래가 필요하면 구현하지 말고 Orchestrator에게 답장:
- 범위 확장
- 새 package 설치
- contract / DB / auth / wallet / settlement / socket 변경
- owner 영역 밖 파일 수정 필요
- 검증 실패 원인이 티켓 범위 밖

[Callback Required]
작업 완료, 작업 중 이상, blocker, scope change가 생기면 반드시 Orchestrator thread에 답장한다.
다른 worker thread나 Runtime Helper에는 메시지를 보내지 않는다.

[Done Criteria]
- 작업 시작 전 범위 보고
- 검증 통과 또는 실패 사유 보고
- 작업 범위 파일만 명시 pathspec으로 stage
- staged diff 확인
- commit
- Orchestrator callback

[Callback Format]
[Ticket Callback]
ticketId:
Status: Done / Blocked / Needs Review
Changed files:
Validation:
Commit:
Blocker:
Next recommended step:
```

## User Response

After dispatch, report briefly:

```text
티켓 전달 완료:
- ticketId:
- assignee:
- board status: In Progress
- worker message: sent
```

Do not include implementation details unless the user asks.
