import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DespezzasClient } from "./client.js";
import { registerTools } from "./tools.js";

export function createServer(client?: DespezzasClient) {
  const server = new McpServer({
    name: "despezzas-mcp",
    version: "0.1.0",
  });

  registerTools(server, client);
  return server;
}
