# BK Games Agent Guide

Keep this file concise and current. It contains repository-wide guidance only; task-specific requirements belong in the user request or the relevant design document.

## Repository Map

- `apps/web`: Next.js UI, web routes, and frontend-only state.
- `apps/game-server`: NestJS authentication bridge and authoritative real-time game server.
- `packages/db`: Drizzle schema, migrations, wallet, ledger, rewards, betting, and settlement.
- `packages/game-engine`: Pure game rules and deterministic simulations.
- `packages/shared`: Public cross-app types and socket contracts.
- `docs`: Architecture, domain specifications, implementation decisions, and operational reports.
- `private`: Personal reference material; never treat it as implementation authority or commit it.

## Source-of-Truth Routing

Read only the documents relevant to the task:

- Cross-cutting architecture: `docs/02_ARCHITECTURE.md`
- Security-critical implementation decisions: `docs/11_AI_AGENT_IMPLEMENTATION_DECISIONS.md`
- Database and wallet: `docs/05_DATABASE_SCHEMA.md`, `docs/06_POINT_WALLET.md`
- Socket contracts: `docs/04_SOCKET_EVENTS.md`
- HTTP APIs and admin behavior: `docs/07_API_SPEC.md`, `docs/08_ADMIN_SPEC.md`
- Blackjack: `docs/03_REALTIME_BLACKJACK_TABLE_SPEC.md`
- Baccarat: `docs/12_BACCARAT_SCOPE.md`, `docs/13_BACCARAT_REALTIME_TABLE_SPEC.md`, `docs/14_BACCARAT_IMPLEMENTATION_PLAN.md`
- Horse racing: `docs/15_HORSE_RACING_BACKEND_SPEC.md`
- Boxing: `docs/16_BOXING_BACKEND_SPEC.md`
- Deployment: `docs/18_BACKEND_DEPLOYMENT_CHECKLIST.md`
- Next.js PPR work: `docs/19_NEXT16_PPR_ADOPTION_PLAN.md`, `docs/21_PPR_FINAL_PERFORMANCE_REPORT.md`

`docs/10_FIRST_TASKS.md` is historical setup guidance, not the current global implementation order. If current code and documentation materially disagree, report the conflict before making a design decision.

## Common Commands

Run commands from the repository root with the pinned pnpm version through Corepack.

```text
corepack pnpm install
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

Prefer the narrowest relevant verification during development:

```text
web:          corepack pnpm --filter web typecheck
web lint:     corepack pnpm --filter web lint
game server:  corepack pnpm --filter game-server test
engine:       corepack pnpm --filter @bk-games/game-engine test
database:     corepack pnpm --filter @bk-games/db typecheck
```

Database smoke scripts require the appropriate local environment and PostgreSQL state. Select the script from `packages/db/package.json` that matches the changed flow; do not run migrations, seeds, or destructive database operations unless the task requires them.

## Critical Invariants

- The server is authoritative for cards, game state, bet limits, results, payouts, and settlement.
- Every point mutation must be idempotent and must update the wallet and append its ledger entry in one database transaction.
- Never broadcast wallet balances, ledger data, auth tokens, raw auth user IDs, or admin roles in public table events.
- Round cancellation refunds use the persisted final bet amount and must be safe to retry.
- Bet limits are calculated and revalidated on the server; client values are display-only.
- Keep reusable game rules in `packages/game-engine`, not in gateways or UI components.
- Treat changes to `packages/shared` as public contract changes and verify every affected producer and consumer.

## Working Agreements

- For file-changing work, briefly state the goal, expected files, and validation before editing. Read-only questions do not need a formal scope report.
- Keep each change focused. Do not mix unrelated documentation, refactors, and behavior changes.
- Continue through normal cross-file consequences of an in-scope change. Report before expanding into a new production dependency, DB schema, authentication behavior, wallet or settlement semantics, public API, or socket contract.
- Preserve user changes and unrelated worktree changes. Do not delete or rewrite files merely to make the worktree clean.
- Do not commit secrets, local environment files, logs, caches, runtime observations, or generated output artifacts.

## Verification and Done Criteria

- Add or update tests when behavior changes and a meaningful automated test is possible.
- Run the narrowest relevant checks first; run repository-wide checks when the change is cross-cutting or the task explicitly requires them.
- Review the final diff for scope, regressions, accidental generated files, secrets, and contract changes.
- Report changed files, commands run, results, and any skipped or blocked verification.
- A change is not complete when required verification is failing for a reason introduced by the change.

## Git

- After changing files, validate and commit the completed work unless the user explicitly says not to commit.
- Stage only explicit paths. Never use `git add .`, `git add -A`, `git add --all`, `git commit -a`, broad wildcard staging, or Stage All.
- Before committing, inspect `git diff --cached --name-only` and `git diff --cached`.
- Never include unrelated or pre-existing staged changes. If the staged scope is unclear or required verification fails, do not commit and explain why.
- Report the commit hash in the final response.

## Runtime Ownership

- Do not start, stop, restart, or kill a dev server or its PID unless the user explicitly asks.
- Web: `corepack pnpm --filter web dev` at `http://localhost:3000`.
- Game server: `corepack pnpm --filter game-server dev` with health check at `http://localhost:4000/health`.
- If runtime verification requires a restart, ask the user to perform it and explain why.
