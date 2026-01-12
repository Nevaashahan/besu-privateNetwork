@echo off
setlocal

set RPC_SHARED_SECRET=change-me-strong-secret
set RPC_IDLE_SECONDS=30

node scripts\rpc-on-demand-proxy.js

endlocal
