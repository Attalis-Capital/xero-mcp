#!/usr/bin/env node
/**
 * HTTP/SSE transport entry point for Xero MCP Server.
 * Adds StreamableHTTPServerTransport for Railway deployment.
 * Preserves the original stdio path (src/index.ts) untouched.
 */

import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { XeroMcpServer } from "./server/xero-mcp-server.js";
import { ToolFactory } from "./tools/tool-factory.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

/**
 * Bearer token auth guard.
 * Protected routes: /mcp and / (all MCP tool access).
 * Open route: /health (Railway probe).
 * Token sourced from MCP_AUTH_TOKEN env var.
 * Returns false and writes 401/503 if auth fails.
 */
function checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const token = process.env.MCP_AUTH_TOKEN;
  if (!token) {
    // No token configured — deny all to prevent accidental open access
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Service not configured: MCP_AUTH_TOKEN missing" }));
    return false;
  }
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader !== `Bearer ${token}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorised" }));
    return false;
  }
  return true;
}

const main = async () => {
  const httpServer = http.createServer(async (req, res) => {
    // Health check — unauthenticated (Railway probe)
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "sse", version: "0.0.16" }));
      return;
    }

    // MCP endpoint — bearer token required
    if (req.url === "/mcp" || req.url === "/") {
      if (!checkAuth(req, res)) return;

      const server = XeroMcpServer.GetServer();
      ToolFactory(server);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, () => {
    console.log(`Xero MCP Server running on SSE transport — port ${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received — shutting down");
    httpServer.close();
  });
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
