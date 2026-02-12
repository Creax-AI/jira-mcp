import { D1DatabaseLike, UserAuthContext, WorkerAuthService } from "./auth-service";
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
  AUTH_DB?: D1DatabaseLike;
  JIRA_MCP_SESSIONS: DurableObjectNamespaceLike;
};

type RequestAuthContext = { type: "static"; token: string } | UserAuthContext;

const SESSION_HUB_NAME = "jira-mcp-session-hub";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const authService = new WorkerAuthService(env.AUTH_DB);

    const authResponse = await authService.handleAuthRequest(request);
    if (authResponse) {
      return authResponse;
    }

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    const authTokens = parseAuthTokens(env.MCP_AUTH_TOKEN, env.MCP_AUTH_TOKENS);
    if (authTokens.size === 0 && !authService.isConfigured()) {
      return new Response("Server misconfigured: missing MCP auth token", {
        status: 500,
      });
    }

    const authContext = await authorizeRequest(request, authTokens, authService);
    if (!authContext) {
      return new Response("Unauthorized", { status: 401 });
    }

    const requestWithAuthHeaders = attachAuthHeaders(request, authContext);

    const id = env.JIRA_MCP_SESSIONS.idFromName(SESSION_HUB_NAME);
    const stub = env.JIRA_MCP_SESSIONS.get(id);
    return stub.fetch(requestWithAuthHeaders);
  },
};

export { JiraMcpSessionDurableObject };

async function authorizeRequest(
  request: Request,
  authTokens: Set<string>,
  authService: WorkerAuthService,
): Promise<RequestAuthContext | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  if (authTokens.has(token)) {
    return { type: "static", token };
  }

  return authService.validateUserToken(token);
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

function attachAuthHeaders(request: Request, context: RequestAuthContext): Request {
  const headers = new Headers(request.headers);

  if (context.type === "user") {
    headers.set("x-auth-user-id", context.userId);
    headers.set("x-auth-user-email", context.email);
    headers.set("x-auth-token-id", context.tokenId);
  }

  return new Request(request, { headers });
}
