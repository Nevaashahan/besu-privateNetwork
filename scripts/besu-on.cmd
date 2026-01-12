@echo off
setlocal

set COMPOSE_FILE=docker-compose.secure.yml
set RPC_WRITE_URL=http://localhost:18545/
set RPC_READ_URL=http://localhost:18547/
if "%RPC_SHARED_SECRET%"=="" set RPC_SHARED_SECRET=change-me-strong-secret

docker-compose -f %COMPOSE_FILE% up -d
if errorlevel 1 (
  echo Failed to start compose stack.
  exit /b 1
)

powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$payload='{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}';" ^
  "$headers=@{'X-Shared-Secret'='%RPC_SHARED_SECRET%'};" ^
  "$urls=@('%RPC_WRITE_URL%','%RPC_READ_URL%');" ^
  "foreach($u in $urls){" ^
  "  $ok=$false;" ^
  "  for($i=0;$i -lt 60 -and -not $ok;$i++){" ^
  "    try{Invoke-RestMethod -Uri $u -Method Post -ContentType 'application/json' -Headers $headers -Body $payload | Out-Null; $ok=$true}" ^
  "    catch{Start-Sleep -Seconds 2}" ^
  "  }" ^
  "  if(-not $ok){Write-Error \"Gateway not ready: $u\"; exit 1}" ^
  "}"

echo Secure Besu stack is up.
endlocal
