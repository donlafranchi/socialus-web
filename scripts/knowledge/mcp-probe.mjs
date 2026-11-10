// F125 / T1018 (#1219) probe: the smallest lookup tool there is, over stdio,
// with no dependencies, to prove a tool configured in the repo's .mcp.json
// loads in a session. Not shipped; lives on the probe branch only.
import { createInterface } from 'node:readline'
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')
createInterface({ input: process.stdin }).on('line', (line) => {
  let m
  try { m = JSON.parse(line) } catch { return }
  if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'knowledge-probe', version: '0.0.1' } } })
  else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'probe_ping', description: 'Answers pong, to prove the lookup tool loaded.', inputSchema: { type: 'object', properties: {} } }] } })
  else if (m.method === 'tools/call') send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'pong from the repo-configured lookup tool' }] } })
  else if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, result: {} })
})
