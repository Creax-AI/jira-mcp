import { useEffect, useState } from "react";
import {
  Play,
  List,
  FolderOpen,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Terminal,
} from "lucide-react";
import { getProjects, initializeMcp, listTools } from "@/lib/api";
import { clearSessionId, getSessionId, setSessionId } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function McpTestPage() {
  const [token, setToken] = useState("");
  const [sessionId, setSessionIdState] = useState("");
  const [output, setOutput] = useState("Ready");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSessionIdState(getSessionId());
  }, []);

  function ensureRequired(): boolean {
    if (!token.trim()) {
      setError("Missing workspace token. Create one from the Tokens page.");
      return false;
    }

    setError("");
    return true;
  }

  async function runInitialize() {
    if (!ensureRequired()) {
      return;
    }

    const result = await initializeMcp(token);

    if (!result.sessionId) {
      throw new Error("Initialize succeeded but no MCP session ID was returned.");
    }

    setSessionId(result.sessionId);
    setSessionIdState(result.sessionId);
    setStatus(`Session created: ${result.sessionId}`);
    setOutput(JSON.stringify(result.payload, null, 2));
  }

  async function runListTools() {
    if (!ensureRequired()) {
      return;
    }
    if (!sessionId.trim()) {
      setError("Initialize first to create a session.");
      return;
    }

    const result = await listTools(token, sessionId);
    setStatus(`Tools listed using session ${result.sessionId}`);
    setOutput(JSON.stringify(result.payload, null, 2));
  }

  async function runGetProjects() {
    if (!ensureRequired()) {
      return;
    }
    if (!sessionId.trim()) {
      setError("Initialize first to create a session.");
      return;
    }

    const result = await getProjects(token, sessionId);
    setStatus(`Project data fetched using session ${result.sessionId}`);
    setOutput(JSON.stringify(result.payload, null, 2));
  }

  async function runAction(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    }
  }

  function resetSession() {
    clearSessionId();
    setSessionIdState("");
    setOutput("Ready");
    setStatus("Session cleared");
  }

  return (
    <div className="space-y-6">
      {/* Status alerts */}
      {status && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Token & Session */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">MCP Quick Test</CardTitle>
          </div>
          <CardDescription>
            Use a workspace-scoped token. Jira credentials are resolved server-side from workspace
            settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-token">Workspace bearer token</Label>
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
              <Label htmlFor="session-id">Session ID</Label>
              {sessionId && (
                <Badge variant="secondary" className="text-xs">
                  Active
                </Badge>
              )}
            </div>
            <Input
              id="session-id"
              className="font-mono text-sm"
              value={sessionId}
              readOnly
              placeholder="Not initialized"
            />
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runAction(runInitialize)}>
              <Play className="mr-1.5 h-4 w-4" />
              Initialize
            </Button>
            <Button variant="secondary" onClick={() => void runAction(runListTools)}>
              <List className="mr-1.5 h-4 w-4" />
              List Tools
            </Button>
            <Button variant="secondary" onClick={() => void runAction(runGetProjects)}>
              <FolderOpen className="mr-1.5 h-4 w-4" />
              Get Projects
            </Button>
            <Button variant="outline" onClick={resetSession}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Clear Session
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Output */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Response Output
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[400px] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
            {output}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
