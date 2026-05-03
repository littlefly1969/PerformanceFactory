$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root ".local-logs"
$PgData = Join-Path $env:USERPROFILE "scoop\persist\postgresql\data"
$PostgresExe = Join-Path $env:USERPROFILE "scoop\apps\postgresql\current\bin\postgres.exe"
$PgPid = Join-Path $PgData "postmaster.pid"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-Port {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $result.AsyncWaitHandle.WaitOne(350, $false)
    if ($connected) {
      $client.EndConnect($result)
    }
    return $connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-Port {
  param(
    [int]$Port,
    [int]$Seconds = 20
  )

  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Port -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Start-NodeApp {
  param(
    [string]$Name,
    [int]$Port,
    [string]$Command,
    [string]$LogName
  )

  if (Test-Port -Port $Port) {
    Write-Host "$Name gia attivo su 127.0.0.1:$Port"
    return
  }

  $escapedRoot = $Root.Replace("'", "''")
  $shellCommand = "Set-Location -LiteralPath '$escapedRoot'; $Command"
  $outLog = Join-Path $LogDir "$LogName.log"
  $errLog = Join-Path $LogDir "$LogName.err.log"

  Start-Process `
    -FilePath "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", $shellCommand) `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden

  if (Wait-Port -Port $Port -Seconds 30) {
    Write-Host "$Name avviato su 127.0.0.1:$Port"
  } else {
    Write-Host "$Name non risponde ancora su 127.0.0.1:$Port. Controlla $errLog"
  }
}

Write-Host "Avvio Performance Factory locale..."

if (Test-Port -Port 5432) {
  Write-Host "PostgreSQL gia attivo su 127.0.0.1:5432"
} else {
  if ((Test-Path $PgPid) -and -not (Get-Process postgres -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $PgPid -Force
  }

  Start-Process `
    -FilePath $PostgresExe `
    -ArgumentList @("-D", $PgData) `
    -RedirectStandardOutput (Join-Path $LogDir "postgres.log") `
    -RedirectStandardError (Join-Path $LogDir "postgres.err.log") `
    -WindowStyle Hidden

  if (Wait-Port -Port 5432 -Seconds 20) {
    Write-Host "PostgreSQL avviato su 127.0.0.1:5432"
  } else {
    Write-Host "PostgreSQL non risponde ancora su 127.0.0.1:5432"
  }
}

Start-NodeApp -Name "API" -Port 4000 -Command "corepack pnpm --filter api start:dev" -LogName "api"
Start-NodeApp -Name "Web" -Port 3000 -Command "corepack pnpm --filter web dev" -LogName "web"

Write-Host ""
Write-Host "Apri il sito qui:"
Write-Host "http://127.0.0.1:3000"
Write-Host ""
Write-Host "API:"
Write-Host "http://127.0.0.1:4000/api"
