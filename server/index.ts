#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { createServer } from "./server.js";
import cors from "cors";


const PORT = Number.isNaN(parseInt(process.env.PORT || "3000", 10)) ? 3000 : parseInt(process.env.PORT || "3000", 10);
const app = createMcpExpressApp({host: '0.0.0.0'});

app.use(
  cors({ origin: "*" }),
);

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
  } catch (error) {
    console.error("Erreur POST /mcp :", error);
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
