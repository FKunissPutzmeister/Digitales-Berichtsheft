'use strict';
/* MCP-Endpunkt (Streamable HTTP, stateless JSON-RPC 2.0) für lokale Clients
   (Claude Desktop/Code) im Intranet. Auth per persönlichem Bearer-API-Key
   ("Snipe-IT-Modell", siehe services/apiKeys). Kein OAuth, keine Sessions –
   der Server ist nur intern erreichbar.

   Unterstützte Methoden: initialize, notifications/initialized, tools/list,
   tools/call, ping. Antworten sind reines JSON (kein SSE nötig, da der Server
   keine eigenen Nachrichten sendet). */
const router = require('express').Router();
const { resolveApiKey, logMcpCall } = require('../services/apiKeys');
const { getUserByOid, buildReqUser } = require('../services/users');
const { TOOLS, ToolError } = require('./tools');

const PROTOCOL_DEFAULT = '2025-06-18';
const SERVER_INFO = { name: 'digitales-berichtsheft', version: '1.0.0' };

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

// Bearer-API-Key → effektiver App-Nutzer (gleiche RBAC wie die HTTP-Routen).
async function authFromRequest(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const resolved = await resolveApiKey(m[1].trim());
  if (!resolved) return null;
  const row = await getUserByOid(resolved.userOid);
  if (!row || !row.Aktiv) return null;
  return buildReqUser(row);
}

async function dispatch(user, msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_DEFAULT,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === (params && params.name));
      if (!tool) return rpcError(id, -32602, `Unbekanntes Tool: ${params && params.name}`);
      try {
        const out = await tool.run(user, (params && params.arguments) || {});
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        // Fachliche Fehler (ToolError) als tool-Ergebnis mit isError zurückgeben,
        // damit das LLM sie sieht; unerwartete Fehler als JSON-RPC-Fehler.
        if (e instanceof ToolError) {
          return rpcResult(id, { content: [{ type: 'text', text: e.message }], isError: true });
        }
        console.error('[mcp] tool', params && params.name, e);
        return rpcError(id, -32603, 'Interner Fehler im Tool.');
      }
    }
    default:
      return rpcError(id, -32601, `Methode nicht unterstützt: ${method}`);
  }
}

router.post('/', async (req, res) => {
  const user = await authFromRequest(req);
  if (!user) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json(rpcError(null, -32001, 'Ungültiger oder fehlender API-Schlüssel.'));
  }
  const body = req.body;
  const isBatch = Array.isArray(body);
  const msgs = isBatch ? body : [body];

  const responses = [];
  for (const msg of msgs) {
    if (!msg || msg.jsonrpc !== '2.0' || !msg.method) {
      responses.push(rpcError(msg && msg.id != null ? msg.id : null, -32600, 'Ungültige Anfrage.'));
      continue;
    }
    // Notifications (ohne id) erzeugen keine Antwort.
    if (msg.id === undefined || msg.id === null) {
      if (msg.method && msg.method.startsWith('notifications/')) continue;
    }
    logMcpCall({ userOid: user.oid, methode: msg.method, toolName: msg.params && msg.params.name });
    responses.push(await dispatch(user, msg));
  }

  const out = responses.filter(Boolean);
  if (!out.length) return res.status(202).end();     // nur Notifications
  return res.json(isBatch ? out : out[0]);
});

// GET/DELETE: dieser Server initiiert keine Server→Client-Streams und hält
// keine Sessions → kein SSE-Kanal nötig.
router.get('/', (req, res) => res.status(405).json({ error: 'Nur POST (Streamable HTTP, JSON).' }));

module.exports = router;
