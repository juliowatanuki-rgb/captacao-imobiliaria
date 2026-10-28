$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Carrega somente as variaveis necessarias do .env para o processo filho.
# Nunca imprime os valores (DATABASE_URL/JWT_SECRET sao sensiveis).
$envPath = Join-Path $repoRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Arquivo .env nao encontrado em $repoRoot"
}

Get-Content -LiteralPath $envPath | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -and $matches[1] -in @("DATABASE_URL")) {
    Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
  }
}

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path -LiteralPath $chromePath)) {
  throw "Google Chrome nao encontrado em $chromePath"
}
$env:CHROME_EXECUTABLE_PATH = $chromePath

$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir ("crawl-local-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

& npm run crawl:all 2>&1 | Tee-Object -FilePath $logPath
$exitCode = $LASTEXITCODE
Write-Host "Log salvo em: $logPath"
exit $exitCode
