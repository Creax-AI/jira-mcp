import { JiraMcpSessionDurableObject } from "./session-do";

type DurableObjectIdLike = unknown;

type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): {
    fetch(request: Request): Promise<Response>;
  };
};

type WorkerEnv = {
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_TOKENS?: string;
  JIRA_MCP_SESSIONS: DurableObjectNamespaceLike;
};

const SESSION_HUB_NAME = "jira-mcp-session-hub";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    if (!isAuthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const id = env.JIRA_MCP_SESSIONS.idFromName(SESSION_HUB_NAME);
    const stub = env.JIRA_MCP_SESSIONS.get(id);
    return stub.fetch(request);
  },
};

export { JiraMcpSessionDurableObject };

function isAuthorized(request: Request, env: WorkerEnv): boolean {
  const token = getBearerToken(request);
  if (!token) {
    return false;
  }

  const authTokens = parseAuthTokens(env.MCP_AUTH_TOKEN, env.MCP_AUTH_TOKENS);
  return authTokens.has(token);
}

function parseAuthTokens(primary?: string, fallback?: string): Set<string> {
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

  return new Set(tokens);
}

function getBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) {
    return undefined;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : undefined;
}
