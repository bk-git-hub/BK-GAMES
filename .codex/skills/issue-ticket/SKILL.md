---
name: issue-ticket
description: Create an orchestration ticket only, update the board through the Board Updater, and do not dispatch work to frontend/backend/worker/runtime threads. Use when the user asks Codex to issue, create, register, or log a ticket/work item/task for the BK Games orchestration board, especially before implementation. If the request is ambiguous, spans frontend/backend contract changes, or is not clearly ticket-shaped, ask the user before creating the ticket.
---

# Issue Ticket

## Core Rule

Create a ticket and update the board only. Do not send implementation instructions to worker threads.

Allowed thread message:

```text
Board Updater only: Board Event for ticket creation/update
```

Forbidden thread messages:

```text
Frontend / Frontend2 / Backend / Review / QA / Runtime Helper
```

If the user explicitly asks to dispatch the ticket to a worker, do not use this skill as the dispatch step. First finish ticket creation, then wait for a separate orchestration decision.

## Decision Check

Before issuing a ticket, decide whether the request is ticketable.

Ticketable:

```text
Single clear objective
No immediate implementation dispatch requested
Can be tracked on the board as Intake / Gate Review / Ready
Success criteria can be written in 1-3 bullets
```

Ask the user before ticketing when:

```text
The request spans frontend and backend contract design
The owner thread is unclear and choosing it would imply implementation routing
The requested work is too broad for one ticket
The request changes socket/REST contract, DB schema, auth/game token, wallet/ledger/settlement, or server-authoritative behavior
The request is a conversation/idea rather than a work item
The user appears to be asking for immediate implementation rather than ticket issuance
```

Ask one concise question, usually:

```text
이건 티켓 하나로 묶기엔 contract/Gate가 걸릴 수 있어. 티켓만 발급할까, 아니면 먼저 범위를 쪼갤까?
```

## Ticket Shape

Use a compact ticket payload.

```text
ticketId:
title:
status: Intake / Gate Review / Ready
type: bug / feature / chore / investigation / docs / qa
summary:
successCriteria:
scope:
outOfScope:
risk:
needsClarification:
source:
```

Status defaults:

```text
Intake: default for most user requests
Gate Review: contract, DB, auth, wallet, settlement, realtime, or server-authoritative risk
Ready: only when owner/scope/success criteria are already explicit and no Gate is needed
```

## Board Event

Send only a Board Event to the Board Updater. Use the known Board Updater thread when available in conversation context.

```text
[Board Event]
event: ticket.created
source: orchestrator
ticket:
  ticketId:
  title:
  status:
  type:
  summary:
  successCriteria:
  scope:
  outOfScope:
  risk:
  needsClarification:
  source:
note: Do not dispatch to worker threads.
```

If the Board Updater thread is unknown, ask the user for it or report that the ticket is drafted but not posted.

## Response To User

After the Board Event is sent, report only:

```text
티켓 발급 완료:
- ticketId:
- title:
- status:
- board update:
```

Do not include worker handoff text, implementation plan, or code-level analysis unless the user asks separately.
