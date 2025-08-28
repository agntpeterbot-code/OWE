const fs = require('fs');
const path = require('path');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const ACCOUNT = process.env.ACCOUNT;
if (!SHYFT_API_KEY || !ACCOUNT) {
  console.error('Missing env variables: SHYFT_API_KEY or ACCOUNT');
  process.exit(1);
}

const RPC_URL = `https://rpc.shyft.to?api_key=${SHYFT_API_KEY}`;
const LOG = path.join(__dirname, 'sol_transfers.log');
const PROCESSED = path.join(__dirname, 'processed_signatures.json');

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id:1, method, params })
  });
  return (await res.json()).result;
}

async function main() {
  let processed = [];
  if (fs.existsSync(PROCESSED)) {
    processed = JSON.parse(fs.readFileSync(PROCESSED, 'utf8'));
  }
  const processedSet = new Set(processed);

  const sigs = await rpcCall('getSignaturesForAddress', [ACCOUNT, { limit: 50 }]);
  for (const { signature } of (sigs||[]).reverse()) {
    if (processedSet.has(signature)) continue;
    const tx = await rpcCall('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    if (tx?.transaction?.message?.instructions) {
      for (const inst of tx.transaction.message.instructions) {
        if (inst.parsed?.type==='transfer' && inst.parsed.info) {
          const { source, destination, lamports } = inst.parsed.info;
          if (source===ACCOUNT || destination===ACCOUNT) {
            const amt = lamports/1e9;
            const type = destination===ACCOUNT ? 'Received' : 'Sent';
            const line = `${new Date((tx.blockTime||0)*1000).toISOString()} | ${type} | ${amt} SOL | from ${source} to ${destination} | sig=${signature}`;
            fs.appendFileSync(LOG, line + '\n');
            console.log(line);
          }
        }
      }
    }
    processedSet.add(signature);
  }
  fs.writeFileSync(PROCESSED, JSON.stringify([...processedSet], null, 2));
}

main().catch(err=>{ console.error(err); process.exit(1); });
