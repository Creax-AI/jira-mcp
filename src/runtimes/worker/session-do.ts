import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { JiraMcpServer } from "~/server";

type JiraClientCredentials = {
  baseUrl: string;
  username: string;
  apiToken: string;
};

type WorkerEnv = {
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_TOKENS?: string;
  JIRA_MCP_SESSIONS: unknown;
};

type JiraSessionEntry = {
  server: JiraMcpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  authUserId?: string;
};

export class JiraMcpSessionDurableObject {
  private readonly sessions = new Map<string, JiraSessionEntry>();

  constructor(
    private readonly _state: unknown,
    private readonly _env: WorkerEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    return this.handleMcpRequest(request);
  }

  private async handleMcpRequest(request: Request): Promise<Response> {
    try {
      const authUserId = request.headers.get("x-auth-user-id")?.trim() || undefined;
      const parsedBody = await parseJsonBody(request);
      if (parsedBody.invalidJson) {
        return createJsonRpcError(400, -32700, "Parse error: request body must be valid JSON");
      }

      const body = parsedBody.value;
      const sessionId = getSessionIdFromRequest(request);
      const existingSession = sessionId ? this.sessions.get(sessionId) : undefined;

      if (existingSession) {
        if (existingSession.authUserId && existingSession.authUserId !== authUserId) {
          return createJsonRpcError(
            403,
            -32003,
            "Session belongs to a different authenticated user.",
          );
        }

        return existingSession.transport.handleRequest(request, {
          parsedBody: body,
        });
      }

      if (sessionId) {
        return createJsonRpcError(
          404,
          -32001,
          "Unknown or expired session ID. Re-run initialize to create a new session.",
        );
      }

      const isInit = request.method === "POST" && !!body && isInitializeRequest(body);
      if (!isInit) {
        return createJsonRpcError(
          400,
          -32000,
          "Bad Request: Send initialize first or include a valid MCP-Session-Id header.",
        );
      }

      const credentials = readJiraCredentials(request);
      if (!credentials) {
        return createJsonRpcError(
          400,
          -32000,
          "Missing Jira credentials. Provide X-Jira-Base-Url, X-Jira-Username, and X-Jira-Api-Token.",
        );
      }

      const server = new JiraMcpServer(
        credentials.baseUrl,
        credentials.username,
        credentials.apiToken,
      );

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => {
          this.sessions.set(sid, {
            server,
            transport,
            authUserId,
          });
        },
        onsessionclosed: (sid) => {
          if (sid) {
            this.sessions.delete(sid);
          }
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          this.sessions.delete(sid);
        }
      };

      await server.connect(transport);
      return transport.handleRequest(request, { parsedBody: body });
    } catch (error) {
      console.error("Error handling /mcp request in Durable Object:", error);
      return createJsonRpcError(500, -32603, "Internal server error");
    }
  }
}

function createJsonRpcError(status: number, code: number, message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code,
        message,
      },
      id: null,
    },
    { status },
  );
}

async function parseJsonBody(request: Request): Promise<{ value: unknown; invalidJson: boolean }> {
  if (request.method !== "POST") {
    return { value: undefined, invalidJson: false };
  }

  try {
    return { value: await request.clone().json(), invalidJson: false };
  } catch {
    return { value: undefined, invalidJson: true };
  }
}

function readJiraCredentials(request: Request): JiraClientCredentials | null {
  const baseUrl = readHeaderOrQuery(request, "x-jira-base-url", "jiraBaseUrl");
  const username = readHeaderOrQuery(request, "x-jira-username", "jiraUsername");
  const apiToken = readHeaderOrQuery(request, "x-jira-api-token", "jiraApiToken");

  if (!baseUrl || !username || !apiToken) {
    return null;
  }

  return {
    baseUrl,
    username,
    apiToken,
  };
}

function readHeaderOrQuery(
  request: Request,
  headerName: string,
  queryName: string,
): string | undefined {
  const headerValue = request.headers.get(headerName);
  if (headerValue && headerValue.trim()) {
    return headerValue.trim();
  }

  const queryValue = new URL(request.url).searchParams.get(queryName);
  return queryValue?.trim() || undefined;
}

function getSessionIdFromRequest(request: Request): string | undefined {
  const queryValue = new URL(request.url).searchParams.get("sessionId");
  if (queryValue?.trim()) {
    return queryValue.trim();
  }

  const header = request.headers.get("mcp-session-id") ?? request.headers.get("x-mcp-session-id");
  return header?.trim() || undefined;
}
