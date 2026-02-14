#!/usr/bin/env node

import dotenv from "dotenv";
import { JiraMcpServer } from "./server";
import { JiraMcpHttpServer } from "./runtimes/node/http-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Load environment variables
dotenv.config();

const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 3000;

// Start the appropriate transport based on NODE_ENV
async function start() {
  console.log("Starting Jira MCP server...");

  if (process.env.NODE_ENV === "cli") {
    const jiraBaseUrl = process.env.JIRA_BASE_URL;
    const jiraUsername = process.env.JIRA_USERNAME;
    const jiraApiToken = process.env.JIRA_API_TOKEN;

    if (!jiraBaseUrl || !jiraUsername || !jiraApiToken) {
      console.error("❌ JIRA_BASE_URL, JIRA_USERNAME, and JIRA_API_TOKEN are required in CLI mode");
      process.exit(1);
    }

    console.log("🔌 Using stdio transport");
    const server = new JiraMcpServer(jiraBaseUrl, jiraUsername, jiraApiToken);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    const authTokens = parseAuthTokens(process.env.MCP_AUTH_TOKEN, process.env.MCP_AUTH_TOKENS);

    if (authTokens.length === 0) {
      console.error("❌ MCP_AUTH_TOKEN (or MCP_AUTH_TOKENS) is required for HTTP mode");
      process.exit(1);
    }

    console.log(`🌐 Starting HTTP server on port ${HTTP_PORT}`);
    const httpServer = new JiraMcpHttpServer(HTTP_PORT, authTokens);
    await httpServer.start();
  }
}

function parseAuthTokens(primary?: string, fallback?: string): string[] {
  const tokens: string[] = [];
  if (primary && primary.trim()) {
    tokens.push(primary.trim());
  }
  if (fallback && fallback.trim()) {
    tokens.push(
      ...fallback
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0),
    );
  }
  return Array.from(new Set(tokens));
}

start().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
