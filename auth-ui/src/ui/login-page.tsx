import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Key,
  Plus,
  RefreshCw,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogIn,
  Globe,
  Ban,
} from "lucide-react";
import {
  AuthTokenInfo,
  JiraWorkspaceInfo,
  createToken,
  createWorkspace,
  deleteWorkspace,
  listTokens,
  listWorkspaces,
  revokeToken,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LoginPage() {
  const { isAuthenticated, signIn, userEmail, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenName, setTokenName] = useState("workspace-token");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [neverExpires, setNeverExpires] = useState(false);
  const [token, setToken] = useState("");
  const [tokens, setTokens] = useState<AuthTokenInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<JiraWorkspaceInfo[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceBaseUrl, setWorkspaceBaseUrl] = useState("");
  const [workspaceUsername, setWorkspaceUsername] = useState("");
  const [workspaceApiToken, setWorkspaceApiToken] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const selectedWorkspace = useMemo(
    () => workspaces.find((entry) => entry.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId],
  );

  const refreshTokens = useCallback(async () => {
    const response = await listTokens();
    setTokens(response.tokens);
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const response = await listWorkspaces();
    setWorkspaces(response.workspaces);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setTokens([]);
      setWorkspaces([]);
      return;
    }

    void Promise.all([refreshTokens(), refreshWorkspaces()]);
  }, [isAuthenticated, refreshTokens, refreshWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    const exists = workspaces.some((entry) => entry.id === selectedWorkspaceId);
    if (!exists) {
      setSelectedWorkspaceId("");
    }
  }, [workspaces, selectedWorkspaceId]);

  async function onSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    setIsLoading(true);

    try {
      await signIn(email, password);
      setInfo(`Signed in as ${email}`);
      setPassword("");
      await Promise.all([refreshTokens(), refreshWorkspaces()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setIsLoading(false);
    }
  }

  async function onCreateWorkspace() {
    setError("");
    setInfo("");

    if (!isAuthenticated) {
      setError("Sign in first to create workspaces.");
      return;
    }

    try {
      const result = await createWorkspace(
        workspaceName,
        workspaceBaseUrl,
        workspaceUsername,
        workspaceApiToken,
      );
      setWorkspaceApiToken("");
      setSelectedWorkspaceId(result.workspace.id);
      setInfo(`Workspace "${result.workspace.workspaceName}" created.`);
      await refreshWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    }
  }

  async function onDeleteWorkspace() {
    if (!selectedWorkspace) {
      setError("Select a workspace first.");
      return;
    }

    setError("");
    setInfo("");

    try {
      await deleteWorkspace(selectedWorkspace.id);
      setSelectedWorkspaceId("");
      setInfo(`Workspace "${selectedWorkspace.workspaceName}" deleted.`);
      await Promise.all([refreshWorkspaces(), refreshTokens()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workspace.");
    }
  }

  async function onCreateToken() {
    setError("");
    setInfo("");

    if (!isAuthenticated) {
      setError("Sign in first to create API tokens.");
      return;
    }

    if (!selectedWorkspaceId) {
      setError("Select a workspace before issuing a token.");
      return;
    }

    try {
      const response = await createToken(
        undefined,
        tokenName,
        expiresInDays,
        neverExpires,
        selectedWorkspaceId,
      );
      setToken(response.token);
      setInfo(
        `Workspace token created. ${response.expiresAt ? `Expires ${response.expiresAt}` : "No expiry"}`,
      );
      await refreshTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token.");
    }
  }

  async function onRevoke(tokenId: string) {
    setError("");
    setInfo("");

    try {
      await revokeToken(undefined, tokenId);
      setInfo(`Revoked token ${tokenId}`);
      await refreshTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token.");
    }
  }

  async function copyToken() {
    if (!token) {
      setError("No token available to copy.");
      return;
    }

    await navigator.clipboard.writeText(token);
    setInfo("Token copied to clipboard.");
    setError("");
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading session...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status alerts */}
      {info && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isAuthenticated ? (
        /* Sign In Card */
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Sign In</CardTitle>
            </div>
            <CardDescription>Sign in to manage workspaces and API tokens.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Workspace Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Jira Workspaces</CardTitle>
              </div>
              <CardDescription>
                Signed in as <span className="font-medium text-foreground">{userEmail}</span>.
                Create Jira workspaces to scope your MCP tokens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create workspace form */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Acme Production"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-url">Jira base URL</Label>
                  <Input
                    id="workspace-url"
                    value={workspaceBaseUrl}
                    onChange={(e) => setWorkspaceBaseUrl(e.target.value)}
                    placeholder="https://your-domain.atlassian.net"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-user">Jira username</Label>
                  <Input
                    id="workspace-user"
                    value={workspaceUsername}
                    onChange={(e) => setWorkspaceUsername(e.target.value)}
                    placeholder="your-email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-token">Jira API token</Label>
                  <Input
                    id="workspace-token"
                    type="password"
                    value={workspaceApiToken}
                    onChange={(e) => setWorkspaceApiToken(e.target.value)}
                    placeholder="Paste Jira API token"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void onCreateWorkspace()}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Save Workspace
                </Button>
                <Button variant="outline" onClick={() => void refreshWorkspaces()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  disabled={!selectedWorkspace}
                  onClick={() => void onDeleteWorkspace()}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              </div>

              <Separator />

              {/* Workspace selector */}
              <div className="space-y-2">
                <Label htmlFor="workspace-select">Active workspace</Label>
                <select
                  id="workspace-select"
                  value={selectedWorkspaceId}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Choose workspace...</option>
                  {workspaces.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.workspaceName} ({entry.jiraUsername})
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Token Creation */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Issue Workspace Token</CardTitle>
              </div>
              <CardDescription>
                Generate scoped MCP tokens without passing Jira headers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="token-name">Token name</Label>
                  <Input
                    id="token-name"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token-days">Expires in days</Label>
                  <Input
                    id="token-days"
                    type="number"
                    min={0}
                    max={365}
                    disabled={neverExpires}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value || 30))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="never-expires"
                  checked={neverExpires}
                  onCheckedChange={(checked) => setNeverExpires(checked === true)}
                />
                <Label htmlFor="never-expires" className="cursor-pointer">
                  Never expires
                </Label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void onCreateToken()}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create Token
                </Button>
                <Button variant="outline" onClick={() => void refreshTokens()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Refresh
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => void copyToken()}>
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy token to clipboard</TooltipContent>
                </Tooltip>
              </div>

              {/* Token display */}
              {token && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="token-output">Latest token</Label>
                    <div className="flex gap-2">
                      <Input
                        id="token-output"
                        type={showToken ? "text" : "password"}
                        value={token}
                        readOnly
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Issued Tokens List */}
          {tokens.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Issued Tokens</CardTitle>
                <CardDescription>
                  {tokens.length} token{tokens.length !== 1 ? "s" : ""} issued
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tokens.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.tokenName}</span>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {entry.tokenPrefix}
                          </Badge>
                          {entry.revokedAt && <Badge variant="destructive">Revoked</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Workspace: {entry.workspaceName || "(unscoped)"}</span>
                          <span>Created: {entry.createdAt}</span>
                          <span>Expires: {entry.expiresAt || "never"}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={entry.revokedAt !== null}
                        onClick={() => void onRevoke(entry.id)}
                        className="shrink-0"
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
