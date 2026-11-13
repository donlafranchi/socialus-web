// F125 / T1018 (#1219) — the knowledge store's lookup tool: a remote MCP
// server at /api/knowledge/mcp, built on Vercel's MCP adapter.
//
// It writes nothing in the app's tables. Its only writes are to the
// `knowledge` schema, through the store's own functions, as the store's own
// login, over the connection the action layer keeps for it
// (src/actions/_lib/knowledge-db.ts).
//
// WHO GETS IN: a bearer key from the store's `agents` table, one per agent,
// each tied to a person and departments. No key, an unknown key or a revoked
// one gets 401. The key never becomes a database login: every call opens one
// transaction as `knowledge_store`, hands it the key, and lets the store's
// row-level security decide what that agent sees. The app's service key is
// never used here.
//
// NO MODEL RUNS HERE. Every verb is a lookup or a call to the store's
// functions; the calling agent writes its own answer from what comes back.
// Every verb is listed in src/lib/knowledge/tools.ts.

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { TOOLS, runTool } from '@/lib/knowledge/tools'
import { agentFor, withKey } from '@/actions/_lib/knowledge-db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const handler = createMcpHandler(
  (server) => {
    for (const tool of TOOLS) {
      server.tool(tool.name, tool.description, tool.input, async (args, extra) => {
        const key = extra.authInfo?.token ?? ''
        const out = await withKey(key, (db) => runTool(db, tool.name, args as Record<string, unknown>))
        return { content: [{ type: 'text' as const, text: out.text }], isError: out.isError ?? false }
      })
    }
  },
  { serverInfo: { name: 'socialus-knowledge', version: '1.0.0' } },
  { basePath: '/api/knowledge', disableSse: true, maxDuration: 30 },
)

async function verifyKey(_req: Request, bearer?: string) {
  if (!bearer) return undefined
  try {
    const who = await agentFor(bearer)
    if (!who) return undefined
    return { token: bearer, clientId: who.agent, scopes: who.operator ? ['operator'] : [], extra: { ...who } }
  } catch {
    // Not configured here, or the store is unreachable: nobody gets in.
    return undefined
  }
}

const authed = withMcpAuth(handler, verifyKey, { required: true })

export const GET = authed
export const POST = authed
export const DELETE = authed
