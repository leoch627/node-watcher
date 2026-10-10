// Runs miaospeed matrices for runtime nodes on a backend and maps the results back to node ids.
const YAML = require('js-yaml');
const backends = require('./backends');

// miaospeed reports each result under the proxy's own `name` (not the request's node name) and in
// completion order, so the proxy is renamed to the node id: unique and safe to map back.
function toTaskNode(node) {
  const proxy = { ...node.proxy, name: node.id };
  return { name: node.id, payload: YAML.dump(proxy, { noRefs: true, lineWidth: -1 }) };
}

// onResult(nodeId, result) is called as results stream in; resolves { version, results: Map }.
async function runForNodes(backendId, nodes, { matrices, configs, scripts, onResult, signal, timeoutMs, manager = backends } = {}) {
  const known = new Set(nodes.map(node => node.id));
  const results = new Map();
  const outcome = await manager.runTask(backendId, {
    matrices, configs, scripts, nodes: nodes.filter(node => node.proxy).map(toTaskNode)
  }, {
    signal, timeoutMs,
    onProgress: ({ result }) => {
      if (!result || !known.has(result.name) || results.has(result.name)) return;
      results.set(result.name, result);
      onResult?.(result.name, result);
    }
  });
  // The final message repeats every result; fill in anything a dropped progress frame missed.
  for (const result of outcome.results) {
    if (!known.has(result.name) || results.has(result.name)) continue;
    results.set(result.name, result);
    onResult?.(result.name, result);
  }
  return { version: outcome.version, results };
}

module.exports = { toTaskNode, runForNodes };
