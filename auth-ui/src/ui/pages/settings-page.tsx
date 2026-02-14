import { useEffect, useState } from "react";
import {
  Play,
  List,
  FolderOpen,
  RotateCcw,
  Terminal,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getProjects, initializeMcp, listTools } from "@/lib/api";
import { clearSessionId, getSessionId, setSessionId } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function SettingsPage() {
  const [token, setToken] = useState("");
  const [sessionId, setSessionIdState] = useState("");
  const [output, setOutput] = useState(
    "// Ready — paste a token and click Initialize",
  );
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setSessionIdState(getSessionId());
  }, []);

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

    try {
      const result = await initializeMcp(token);
      if (!result.sessionId) {
        throw new Error("No MCP-Session-Id returned.");
      }
      setSessionId(result.sessionId);
      setSessionIdState(result.sessionId);
      setOutput(JSON.stringify(result.payload, null, 2));
      toast.success("MCP session initialized.");
    } catch (err) {
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

    try {
      const result = await listTools(token, sessionId);
      setOutput(JSON.stringify(result.payload, null, 2));
      toast.success("Tools listed.");
    } catch (err) {
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

    try {
      const result = await getProjects(token, sessionId);
      setOutput(JSON.stringify(result.payload, null, 2));
      toast.success("Projects fetched.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Get projects failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function resetSession() {
    clearSessionId();
    setSessionIdState("");
    setOutput("// Ready — paste a token and click Initialize");
    toast.info("Session cleared.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Diagnostics and MCP connection testing.
        </p>
      </div>

      {/* MCP Diagnostics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">MCP Connection Test</CardTitle>
          </div>
          <CardDescription>
            Verify that your workspace tokens work correctly against the MCP
            endpoint. Paste a token from the{" "}
            <span className="font-medium text-foreground">API Tokens</span>{" "}
            page.
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
            <Button
              onClick={() => void runInitialize()}
              disabled={isRunning}
              size="sm"
            >
              <Play className="mr-1.5 h-4 w-4" />
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
            <Button variant="outline" size="sm" onClick={resetSession}>
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
            Response
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[500px] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
            {output}
          </pre>
        </CardContent>
      </Card>

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
