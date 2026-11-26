#!/usr/bin/env node
import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { Request, Response } from "express";
import { createServer } from "./server.js";
import cors from "cors";
import rateLimit from "express-rate-limit";

const parseIntEnv = (value: string | undefined, fallback: number) => {
  const parsed = parseInt(value || "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseListEnv = (value: string | undefined) => {
  const list = (value || "").split(",").map(v => v.trim()).filter(v => v !== "");
  return list.length > 0 ? list : undefined;
};

const args = process.argv.slice(2);
const STDIO_MODE = args.includes('--stdio')
  || args.includes('--transport=stdio')
  || (args.includes('--transport') && args[args.indexOf('--transport') + 1] === 'stdio')
  || process.env.MCP_TRANSPORT === 'stdio';

const logToken = (log: (...a: any[]) => void) => {
  if (process.env.API_V2_TOKEN) {
    log(`Jeton configuré : le serveur MCP interrogera les endpoints v2 de l'API Géorisques lorsqu'ils sont disponibles`);
  }
};

function runStdio() {
  // In stdio mode, stdout is reserved for the JSON-RPC protocol.
  // Redirect every `console.log` (including those inside the MCP server)
  // to stderr so logs do not corrupt the protocol stream.
  console.log = (...a: any[]) => console.error(...a);

  // serveStdio handles both protocol eras: 2026-07-28 (no initialize handshake)
  // and 2025-era clients that open the connection with `initialize`.
  const handle = serveStdio(() => createServer(), {
    onerror: (error) => console.error("Erreur MCP (stdio) :", error.message),
  });
  console.error('Serveur MCP risques-majeurs (stdio) prêt');
  logToken(console.error);

  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function runHttp() {
  const PORT = parseIntEnv(process.env.PORT, 3000);
  const HOST = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
  const RATE_LIMIT_WINDOW_MS = parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000);
  const RATE_LIMIT_MAX = parseIntEnv(process.env.RATE_LIMIT_MAX, 100);
  const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

  // Host / Origin validation (DNS rebinding protection). Automatic when listening
  // on localhost; opt-in through ALLOWED_HOSTS / ALLOWED_ORIGINS otherwise.
  const app = createMcpExpressApp({
    host: HOST,
    allowedHosts: parseListEnv(process.env.ALLOWED_HOSTS),
    allowedOrigins: parseListEnv(process.env.ALLOWED_ORIGINS),
  });

  // Express 'trust proxy' setting — required when running behind a reverse
  // proxy (nginx, ngrok, Cloudflare…) so express-rate-limit can identify the
  // real client IP from X-Forwarded-For instead of always seeing the proxy.
  // Accepted values: "true", "false", a number of hops (e.g. "1"), or a
  // specific value like "loopback" / an IP / a CIDR.
  const trustProxyRaw = process.env.TRUST_PROXY;
  if (trustProxyRaw !== undefined) {
    const asInt = parseInt(trustProxyRaw, 10);
    let trustProxy: boolean | number | string;
    if (trustProxyRaw === 'true') trustProxy = true;
    else if (trustProxyRaw === 'false') trustProxy = false;
    else if (!Number.isNaN(asInt) && String(asInt) === trustProxyRaw) trustProxy = asInt;
    else trustProxy = trustProxyRaw;
    app.set('trust proxy', trustProxy);
  }

  app.use(
    cors({ origin: CORS_ORIGIN }),
  );

  app.use(rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Streamable HTTP, stateless. createMcpHandler serves:
  // - 2026-07-28 clients (no session, no initialize handshake, protocol version
  //   and client info carried in each request's `_meta`);
  // - 2025-era clients through a stateless fallback (a fresh server per request,
  //   no Mcp-Session-Id). GET and DELETE are answered with 405.
  // All exposed tools are read-only and idempotent, so no state is kept between
  // requests.
  const mcpHandler = createMcpHandler(() => createServer(), {
    onerror: (error) => console.error("Erreur MCP :", error.message),
  });
  const nodeHandler = toNodeHandler(mcpHandler);

  app.all("/mcp", async (req: Request, res: Response) => {
    try {
      await nodeHandler(req, res, req.body);
    } catch (error: unknown) {
      console.error(`Erreur ${req.method} /mcp :`, error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Erreur interne" },
          id: null,
        });
      }
    }
  });

  // Lancement du serveur HTTP
  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Serveur MCP risques-majeurs (Streamable HTTP) sur http://localhost:${PORT}/mcp`);
    // API Géorisques v2 si le jeton est configuré
    logToken(console.log);
  });

  // Arrêt propre
  const shutdown = async () => {
    console.log("\nArrêt en cours...");
    await mcpHandler.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (STDIO_MODE) {
  runStdio();
} else {
  runHttp();
}
