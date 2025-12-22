const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

async function main() {
  const rpcUrl = process.env.CHAIN_RPC_URL || "http://localhost:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Use validator node1 key (already present) by default
  const privPath =
    process.env.DEPLOYER_KEY_PATH ||
    path.join(__dirname, "..", "networkFiles", "keys", "0x03c6d503a56ea77d8c236c6e83ab0fd5cedf561b", "key");
  const privateKey = (process.env.DEPLOYER_KEY || fs.readFileSync(privPath, "utf8")).trim();
  const wallet = new ethers.Wallet(privateKey, provider);

  const sourcePath = path.join(__dirname, "..", "contracts", "TranscriptRegistry.sol");
  const source = fs.readFileSync(sourcePath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "TranscriptRegistry.sol": {
        content: source,
      },
    },
    settings: {
      evmVersion: "berlin",
      optimizer: { enabled: false, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const fatal = output.errors.find((e) => e.severity === "error");
    output.errors.forEach((e) => console.log(e.formattedMessage));
    if (fatal) {
      throw new Error("Compilation failed");
    }
  }

  const contract = output.contracts["TranscriptRegistry.sol"]["TranscriptRegistry"];
  const abi = contract.abi;
  const bytecode = "0x" + contract.evm.bytecode.object;

  console.log("Deploying with account:", wallet.address);
  console.log("RPC:", rpcUrl);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployment = await factory.deploy({
    // legacy type-0 tx with explicit gas price to satisfy min gas price
    type: 0,
    gasPrice: 1_000_000_000n, // 1 gwei
    gasLimit: 1_000_000,
  });
  const tx = deployment.deploymentTransaction();
  console.log("Sent deployment tx:", tx.hash);

  await deployment.waitForDeployment();
  const addr = await deployment.getAddress();
  console.log("Contract deployed at:", addr);

  // Write ABI + address for reuse
  const artifactsDir = path.join(__dirname, "..", "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, "TranscriptRegistry.abi.json"), JSON.stringify(abi, null, 2));
  fs.writeFileSync(
    path.join(artifactsDir, "TranscriptRegistry.address.json"),
    JSON.stringify({ address: addr }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
