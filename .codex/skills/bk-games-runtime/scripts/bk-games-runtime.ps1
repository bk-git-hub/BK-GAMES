[CmdletBinding()]
param(
  [ValidateSet("status", "start", "stop", "restart")]
  [string]$Action = "status",

  [string]$Repo = "C:\Users\bksoft\Documents\BK-Games",
  [string]$TailscaleIp = "100.107.189.17",
  [string]$PostgresContainer = "bk-games-postgres",
  [string]$LogRoot = "$env:TEMP\bk-games-dev-servers",

  [switch]$TailscaleDown,
  [switch]$StopPostgres
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WebPort = 3000
$GamePort = 4000
$PostgresPort = 5432
$DockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$TailscaleExe = "C:\Program Files\Tailscale\tailscale.exe"
$PnpmCmd = "C:\Program Files\nodejs\pnpm.cmd"
$NextCmd = Join-Path $Repo "apps\web\node_modules\.bin\next.cmd"
$WebDir = Join-Path $Repo "apps\web"

function Write-Section {
  param([string]$Name)
  Write-Host ""
  Write-Host "== $Name =="
}

function Get-ToolPath {
  param([string]$CommandName, [string]$PreferredPath)

  if ($PreferredPath -and (Test-Path -LiteralPath $PreferredPath)) {
    return $PreferredPath
  }

  $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  return $null
}

function Get-ListenPids {
  param([int]$Port)

  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-Http {
  param([string]$Url, [int]$TimeoutSec = 5)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    return [pscustomobject]@{
      Url = $Url
      Ok = $true
      Status = [int]$response.StatusCode
      Error = $null
    }
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }

    return [pscustomobject]@{
      Url = $Url
      Ok = $false
      Status = $status
      Error = $_.Exception.Message
    }
  }
}

function Wait-Http {
  param([string]$Url, [int]$TimeoutSec = 90)

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $result = Test-Http -Url $Url -TimeoutSec 5
    if ($result.Ok) {
      return $true
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  return $false
}

function New-RunLogDir {
  New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
  $dir = Join-Path $LogRoot (Get-Date -Format "yyyyMMdd-HHmmss")
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  return $dir
}

function Test-DockerReady {
  $docker = Get-ToolPath -CommandName "docker" -PreferredPath $null
  if (-not $docker) {
    return $false
  }

  & $docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Start-DockerIfNeeded {
  if (Test-DockerReady) {
    Write-Host "Docker is ready."
    return
  }

  if (-not (Test-Path -LiteralPath $DockerDesktop)) {
    throw "Docker is not ready and Docker Desktop was not found at $DockerDesktop."
  }

  Write-Host "Starting Docker Desktop..."
  Start-Process -FilePath $DockerDesktop -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddSeconds(120)
  do {
    Start-Sleep -Seconds 3
    if (Test-DockerReady) {
      Write-Host "Docker is ready."
      return
    }
  } while ((Get-Date) -lt $deadline)

  throw "Docker did not become ready within 120 seconds."
}

function Get-TailscaleIp {
  if (-not (Test-Path -LiteralPath $TailscaleExe)) {
    return $null
  }

  $ips = @(& $TailscaleExe ip -4 2>$null)
  if ($LASTEXITCODE -ne 0 -or $ips.Count -eq 0) {
    return $null
  }

  return $ips[0]
}

function Start-TailscaleIfNeeded {
  if (-not (Test-Path -LiteralPath $TailscaleExe)) {
    Write-Warning "Tailscale executable not found at $TailscaleExe."
    return
  }

  Write-Host "Ensuring Tailscale is up..."
  & $TailscaleExe up | Out-Host
  $actualIp = Get-TailscaleIp
  if ($actualIp) {
    Write-Host "Tailscale IPv4: $actualIp"
    if ($actualIp -ne $TailscaleIp) {
      Write-Warning "Expected Tailscale IP is $TailscaleIp, but current IP is $actualIp."
    }
  } else {
    Write-Warning "Tailscale is up command completed, but no IPv4 was reported."
  }
}

function Start-PostgresIfNeeded {
  Start-DockerIfNeeded
  $docker = Get-ToolPath -CommandName "docker" -PreferredPath $null

  $status = @(& $docker inspect --format '{{.State.Status}}' $PostgresContainer 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "Docker container '$PostgresContainer' was not found."
  }

  if ($status[0] -ne "running") {
    Write-Host "Starting $PostgresContainer..."
    & $docker start $PostgresContainer | Out-Host
  } else {
    Write-Host "$PostgresContainer is already running."
  }

  $deadline = (Get-Date).AddSeconds(60)
  do {
    $health = @(& $docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $PostgresContainer 2>$null)
    if ($LASTEXITCODE -eq 0 -and ($health[0] -eq "healthy" -or $health[0] -eq "none")) {
      Write-Host "$PostgresContainer health: $($health[0])"
      return
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "$PostgresContainer did not become healthy within 60 seconds."
}

function Start-Backend {
  param([string]$LogDir)

  $health = Test-Http -Url "http://127.0.0.1:$GamePort/health"
  if ($health.Ok) {
    Write-Host "Backend is already healthy on port $GamePort."
    return
  }

  $pids = @(Get-ListenPids -Port $GamePort)
  if ($pids.Count -gt 0) {
    Write-Warning "Port $GamePort is listening, but /health failed. Run restart or stop first. PID(s): $($pids -join ', ')"
    return
  }

  if (-not (Test-Path -LiteralPath $PnpmCmd)) {
    throw "pnpm.cmd not found at $PnpmCmd."
  }

  $stdout = Join-Path $LogDir "backend.out.log"
  $stderr = Join-Path $LogDir "backend.err.log"
  Write-Host "Starting backend. Logs: $stdout ; $stderr"
  Start-Process -FilePath $PnpmCmd `
    -ArgumentList @("--filter", "game-server", "dev") `
    -WorkingDirectory $Repo `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru | Out-Host

  if (Wait-Http -Url "http://127.0.0.1:$GamePort/health" -TimeoutSec 120) {
    Write-Host "Backend health check passed."
  } else {
    Write-Warning "Backend health check did not pass within 120 seconds. Check logs in $LogDir."
  }
}

function Start-Frontend {
  param([string]$LogDir)

  $homeCheck = Test-Http -Url "http://127.0.0.1:$WebPort/"
  if ($homeCheck.Ok) {
    Write-Host "Frontend is already serving on port $WebPort."
    return
  }

  $pids = @(Get-ListenPids -Port $WebPort)
  if ($pids.Count -gt 0) {
    Write-Warning "Port $WebPort is listening, but the frontend root check failed. Run restart or stop first. PID(s): $($pids -join ', ')"
    return
  }

  $stdout = Join-Path $LogDir "frontend.out.log"
  $stderr = Join-Path $LogDir "frontend.err.log"

  if (Test-Path -LiteralPath $NextCmd) {
    Write-Host "Starting frontend with next.cmd. Logs: $stdout ; $stderr"
    Start-Process -FilePath $NextCmd `
      -ArgumentList @("dev", "-H", "0.0.0.0") `
      -WorkingDirectory $WebDir `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -WindowStyle Hidden `
      -PassThru | Out-Host
  } else {
    if (-not (Test-Path -LiteralPath $PnpmCmd)) {
      throw "Neither next.cmd nor pnpm.cmd was found."
    }
    Write-Host "next.cmd not found; starting frontend through pnpm exec. Logs: $stdout ; $stderr"
    Start-Process -FilePath $PnpmCmd `
      -ArgumentList @("--dir", $WebDir, "exec", "next", "dev", "-H", "0.0.0.0") `
      -WorkingDirectory $Repo `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -WindowStyle Hidden `
      -PassThru | Out-Host
  }

  if (Wait-Http -Url "http://127.0.0.1:$WebPort/" -TimeoutSec 90) {
    Write-Host "Frontend root check passed."
  } else {
    Write-Warning "Frontend root check did not pass within 90 seconds. Check logs in $LogDir."
  }
}

function Stop-Servers {
  $ports = @($WebPort, $GamePort)
  $pids = @()
  foreach ($port in $ports) {
    $pids += @(Get-ListenPids -Port $port)
  }
  $pids = @($pids | Sort-Object -Unique)

  if ($pids.Count -eq 0) {
    Write-Host "No listening processes found on ports $WebPort or $GamePort."
    return
  }

  foreach ($pid in $pids) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Stopping PID $pid ($($proc.ProcessName))"
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  }

  Start-Sleep -Seconds 2
}

function Stop-TailscaleIfRequested {
  if (-not $TailscaleDown) {
    return
  }

  if (-not (Test-Path -LiteralPath $TailscaleExe)) {
    Write-Warning "Tailscale executable not found at $TailscaleExe."
    return
  }

  Write-Host "Taking Tailscale down..."
  & $TailscaleExe down | Out-Host
}

function Stop-PostgresIfRequested {
  if (-not $StopPostgres) {
    return
  }

  if (-not (Test-DockerReady)) {
    Write-Warning "Docker is not ready; cannot stop $PostgresContainer."
    return
  }

  $docker = Get-ToolPath -CommandName "docker" -PreferredPath $null
  Write-Host "Stopping $PostgresContainer..."
  & $docker stop $PostgresContainer | Out-Host
}

function Show-Status {
  Write-Section "Runtime"
  Write-Host "Repo: $Repo"
  Write-Host "Expected Tailscale IPv4: $TailscaleIp"
  Write-Host "Log root: $LogRoot"

  Write-Section "Tailscale"
  if (Test-Path -LiteralPath $TailscaleExe) {
    $actualIp = Get-TailscaleIp
    if ($actualIp) {
      Write-Host "IPv4: $actualIp"
    } else {
      Write-Host "No Tailscale IPv4 reported."
    }
  } else {
    Write-Host "Not installed at $TailscaleExe."
  }

  Write-Section "Docker"
  if (Test-DockerReady) {
    Write-Host "Docker: ready"
    $docker = Get-ToolPath -CommandName "docker" -PreferredPath $null
    $state = @(& $docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-health{{end}}' $PostgresContainer 2>$null)
    if ($LASTEXITCODE -eq 0) {
      Write-Host "${PostgresContainer}: $($state[0])"
    } else {
      Write-Host "${PostgresContainer}: not found"
    }
  } else {
    Write-Host "Docker: not ready"
  }

  Write-Section "Ports"
  foreach ($port in @($WebPort, $GamePort, $PostgresPort)) {
    $pids = @(Get-ListenPids -Port $port)
    if ($pids.Count -gt 0) {
      Write-Host "Port ${port}: listening PID(s) $($pids -join ', ')"
    } else {
      Write-Host "Port ${port}: not listening"
    }
  }

  Write-Section "HTTP"
  $urls = @(
    "http://127.0.0.1:$WebPort/",
    "http://127.0.0.1:$GamePort/health",
    "http://127.0.0.1:$GamePort/racing/tables",
    "http://127.0.0.1:$GamePort/blackjack/tables",
    "http://${TailscaleIp}:$WebPort/",
    "http://${TailscaleIp}:$GamePort/health",
    "http://${TailscaleIp}:$GamePort/racing/tables",
    "http://${TailscaleIp}:$GamePort/blackjack/tables"
  )

  foreach ($url in $urls) {
    $result = Test-Http -Url $url -TimeoutSec 5
    if ($result.Ok) {
      Write-Host "$url -> $($result.Status)"
    } else {
      $suffix = if ($result.Status) { "HTTP $($result.Status)" } else { $result.Error }
      Write-Host "$url -> FAIL ($suffix)"
    }
  }
}

switch ($Action) {
  "status" {
    Show-Status
  }
  "start" {
    $logDir = New-RunLogDir
    Start-TailscaleIfNeeded
    Start-PostgresIfNeeded
    Start-Backend -LogDir $logDir
    Start-Frontend -LogDir $logDir
    Show-Status
  }
  "stop" {
    Stop-Servers
    Stop-TailscaleIfRequested
    Stop-PostgresIfRequested
    Show-Status
  }
  "restart" {
    Stop-Servers
    $logDir = New-RunLogDir
    Start-TailscaleIfNeeded
    Start-PostgresIfNeeded
    Start-Backend -LogDir $logDir
    Start-Frontend -LogDir $logDir
    Show-Status
  }
}
