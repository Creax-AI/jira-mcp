export type LoginResponse = {
  token: string;
  tokenId: string;
  workspaceId: string | null;
  tokenPrefix: string;
  expiresAt: string | null;
  user: {
    id: string;
    email: string;
  };
};

export type AuthTokenInfo = {
  id: string;
  workspaceId: string | null;
  workspaceName: string | null;
  tokenName: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
};

export type McpResult = {
  sessionId?: string;
  payload: unknown;
};

export type JiraWorkspaceInfo = {
  id: string;
  workspaceName: string;
  jiraBaseUrl: string;
  jiraUsername: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

type HttpMethod = "GET" | "POST";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function registerUser(email: string, password: string) {
  return request<{ userId: string; email: string; message: string }>("POST", "/auth/register", {
    email,
    password,
  });
}

export async function loginUser(
  email: string,
  password: string,
  tokenName: string,
  expiresInDays: number,
  neverExpires: boolean,
) {
  return request<LoginResponse>("POST", "/auth/login", {
    email,
    password,
    tokenName,
    expiresInDays,
    neverExpires,
  });
}

export async function createToken(
  authToken: string | undefined,
  tokenName: string,
  expiresInDays: number,
  neverExpires: boolean,
  workspaceId?: string,
) {
  return requestWithOptionalAuth<LoginResponse>(authToken, "POST", "/auth/tokens", {
    tokenName,
    expiresInDays,
    neverExpires,
    workspaceId,
  });
}

export async function listTokens(authToken?: string) {
  return requestWithOptionalAuth<{
    currentTokenId: string | null;
    tokens: AuthTokenInfo[];
  }>(authToken, "GET", "/auth/tokens");
}

export async function revokeToken(authToken: string | undefined, tokenId: string) {
  return requestWithOptionalAuth<{
    tokenId: string;
    revokedAt: string;
    alreadyRevoked: boolean;
  }>(authToken, "POST", "/auth/tokens/revoke", { tokenId });
}

export async function listWorkspaces(authToken?: string) {
  return requestWithOptionalAuth<{ workspaces: JiraWorkspaceInfo[] }>(
    authToken,
    "GET",
    "/auth/workspaces",
  );
}

export async function createWorkspace(
  workspaceName: string,
  jiraBaseUrl: string,
  jiraUsername: string,
  jiraApiToken: string,
  authToken?: string,
) {
  return requestWithOptionalAuth<{ workspace: JiraWorkspaceInfo }>(
    authToken,
    "POST",
    "/auth/workspaces",
    {
      workspaceName,
      jiraBaseUrl,
      jiraUsername,
      jiraApiToken,
    },
  );
}

export async function deleteWorkspace(workspaceId: string, authToken?: string) {
  return requestWithOptionalAuth<{
    workspaceId: string;
    deleted: boolean;
    revokedWorkspaceTokens: boolean;
  }>(authToken, "POST", "/auth/workspaces/delete", { workspaceId });
}

export async function initializeMcp(token: string): Promise<McpResult> {
  const response = await fetch(withBaseUrl("/mcp"), {
    method: "POST",
    headers: createMcpHeaders(token),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "auth-ui", version: "1.0.0" },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Initialize failed (${response.status}): ${raw}`);
  }

  return {
    sessionId: response.headers.get("mcp-session-id") ?? undefined,
    payload: parseStreamableBody(raw),
  };
}

export async function listTools(token: string, sessionId: string): Promise<McpResult> {
  await sendMcp(token, sessionId, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });

  const response = await sendMcp(token, sessionId, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  return {
    sessionId,
    payload: parseStreamableBody(response),
  };
}

export async function getProjects(token: string, sessionId: string): Promise<McpResult> {
  const response = await sendMcp(token, sessionId, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "get_projects",
      arguments: {},
    },
  });

  return {
    sessionId,
    payload: parseStreamableBody(response),
  };
}

function createMcpHeaders(token: string, sessionId?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (sessionId) {
    headers["MCP-Session-Id"] = sessionId;
    headers["MCP-Protocol-Version"] = "2025-06-18";
  }

  return headers;
}

async function sendMcp(token: string, sessionId: string, body: unknown): Promise<string> {
  const response = await fetch(withBaseUrl("/mcp"), {
    method: "POST",
    headers: createMcpHeaders(token, sessionId),
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`MCP request failed (${response.status}): ${raw}`);
  }

  return raw;
}

function parseStreamableBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw };
    }
  }

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  if (lines.length === 0) {
    return { raw };
  }

  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch {
    return { raw };
  }
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const response = await fetch(withBaseUrl(path), {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

async function requestWithOptionalAuth<T>(
  authToken: string | undefined,
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken?.trim()) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(withBaseUrl(path), {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

function withBaseUrl(path: string): string {
  if (!API_BASE_URL) {
    return path;
  }

  const normalizedBase = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${normalizedBase}${path}`;
}
