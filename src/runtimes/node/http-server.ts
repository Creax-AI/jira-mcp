import { JiraMcpServer } from "~/server";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

type JiraClientCredentials = {
  baseUrl: string;
  username: string;
  apiToken: string;
};

type JiraSessionEntry = {
  server: JiraMcpServer;
  transport: SSEServerTransport;
};

type JiraStreamableHttpSessionEntry = {
  server: JiraMcpServer;
  transport: StreamableHTTPServerTransport;
};

export class JiraMcpHttpServer {
  private readonly sessions = new Map<string, JiraSessionEntry>();
  private readonly streamableHttpSessions = new Map<string, JiraStreamableHttpSessionEntry>();
  private readonly authTokens: Set<string>;

  constructor(
    private readonly port: number,
    authTokens: string[],
  ) {
    this.authTokens = new Set(authTokens.filter((token) => token.trim().length > 0));
  }

  async start(): Promise<void> {
    const app = express();
    app.use(express.json({ limit: "4mb" }));

    app.all("/mcp", async (req: Request, res: Response) => {
      if (!this.isAuthorized(req)) {
        res.sendStatus(401);
        return;
      }

      try {
        const headerValue = req.header("mcp-session-id") ?? req.header("x-mcp-session-id");
        const sessionId = headerValue?.trim();
        const existingSession = sessionId ? this.streamableHttpSessions.get(sessionId) : undefined;

        if (existingSession) {
          await existingSession.transport.handleRequest(
            req as unknown as IncomingMessage,
            res as unknown as ServerResponse<IncomingMessage>,
            req.body,
          );
          return;
        }

        const isInit = req.method === "POST" && isInitializeRequest(req.body);
        if (!isInit) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
          return;
        }

        const credentials = readJiraCredentials(req);
        if (!credentials) {
          res.status(400).send("Missing Jira credentials");
          return;
        }

        const server = new JiraMcpServer(
          credentials.baseUrl,
          credentials.username,
          credentials.apiToken,
          { logSink: createFileLogSink() },
        );

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            this.streamableHttpSessions.set(sid, { server, transport });
          },
          onsessionclosed: (sid) => {
            if (sid) this.streamableHttpSessions.delete(sid);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) this.streamableHttpSessions.delete(sid);
        };

        await server.connect(transport);
        await transport.handleRequest(
          req as unknown as IncomingMessage,
          res as unknown as ServerResponse<IncomingMessage>,
          req.body,
        );
      } catch (error) {
        console.error("Error handling /mcp request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    app.get("/sse", async (req: Request, res: Response) => {
      if (!this.isAuthorized(req)) {
        res.sendStatus(401);
        return;
      }

      const credentials = readJiraCredentials(req);
      if (!credentials) {
        res.status(400).send("Missing Jira credentials");
        return;
      }

      console.log("New SSE connection established");
      const server = new JiraMcpServer(
        credentials.baseUrl,
        credentials.username,
        credentials.apiToken,
        { logSink: createFileLogSink() },
      );
      const transport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      const sessionId = getTransportSessionId(transport);
      if (!sessionId) {
        console.warn("SSE connection missing session ID; cannot accept messages.");
        res.sendStatus(500);
        return;
      }

      this.sessions.set(sessionId, { server, transport });
      res.on("close", () => {
        this.sessions.delete(sessionId);
      });

      await server.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.isAuthorized(req)) {
        res.sendStatus(401);
        return;
      }

      const sessionId = getSessionIdFromRequest(req);
      if (!sessionId) {
        res.status(400).send("Missing sessionId");
        return;
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        res.status(404).send("Unknown session");
        return;
      }

      await session.transport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
        req.body,
      );
    });

    app.listen(this.port, () => {
      console.log(`HTTP server listening on port ${this.port}`);
      console.log(`Streamable HTTP endpoint available at http://localhost:${this.port}/mcp`);
      console.log(`SSE endpoint available at http://localhost:${this.port}/sse`);
      console.log(`Message endpoint available at http://localhost:${this.port}/messages`);
    });
  }

  private isAuthorized(req: Request): boolean {
    const token = getBearerToken(req);
    return !!token && this.authTokens.has(token);
  }
}

function getBearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header) {
    return undefined;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : undefined;
}

function readHeaderOrQuery(
  req: Request,
  headerName: string,
  queryName: string,
): string | undefined {
  const headerValue = req.header(headerName);
  if (headerValue && headerValue.trim()) {
    return headerValue.trim();
  }

  const queryValue = req.query[queryName];
  if (typeof queryValue === "string" && queryValue.trim()) {
    return queryValue.trim();
  }

  return undefined;
}

function readJiraCredentials(req: Request): JiraClientCredentials | null {
  const baseUrl = readHeaderOrQuery(req, "x-jira-base-url", "jiraBaseUrl");
  const username = readHeaderOrQuery(req, "x-jira-username", "jiraUsername");
  const apiToken = readHeaderOrQuery(req, "x-jira-api-token", "jiraApiToken");

  if (!baseUrl || !username || !apiToken) {
    return null;
  }

  return {
    baseUrl,
    username,
    apiToken,
  };
}

function getSessionIdFromRequest(req: Request): string | undefined {
  const queryValue = req.query.sessionId;
  if (typeof queryValue === "string" && queryValue.trim()) {
    return queryValue.trim();
  }
  if (Array.isArray(queryValue) && queryValue[0]) {
    return String(queryValue[0]);
  }
  const header = req.header("mcp-session-id") ?? req.header("x-mcp-session-id");
  return header?.trim();
}

function getTransportSessionId(transport: SSEServerTransport): string | undefined {
  const candidate = (transport as unknown as { sessionId?: string }).sessionId;
  return candidate?.trim();
}

function createFileLogSink() {
  return (name: string, value: unknown) => {
    const logsDir = "logs";
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
  };
}
