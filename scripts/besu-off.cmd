@echo off
setlocal

docker-compose -f docker-compose.secure.yml down
if errorlevel 1 (
  echo Failed to stop compose stack.
  exit /b 1
)

echo Secure Besu stack stopped.
endlocal
