type RequiredEnv = {
  JIRA_MCP_URL: string;
  MCP_WORKSPACE_TOKEN: string;
  JIRA_BASE_URL?: string;
  JIRA_USERNAME?: string;
  JIRA_API_TOKEN?: string;
};

async function main() {
  const env = readRequiredEnv();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.MCP_WORKSPACE_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (env.JIRA_BASE_URL && env.JIRA_USERNAME && env.JIRA_API_TOKEN) {
    headers["X-Jira-Base-Url"] = env.JIRA_BASE_URL;
    headers["X-Jira-Username"] = env.JIRA_USERNAME;
    headers["X-Jira-Api-Token"] = env.JIRA_API_TOKEN;
  }

  const initializeResponse = await fetch(env.JIRA_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "mcp-smoke-test",
          version: "1.0.0",
        },
      },
    }),
  });

  const sessionId = initializeResponse.headers.get("mcp-session-id");
  const initializeBody = await initializeResponse.text();
  assertOk(initializeResponse, "initialize", initializeBody);
  if (!sessionId) {
    throw new Error("Missing mcp-session-id header from initialize response");
  }

  const sessionHeaders = {
    ...headers,
    "MCP-Session-Id": sessionId,
    "MCP-Protocol-Version": "2025-06-18",
  };

  const initializedResponse = await fetch(env.JIRA_MCP_URL, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });
  const initializedBody = await initializedResponse.text();
  if (![200, 202, 204].includes(initializedResponse.status)) {
    throw new Error(
      `initialized notification failed with ${initializedResponse.status}: ${initializedBody}`,
    );
  }

  const listToolsResponse = await fetch(env.JIRA_MCP_URL, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  const listToolsBody = await listToolsResponse.text();
  assertOk(listToolsResponse, "tools/list", listToolsBody);

  const getProjectsResponse = await fetch(env.JIRA_MCP_URL, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_projects",
        arguments: {},
      },
    }),
  });
  const getProjectsBody = await getProjectsResponse.text();
  assertOk(getProjectsResponse, "tools/call get_projects", getProjectsBody);

  console.log("Smoke test passed");
  console.log(`Session ID: ${sessionId}`);
}

function readRequiredEnv(): RequiredEnv {
  const required = ["JIRA_MCP_URL"] as const;

  const missing = required.filter((name) => !process.env[name] || !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const workspaceToken =
    process.env.MCP_WORKSPACE_TOKEN?.trim() || process.env.MCP_AUTH_TOKEN?.trim();
  if (!workspaceToken) {
    throw new Error("Missing required environment variable: MCP_WORKSPACE_TOKEN");
  }

  return {
    JIRA_MCP_URL: process.env.JIRA_MCP_URL!.trim(),
    MCP_WORKSPACE_TOKEN: workspaceToken,
    JIRA_BASE_URL: process.env.JIRA_BASE_URL?.trim(),
    JIRA_USERNAME: process.env.JIRA_USERNAME?.trim(),
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN?.trim(),
  };
}

function assertOk(response: Response, step: string, responseBody: string) {
  if (!response.ok) {
    throw new Error(`${step} failed with ${response.status}: ${responseBody}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
