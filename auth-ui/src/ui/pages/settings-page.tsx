import { useEffect, useRef, useState } from "react";
import {
  Play,
  List,
  FolderOpen,
  RotateCcw,
  Terminal,
  Settings as SettingsIcon,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getProjects, initializeMcp, listTools } from "@/lib/api";
import { clearSessionId, getSessionId, setSessionId } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  McpResponseViewer,
  McpResponsePlaceholder,
  type McpResponseEntry,
  type McpResponseMethod,
} from "@/ui/components/mcp-response-viewer";

let nextId = 1;

export function SettingsPage() {
  const [token, setToken] = useState("");
  const [sessionId, setSessionIdState] = useState("");
  const [responses, setResponses] = useState<McpResponseEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const responseAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionIdState(getSessionId());
  }, []);

  function scrollToResponse() {
    // Small delay to let the DOM render the new response card
    setTimeout(() => {
      responseAreaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function pushResponse(method: McpResponseMethod, payload: unknown, durationMs: number) {
    const entry: McpResponseEntry = {
      id: String(nextId++),
      method,
      payload,
      timestamp: Date.now(),
      durationMs,
    };
    setResponses((prev) => [entry, ...prev]);
    scrollToResponse();
  }

  function ensureToken(): boolean {
    if (!token.trim()) {
      toast.error("Paste a workspace bearer token first.");
      return false;
    }
    return true;
  }

  async function runInitialize() {
    if (!ensureToken()) return;
    setIsRunning(true);
    const start = performance.now();

    try {
      const result = await initializeMcp(token);
      const elapsed = Math.round(performance.now() - start);

      if (!result.sessionId) {
        throw new Error("No MCP-Session-Id returned.");
      }
      setSessionId(result.sessionId);
      setSessionIdState(result.sessionId);
      pushResponse("initialize", result.payload, elapsed);
      toast.success("MCP session initialized.");
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      pushResponse(
        "error",
        {
          error: {
            code: -1,
            message: err instanceof Error ? err.message : "Initialize failed.",
          },
        },
        elapsed,
      );
      toast.error(err instanceof Error ? err.message : "Initialize failed.");
    } finally {
      setIsRunning(false);
    }
  }

  async function runListTools() {
    if (!ensureToken()) return;
    if (!sessionId.trim()) {
      toast.error("Initialize a session first.");
      return;
    }
    setIsRunning(true);
    const start = performance.now();

    try {
      const result = await listTools(token, sessionId);
      const elapsed = Math.round(performance.now() - start);
      pushResponse("tools/list", result.payload, elapsed);
      toast.success("Tools listed.");
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      pushResponse(
        "error",
        {
          error: {
            code: -1,
            message: err instanceof Error ? err.message : "List tools failed.",
          },
        },
        elapsed,
      );
      toast.error(err instanceof Error ? err.message : "List tools failed.");
    } finally {
      setIsRunning(false);
    }
  }

  async function runGetProjects() {
    if (!ensureToken()) return;
    if (!sessionId.trim()) {
      toast.error("Initialize a session first.");
      return;
    }
    setIsRunning(true);
    const start = performance.now();

    try {
      const result = await getProjects(token, sessionId);
      const elapsed = Math.round(performance.now() - start);
      pushResponse("tools/call", result.payload, elapsed);
      toast.success("Projects fetched.");
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      pushResponse(
        "error",
        {
          error: {
            code: -1,
            message: err instanceof Error ? err.message : "Get projects failed.",
          },
        },
        elapsed,
      );
      toast.error(err instanceof Error ? err.message : "Get projects failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function resetSession() {
    clearSessionId();
    setSessionIdState("");
    setResponses([]);
    toast.info("Session cleared.");
  }

  function clearHistory() {
    setResponses([]);
    toast.info("Response history cleared.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Diagnostics and MCP connection testing.</p>
      </div>

      {/* MCP Diagnostics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">MCP Connection Test</CardTitle>
          </div>
          <CardDescription>
            Verify that your workspace tokens work correctly against the MCP endpoint. Paste a token
            from the <span className="font-medium text-foreground">API Tokens</span> page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-token">Bearer Token</Label>
              <Input
                id="mcp-token"
                className="font-mono text-sm"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="mcp_..."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="mcp-session">Session ID</Label>
                {sessionId && (
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                )}
              </div>
              <Input
                id="mcp-session"
                className="font-mono text-sm"
                value={sessionId}
                readOnly
                placeholder="Not initialized"
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runInitialize()} disabled={isRunning} size="sm">
              {isRunning ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-4 w-4" />
              )}
              Initialize
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runListTools()}
              disabled={isRunning}
            >
              <List className="mr-1.5 h-4 w-4" />
              List Tools
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runGetProjects()}
              disabled={isRunning}
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              Get Projects
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={resetSession}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Clear Session
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Response history */}
      <div ref={responseAreaRef} className="space-y-4">
        {responses.length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Response History
              <Badge variant="secondary" className="ml-2 text-xs">
                {responses.length}
              </Badge>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={clearHistory}
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          </div>
        )}

        {responses.length === 0 ? (
          <McpResponsePlaceholder />
        ) : (
          responses.map((entry) => <McpResponseViewer key={entry.id} entry={entry} />)
        )}
      </div>

      {/* About */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">About</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">MCP Protocol Version</dt>
              <dd className="font-mono">2025-06-18</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Client</dt>
              <dd className="font-mono">auth-ui v1.0.0</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
