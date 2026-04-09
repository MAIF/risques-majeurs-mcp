#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { createServer } from "./server.js";
import cors from "cors";
import rateLimit from "express-rate-limit";

const parseIntEnv = (value: string | undefined, fallback: number) => {
  const parsed = parseInt(value || "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const PORT = parseIntEnv(process.env.PORT, 3000);
const HOST = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
const RATE_LIMIT_WINDOW_MS = parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000);
const RATE_LIMIT_MAX = parseIntEnv(process.env.RATE_LIMIT_MAX, 100);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const app = createMcpExpressApp({host: HOST});

app.use(
  cors({ origin: CORS_ORIGIN }),
);

app.use(rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
}));

// --- POST /mcp : requêtes JSON-RPC ---
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
        transport.close();
        server.close();
    });
  } catch (error: unknown) {
    console.error("Erreur POST /mcp :", error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Erreur interne" },
        id: null,
      });
    }
  }
});

// --- GET /mcp
app.get("/mcp", async (req: Request, res: Response) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
        transport.close();
        server.close();
    });
  } catch (error) {
    console.error("Erreur GET /mcp :", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Erreur interne" },
        id: null,
      });
    }
  }
});

// --- DELETE /mcp
app.delete("/mcp", async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.'
      },
      id: null
    })
  );
});

// Lancement du serveur HTTP
app.listen(PORT, () => {
  console.log(`Serveur MCP risques-majeurs (Streamable HTTP) sur http://localhost:${PORT}/mcp`);
});

// Arrêt propre : fermer tous les transports
process.on("SIGINT", async () => {
  console.log("\nArrêt en cours...");
  process.exit(0);
});
