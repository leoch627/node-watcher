const mihomoService = require('./mihomo');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One connectivity probe through Mihomo, retried `retries` times on failure. Returns the raw
// result: { online, latency, error } or { skipped: true } when the probe could not be performed.
async function probeNode(node, timeout, { url, retries = 0 } = {}) {
  let result;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    result = await mihomoService.testNode(node.proxyName || node.name, timeout, url);
    if (result.skipped || result.online) break;
    if (attempt < retries) await sleep(1000);
  }
  return result;
}

// Probes every node with bounded concurrency. Stateless: used by the master's local probe and by
// remote probes alike. Results keep the input order.
async function probeAll(nodes, { timeout = 10000, concurrency = 8, retries = 0, url } = {}, onProgress) {
  const results = new Array(nodes.length);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < nodes.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await probeNode(nodes[index], timeout, { url, retries });
      } catch (error) {
        results[index] = { online: false, latency: null, error: error.message };
      }
      completed += 1;
      if (onProgress) onProgress(completed, nodes.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, nodes.length)) }, worker));
  return results;
}

module.exports = { probeNode, probeAll };
