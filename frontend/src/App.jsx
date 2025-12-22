import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

const defaultRpc = (() => {
  const envRpc = import.meta?.env?.VITE_RPC_URL;
  if (envRpc) return envRpc;
  if (import.meta?.env?.DEV) return "http://localhost:8545";
  if (typeof window === "undefined") return "http://localhost:8545";
  return `${window.location.origin}/rpc`;
})();

export default function App() {
  const [rpcUrl, setRpcUrl] = useState(defaultRpc);
  const [connStatus, setConnStatus] = useState("Not connected");
  const [chainId, setChainId] = useState("-");
  const [block, setBlock] = useState("-");
  const [peersHex, setPeersHex] = useState("-");
  const [adminPeers, setAdminPeers] = useState([]);
  const [netListening, setNetListening] = useState("?");
  const [nodeInfo, setNodeInfo] = useState(null);
  const [log, setLog] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [rpcMethod, setRpcMethod] = useState("eth_blockNumber");
  const [rpcParams, setRpcParams] = useState("[]");
  const [rpcResult, setRpcResult] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastError, setLastError] = useState("");
  const [lastInfoLogAt, setLastInfoLogAt] = useState(0);

  const provider = useMemo(() => {
    try {
      return new ethers.JsonRpcProvider(rpcUrl);
    } catch {
      return null;
    }
  }, [rpcUrl]);

  const appendLog = (msg) =>
    setLog((prev) => [...prev.slice(-200), `[${new Date().toISOString()}] ${msg}`]);

  const fetchInfo = async () => {
    if (!provider) return;
    try {
      const net = await provider.getNetwork();
      setChainId(net.chainId.toString());
      const bn = await provider.getBlockNumber();
      setBlock(bn.toString());
      const peerCountHex = await provider.send("net_peerCount", []);
      setPeersHex(peerCountHex);
      const listening = await provider.send("net_listening", []);
      setNetListening(listening ? "true" : "false");
      try {
        const info = await provider.send("admin_nodeInfo", []);
        setNodeInfo(info);
      } catch {
        setNodeInfo(null);
      }
      try {
        const peers = await provider.send("admin_peers", []);
        setAdminPeers(Array.isArray(peers) ? peers : []);
      } catch {
        setAdminPeers([]);
      }
      setConnStatus("Connected");
      setLastError("");
      setLastUpdated(new Date());
      const now = Date.now();
      if (now - lastInfoLogAt > 60_000) {
        appendLog(`Poll ok: block ${bn}, peers ${peerCountHex}`);
        setLastInfoLogAt(now);
      }
    } catch (err) {
      setConnStatus("Failed");
      setLastError(err.message);
      appendLog(`Poll error: ${err.message}`);
    }
  };

  const fetchRecentBlocks = async () => {
    if (!provider) return;
    try {
      const latest = await provider.getBlockNumber();
      if (latest == null || Number.isNaN(latest)) return;
      const targets = [];
      for (let i = 0; i < 8; i++) {
        const n = latest - i;
        if (n >= 0) targets.push(n);
      }
      const fetched = await Promise.all(
        targets.map((n) => provider.getBlock(n, false).catch(() => null))
      );
      const cleaned = fetched
        .filter(Boolean)
        .map((b) => ({
          number: b.number,
          hash: b.hash,
          gasUsed: b.gasUsed?.toString?.() ?? "",
          gasLimit: b.gasLimit?.toString?.() ?? "",
          txCount: b.transactions?.length ?? 0,
          timestamp: b.timestamp,
        }));
      setBlocks(Array.isArray(cleaned) ? cleaned : []);
    } catch (err) {
      appendLog(`Block fetch error: ${err.message}`);
    }
  };

  useEffect(() => {
    if (!provider) return;
    setConnStatus("Connecting...");
    fetchInfo();
    fetchRecentBlocks();
    const infoId = setInterval(fetchInfo, 2500);
    const blockId = setInterval(fetchRecentBlocks, 5000);
    return () => {
      clearInterval(infoId);
      clearInterval(blockId);
    };
  }, [provider]);

  const peerCount = useMemo(() => {
    if (!peersHex || peersHex === "-") return "-";
    return parseInt(peersHex, 16).toString();
  }, [peersHex]);

  const sendRpc = async () => {
    if (!provider) return;
    try {
      const parsed = rpcParams.trim() ? JSON.parse(rpcParams) : [];
      const res = await provider.send(rpcMethod, parsed);
      setRpcResult(JSON.stringify(res, null, 2));
      appendLog(`RPC ${rpcMethod} ok`);
    } catch (err) {
      setRpcResult(`Error: ${err.message}`);
      appendLog(`RPC error: ${err.message}`);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "nodeinfo", label: "Node Info" },
    { id: "peers", label: "Peers" },
    { id: "blocks", label: "Blocks" },
    { id: "rpc", label: "RPC Console" },
    { id: "logs", label: "Logs" },
  ];

  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const safePeers = Array.isArray(adminPeers) ? adminPeers : [];
  const safeLog = Array.isArray(log) ? log : [];

  return (
    <div className="page">
      <h1>Besu Private Chain Control</h1>
      <p>Monitor nodes, peers, blocks, and run RPC calls.</p>

      <div className="card">
        <h3>Connection</h3>
        <label>RPC URL</label>
        <input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
        <p className="muted" style={{ marginTop: 8 }}>
          Status: {connStatus}
          {lastUpdated && ` | Last updated: ${lastUpdated.toLocaleTimeString()}`}
        </p>
        {lastError && <p className="muted" style={{ color: "#ff7b7b" }}>Error: {lastError}</p>}
        <div className="status-grid">
          <div className="stat"><strong>Chain ID</strong><div className="mono">{chainId}</div></div>
          <div className="stat"><strong>Latest Block</strong><div className="mono">{block}</div></div>
          <div className="stat"><strong>Peer Count</strong><div className="mono">{peerCount}</div></div>
          <div className="stat"><strong>net_listening</strong><div className="mono">{netListening}</div></div>
        </div>
      </div>

      <div className="tabs">
        {safeTabs?.map((t) => (
          <div
            key={t.id}
            className={`tab ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid">
          <div className="card">
            <h3>Quick Stats</h3>
            <p className="muted">Peers: {peerCount} | Latest Block: {block} | ChainId: {chainId}</p>
            <p className="muted">RPC: {rpcUrl}</p>
          </div>
          <div className="card">
            <h3>Recent Blocks</h3>
            <div className="list">
              {safeBlocks.length === 0 && <div className="muted">No blocks yet</div>}
              {safeBlocks?.map((b) => (
                <div key={b.hash} style={{ marginBottom: 10 }}>
                  <div className="mono">#{b.number} | txs: {b.txCount}</div>
                  <div className="muted">Gas: {b.gasUsed}/{b.gasLimit}</div>
                  <div className="muted">Time: {new Date((b.timestamp || 0) * 1000).toISOString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "nodeinfo" && (
        <div className="card">
          <h3>admin_nodeInfo</h3>
          {nodeInfo ? (
            <div className="mono" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              ID: {nodeInfo.id}
              {"\n"}Name: {nodeInfo.name}
              {"\n"}Enode: {nodeInfo.enode}
              {"\n"}IP/Ports: {nodeInfo.ip} / {nodeInfo.ports?.listener}
              {"\n"}Protocols: {JSON.stringify(nodeInfo.protocols, null, 2)}
            </div>
          ) : (
            <p className="muted">admin_nodeInfo not available (ensure ADMIN API enabled).</p>
          )}
        </div>
      )}

      {activeTab === "peers" && (
        <div className="card">
          <h3>Peers (admin_peers)</h3>
          <div className="list">
            {safePeers.length === 0 && <div className="muted">No peers or admin API blocked.</div>}
            {safePeers?.map((p, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div className="mono">{p.id}</div>
                <div className="muted">{p.name}</div>
                <div className="muted">{p.network?.remoteAddress}</div>
                <div className="muted">Caps: {Array.isArray(p.caps) ? p.caps.join(", ") : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "blocks" && (
        <div className="card">
          <h3>Recent Blocks</h3>
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Txs</th><th>Gas Used</th><th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {safeBlocks?.map((b) => (
                <tr key={b.hash}>
                  <td className="mono">{b.number}</td>
                  <td>{b.txCount}</td>
                  <td className="mono">{b.gasUsed}</td>
                  <td className="mono">{new Date((b.timestamp || 0) * 1000).toISOString()}</td>
                </tr>
              ))}
              {safeBlocks.length === 0 && <tr><td colSpan={4} className="muted">No blocks</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "rpc" && (
        <div className="card">
          <h3>RPC Console</h3>
          <label>Method</label>
          <input value={rpcMethod} onChange={(e) => setRpcMethod(e.target.value)} />
          <label style={{ marginTop: 8 }}>Params (JSON)</label>
          <textarea value={rpcParams} onChange={(e) => setRpcParams(e.target.value)} />
          <button style={{ marginTop: 8 }} onClick={sendRpc}>Send</button>
          <pre className="mono" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{rpcResult}</pre>
        </div>
      )}

      {activeTab === "logs" && (
        <div className="card">
          <h3>Logs</h3>
          <div className="list" style={{ minHeight: 150 }}>
            {safeLog?.slice(-120).map((l, i) => (
              <div key={i} className="mono" style={{ fontSize: 12 }}>{l}</div>
            ))}
          </div>
          <button style={{ marginTop: 8, background: "#223357", color: "#e9efff" }} onClick={() => setLog([])}>Clear</button>
          <p className="muted" style={{ marginTop: 6 }}>Ensure ADMIN API is enabled for node/peer details.</p>
        </div>
      )}
    </div>
  );
}
