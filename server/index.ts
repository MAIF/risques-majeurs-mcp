import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { createServer } from "./server.js";


const PORT = parseInt(process.env.PORT || "3000", 10);
const app = createMcpExpressApp();

// Map des transports actifs, indexés par session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// --- POST /mcp : requêtes JSON-RPC ---
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    // Cas 1 : session existante → réutiliser le transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // Cas 2 : nouvelle session (requête "initialize")
    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
          console.log(`Session créée : ${id}`);
        },
      });

      transport.onclose = () => {
        const id = transport.sessionId;
        if (id && transports[id]) {
          delete transports[id];
          console.log(`Session fermée : ${id}`);
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Cas 3 : requête invalide
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session ID invalide ou manquant" },
      id: null,
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

// --- DELETE /mcp : fermeture de session ---
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Session ID invalide ou manquant");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// Lancement du serveur HTTP
app.listen(PORT, () => {
  console.log(`Serveur MCP risques-majeurs (Streamable HTTP) sur http://localhost:${PORT}/mcp`);
});

// Arrêt propre : fermer tous les transports
process.on("SIGINT", async () => {
  console.log("\nArrêt en cours...");
  for (const [id, transport] of Object.entries(transports)) {
    await transport.close();
    delete transports[id];
  }
  process.exit(0);
});
