const http = require("http");
const { exec } = require("child_process");
const path = require("path");

const LISTEN_HOST = "127.0.0.1";
const WRITE_LISTEN_PORT = Number(process.env.RPC_WRITE_PORT || 8545);
const READ_LISTEN_PORT = Number(process.env.RPC_READ_PORT || 8547);
const WRITE_TARGET_PORT = Number(process.env.RPC_WRITE_TARGET_PORT || 18545);
const READ_TARGET_PORT = Number(process.env.RPC_READ_TARGET_PORT || 18547);
const SHARED_SECRET = process.env.RPC_SHARED_SECRET || "";
const IDLE_SECONDS = Number(process.env.RPC_IDLE_SECONDS || 30);
const STARTUP_TIMEOUT_MS = Number(process.env.RPC_STARTUP_TIMEOUT_MS || 120000);
const PROBE_INTERVAL_MS = Number(process.env.RPC_PROBE_INTERVAL_MS || 2000);

const composePath = path.join(__dirname, "..", "docker-compose.secure.yml");
let startupPromise = null;
let lastRequestAt = 0;
let networkUp = false;

function runCompose(cmd) {
  return new Promise((resolve, reject) => {
    exec(
      `docker-compose -f "${composePath}" ${cmd}`,
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function rpcProbe(targetPort) {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: targetPort,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(SHARED_SECRET ? { "X-Shared-Secret": SHARED_SECRET } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`RPC probe failed with status ${res.statusCode}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function ensureNetworkUp() {
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    try {
      await rpcProbe(WRITE_TARGET_PORT);
      networkUp = true;
      return;
    } catch {
      await runCompose("up -d");
    }

    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        await rpcProbe(WRITE_TARGET_PORT);
        networkUp = true;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS));
      }
    }
    throw new Error("RPC not ready before timeout");
  })();

  try {
    await startupPromise;
  } finally {
    startupPromise = null;
  }
}

async function maybeStopOnIdle() {
  if (!networkUp || IDLE_SECONDS <= 0) return;
  const idleFor = (Date.now() - lastRequestAt) / 1000;
  if (idleFor >= IDLE_SECONDS) {
    try {
      await runCompose("down");
    } catch {
      // ignore stop failures
    } finally {
      networkUp = false;
    }
  }
}

setInterval(maybeStopOnIdle, 2000).unref();

function createProxy(listenPort, targetPort) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      lastRequestAt = Date.now();

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        await ensureNetworkUp();
      } catch (err) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      const body = Buffer.concat(chunks);
      const forwardHeaders = {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
        "content-length": body.length,
      };
      if (SHARED_SECRET && !("x-shared-secret" in forwardHeaders)) {
        forwardHeaders["x-shared-secret"] = SHARED_SECRET;
      }

      const forward = http.request(
        {
          host: "127.0.0.1",
          port: targetPort,
          path: req.url || "/",
          method: req.method || "POST",
          headers: forwardHeaders,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );
      forward.on("error", (err) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
      forward.write(body);
      forward.end();
    });
  });

  server.listen(listenPort, LISTEN_HOST, () => {
    console.log(
      `On-demand RPC proxy listening on http://${LISTEN_HOST}:${listenPort} -> ${targetPort}`
    );
  });
}

createProxy(WRITE_LISTEN_PORT, WRITE_TARGET_PORT);
createProxy(READ_LISTEN_PORT, READ_TARGET_PORT);
