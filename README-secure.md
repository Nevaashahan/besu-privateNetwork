# Secure Besu RPC Gateways (QBFT)

This stack exposes two RPC gateways:
- Write gateway (port 18545) forwards all requests to node1 for transactions.
- Read gateway (port 18547) load-balances reads across node1 and node2.

Because QBFT provides finality, any synced node returns the same CID for `getTranscript`.

## Why two gateways
- Writes must go to a primary node to simplify nonce handling and auditing.
- Reads can safely hit any synced node for scaling and resilience.

## Security model
- RPC is enabled only on node1 and node2.
- Nodes are on an internal Docker network; no node RPC ports are exposed to the host.
- Gateways enforce:
  - IP allowlisting (set in `.env`)
  - Shared secret header (`X-Shared-Secret`)
  - Rate limiting

## Environment variables
Set these in `.env`:
- `RPC_SHARED_SECRET`
- `RPC_ALLOWLIST_1`, `RPC_ALLOWLIST_2`, `RPC_ALLOWLIST_3`, `RPC_ALLOWLIST_4`
- `RPC_RATE` (example: `5r/s`)
- `RPC_CORS_ORIGINS` (frontend origin if needed)

Backend endpoints (direct gateways):
- `CHAIN_RPC_WRITE_URL = http://<host-ip>:18545`
- `CHAIN_RPC_READ_URL  = http://<host-ip>:18547`

## Start/stop
Use the secure stack:
```
scripts\besu-on.cmd
scripts\besu-off.cmd
```

## On-demand start/stop (idle 30s)
Run the on-demand proxy to auto-start the network when a request arrives
and stop it after 30s of idle:
```
scripts\besu-on-demand.cmd
```

The proxy listens on:
- write: `http://localhost:8545`
- read:  `http://localhost:8547`

It forwards to the secure gateways on host ports 18545/18547.
The proxy injects `X-Shared-Secret` if the client does not set it.

## Example curl (write/read)
Replace `<secret>` with `RPC_SHARED_SECRET`.

Write gateway (block number):
```
curl -s -X POST http://localhost:18545 ^
  -H "Content-Type: application/json" ^
  -H "X-Shared-Secret: <secret>" ^
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}"
```

Read gateway (block number):
```
curl -s -X POST http://localhost:18547 ^
  -H "Content-Type: application/json" ^
  -H "X-Shared-Secret: <secret>" ^
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}"
```

Read `getTranscript` via gateway:
```
curl -s -X POST http://localhost:18547 ^
  -H "Content-Type: application/json" ^
  -H "X-Shared-Secret: <secret>" ^
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"0xe3b69E8034ffB8C77811B0Ad3bd854f09BCfd405\",\"data\":\"0x...\"},\"latest\"],\"id\":1}"
```

## Notes
- The read gateway uses the Nginx `random` load-balancing directive. If your Nginx build does not support it, remove the `random;` line to fall back to round-robin.
- Keep gateway logs in `logs/` (see `gateway/gateway-*.log`).
