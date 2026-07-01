#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { createHttpApp, listenHttp } from "./httpApp.js";
import { createServer } from "./server.js";

export default createHttpApp();

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runCli() {
  if (config.transport === "http") {
    listenHttp();
    return;
  }

  await runStdio();
}

function isDirectRun() {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
}

if (isDirectRun()) {
  try {
    await runCli();
  } catch (error) {
    console.error("Fatal error running Despezzas MCP:", error);
    process.exit(1);
  }
}
