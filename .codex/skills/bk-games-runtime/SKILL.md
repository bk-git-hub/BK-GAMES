---
name: bk-games-runtime
description: User-owned BK-Games local runtime helper for the Runtime Helper thread only. Use only when the user explicitly invokes this skill inside the Runtime Helper thread, or explicitly tells the current thread to act as Runtime Helper. Provides commands and an optional helper script for status/start/stop/restart of BK-Games local dev servers on Windows. Orchestrator, Worker, Updater, Frontend, Frontend2, Backend, Review, and QA threads must not invoke this skill to operate servers or message Runtime Helper.
---

# BK-Games Runtime

## Ownership Rule

This is a user-owned Runtime Helper skill.

Use it only when:

```text
The user is directly operating the Runtime Helper thread
The user explicitly invokes $bk-games-runtime for local server control
The user explicitly tells the current thread to act as Runtime Helper
```

Do not use it when acting as:

```text
Orchestrator
Worker
Updater
Frontend / Frontend2
Backend
Review / QA
```

Those threads may ask the user to start, stop, restart, or inspect servers, but must not run runtime commands themselves and must not message Runtime Helper.

## Known Runtime

```text
Repo: C:\Users\bksoft\Documents\BK-Games
Web: apps/web, port 3000
Game server: apps/game-server, port 4000
Database: Docker container bk-games-postgres, port 5432
Tailscale IPv4: 100.107.189.17
```

Local URLs:

```text
http://localhost:3000/
http://localhost:4000/health
http://localhost:4000/racing/tables
http://localhost:4000/blackjack/tables
```

Tailscale URLs:

```text
http://100.107.189.17:3000/
http://100.107.189.17:4000/health
http://100.107.189.17:4000/racing/tables
http://100.107.189.17:4000/blackjack/tables
```

## Manual Commands

From the repo root:

```powershell
corepack pnpm --filter game-server dev
corepack pnpm --filter web dev
```

If the frontend must be reachable over Tailscale, use the helper script or start Next with host `0.0.0.0`.

## Helper Script

Optional helper script:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\bksoft\Documents\BK-Games\.codex\skills\bk-games-runtime\scripts\bk-games-runtime.ps1" status
```

Actions:

```powershell
# Diagnosis only.
powershell -ExecutionPolicy Bypass -File "C:\Users\bksoft\Documents\BK-Games\.codex\skills\bk-games-runtime\scripts\bk-games-runtime.ps1" status

# User-owned start.
powershell -ExecutionPolicy Bypass -File "C:\Users\bksoft\Documents\BK-Games\.codex\skills\bk-games-runtime\scripts\bk-games-runtime.ps1" start

# User-owned stop of frontend/backend.
powershell -ExecutionPolicy Bypass -File "C:\Users\bksoft\Documents\BK-Games\.codex\skills\bk-games-runtime\scripts\bk-games-runtime.ps1" stop

# User-owned restart of frontend/backend.
powershell -ExecutionPolicy Bypass -File "C:\Users\bksoft\Documents\BK-Games\.codex\skills\bk-games-runtime\scripts\bk-games-runtime.ps1" restart
```

Use `-TailscaleDown` or `-StopPostgres` only when the user explicitly asks to stop Tailscale or Postgres too.

## Safety Rules

```text
Never stop unknown ports.
Never stop Tailscale or Postgres unless explicitly requested.
Do not edit source code, .env, Docker config, or repo files while doing runtime work.
Treat this as local development runtime work, not deployment or production hosting.
Report what ran, which ports are listening, health check results, and relevant log paths.
```

Environment reminders for diagnosis:

```text
NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL should use the frontend origin.
NEXT_PUBLIC_GAME_SERVER_URL should be the backend origin only, for example http://100.107.189.17:4000.
Do not include /blackjack in NEXT_PUBLIC_GAME_SERVER_URL; the frontend appends namespaces itself.
If frontend env changed, restart the web server and hard refresh the browser.
```
