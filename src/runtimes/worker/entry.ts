import {
  D1DatabaseLike,
  JiraWorkspaceCredentials,
  UserAuthContext,
  WorkerAuthService,
} from "./auth-service";
import { handleBetterAuthRequest, resolveBetterAuthUserFromRequest } from "./auth/better-auth";
import { resolveInternalSigningSecret, signWorkerToDoRequest } from "./security";
import { JiraMcpSessionDurableObject } from "./session-do";

type DurableObjectIdLike = unknown;

type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): {
    fetch(request: Request): Promise<Response>;
  };
};

type AssetsBindingLike = {
  fetch(request: Request): Promise<Response>;
};

type WorkerEnv = {
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_TOKENS?: string;
  AUTH_DB?: D1DatabaseLike;
  BETTER_AUTH_SECRET?: string;
  JIRA_WORKSPACE_ENCRYPTION_KEY?: string;
  MCP_INTERNAL_SIGNING_SECRET?: string;
  AUTH_UI_URL?: string;
  AUTH_UI_ASSETS?: AssetsBindingLike;
  JIRA_MCP_SESSIONS: DurableObjectNamespaceLike;
};

type RequestAuthContext = { type: "static"; token: string } | UserAuthContext;

const SESSION_HUB_NAME = "jira-mcp-session-hub";
const DEFAULT_CORS_HEADERS =
  "authorization,content-type,x-jira-base-url,x-jira-username,x-jira-api-token,mcp-session-id,mcp-protocol-version";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && request.headers.has("origin")) {
      return createCorsPreflightResponse(request);
    }

    const betterAuthResponse = await handleBetterAuthRequest(
      request,
      env.AUTH_DB,
      env.BETTER_AUTH_SECRET,
    );
    if (betterAuthResponse) {
      return withCorsHeaders(request, betterAuthResponse);
    }

    const authService = new WorkerAuthService(
      env.AUTH_DB,
      (currentRequest) =>
        resolveBetterAuthUserFromRequest(currentRequest, env.AUTH_DB, env.BETTER_AUTH_SECRET),
      env.JIRA_WORKSPACE_ENCRYPTION_KEY,
    );

    const authResponse = await authService.handleAuthRequest(request);
    if (authResponse) {
      return withCorsHeaders(request, authResponse);
    }

    if (request.method === "GET") {
      const uiResponse = await maybeServeAuthUi(request, env);
      if (uiResponse) {
        return withCorsHeaders(request, uiResponse);
      }
    }

    if (url.pathname === "/health") {
      return withCorsHeaders(request, new Response("ok"));
    }

    if (url.pathname !== "/mcp") {
      return withCorsHeaders(request, new Response("Not Found", { status: 404 }));
    }

    const authTokens = parseAuthTokens(env.MCP_AUTH_TOKEN, env.MCP_AUTH_TOKENS);
    if (authTokens.size === 0 && !authService.isConfigured()) {
      return withCorsHeaders(
        request,
        new Response("Server misconfigured: missing MCP auth token", {
          status: 500,
        }),
      );
    }

    const authContext = await authorizeRequest(request, authTokens, authService);
    if (!authContext) {
      return withCorsHeaders(request, new Response("Unauthorized", { status: 401 }));
    }

    const workspaceCredentials =
      authContext.type === "user" && authContext.workspaceId
        ? await authService.getWorkspaceCredentialsForUser(
            authContext.userId,
            authContext.workspaceId,
          )
        : null;

    if (authContext.type === "user" && authContext.workspaceId && !workspaceCredentials) {
      return withCorsHeaders(request, new Response("Unauthorized", { status: 401 }));
    }

    const requestWithAuthHeaders = attachAuthHeaders(request, authContext, workspaceCredentials);
    const signingSecret = resolveInternalSigningSecret(env);
    if (!signingSecret) {
      return withCorsHeaders(
        request,
        new Response("Server misconfigured: missing internal signing secret", {
          status: 500,
        }),
      );
    }

    const signedRequest = await signWorkerToDoRequest(requestWithAuthHeaders, signingSecret);

    const id = env.JIRA_MCP_SESSIONS.idFromName(getSessionHubName(authContext));
    const stub = env.JIRA_MCP_SESSIONS.get(id);
    return withCorsHeaders(request, await stub.fetch(signedRequest));
  },
};

export { JiraMcpSessionDurableObject };

async function maybeServeAuthUi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isRootUiPage = ["/", "/sign-up", "/token", "/mcp-test"].includes(pathname);
  const isLegacyAuthUiPage = pathname === "/auth" || pathname.startsWith("/auth/");
  const isAuthUiPage = isRootUiPage || isLegacyAuthUiPage;
  const isAuthUiAsset = pathname.startsWith("/assets/") || pathname === "/favicon.ico";

  if (!isAuthUiPage && !isAuthUiAsset) {
    return null;
  }

  const assets = env.AUTH_UI_ASSETS;
  if (assets) {
    if (isAuthUiAsset) {
      const assetResponse = await assets.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    if (isAuthUiPage) {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/";
      return assets.fetch(new Request(indexUrl.toString(), request));
    }
  }

  if (isAuthUiPage) {
    const authUiUrl = env.AUTH_UI_URL?.trim();
    if (authUiUrl) {
      return Response.redirect(authUiUrl, 302);
    }

    return Response.json(
      {
        message: "Auth UI assets are not deployed.",
        hint: "Run bun run build:auth-ui before deploying the Worker.",
      },
      { status: 200 },
    );
  }

  return null;
}

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

function attachAuthHeaders(
  request: Request,
  context: RequestAuthContext,
  workspaceCredentials: JiraWorkspaceCredentials | null,
): Request {
  const headers = new Headers(request.headers);

  if (context.type === "user") {
    headers.set("x-auth-user-id", context.userId);
    headers.set("x-auth-user-email", context.email);
    headers.set("x-auth-token-id", context.tokenId);
    if (context.workspaceId) {
      headers.set("x-auth-workspace-id", context.workspaceId);
    }
  }

  if (workspaceCredentials) {
    headers.set("x-jira-base-url", workspaceCredentials.jiraBaseUrl);
    headers.set("x-jira-username", workspaceCredentials.jiraUsername);
    headers.set("x-jira-api-token", workspaceCredentials.jiraApiToken);
  }

  return new Request(request, { headers });
}

function getSessionHubName(context: RequestAuthContext): string {
  if (context.type === "user" && context.workspaceId) {
    return `jira-workspace:${context.workspaceId}`;
  }

  return SESSION_HUB_NAME;
}

function createCorsPreflightResponse(request: Request): Response {
  const response = new Response(null, { status: 204 });
  return withCorsHeaders(request, response);
}

function withCorsHeaders(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedCorsOrigin(origin)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("access-control-request-headers") || DEFAULT_CORS_HEADERS,
  );
  headers.set("Access-Control-Expose-Headers", "mcp-session-id");
  headers.append("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isAllowedCorsOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
