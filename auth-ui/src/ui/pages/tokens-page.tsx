import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Ban,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AuthTokenInfo,
  JiraWorkspaceInfo,
  createToken,
  listTokens,
  listWorkspaces,
  revokeToken,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

export function TokensPage() {
  const [tokens, setTokens] = useState<AuthTokenInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<JiraWorkspaceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [tokenName, setTokenName] = useState("workspace-token");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [neverExpires, setNeverExpires] = useState(false);

  // Created token state
  const [createdToken, setCreatedToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const refreshTokens = useCallback(async () => {
    try {
      const response = await listTokens();
      setTokens(response.tokens);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tokens.");
    }
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const response = await listWorkspaces();
      setWorkspaces(response.workspaces);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load workspaces.");
    }
  }, []);

  useEffect(() => {
    void Promise.all([refreshTokens(), refreshWorkspaces()]).finally(() => setIsLoading(false));
  }, [refreshTokens, refreshWorkspaces]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      toast.error("Select a workspace to scope this token.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await createToken(
        undefined,
        tokenName,
        expiresInDays,
        neverExpires,
        selectedWorkspaceId,
      );
      setCreatedToken(response.token);
      setShowToken(true);
      toast.success("Token created successfully.");
      await refreshTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token.");
    } finally {
      setIsCreating(false);
    }
  }

  async function onRevoke(tokenId: string) {
    try {
      await revokeToken(undefined, tokenId);
      toast.success("Token revoked.");
      await refreshTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token.");
    }
  }

  async function copyToClipboard() {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    toast.success("Token copied to clipboard.");
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const revokedTokens = tokens.filter((t) => t.revokedAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Tokens</h1>
          <p className="text-sm text-muted-foreground">
            Issue and manage workspace-scoped bearer tokens for MCP clients.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshTokens()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={workspaces.length === 0}>
                <Plus className="mr-1.5 h-4 w-4" />
                Create Token
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create API Token</DialogTitle>
                <DialogDescription>
                  Generate a bearer token scoped to a Jira workspace. MCP clients use this token
                  instead of raw Jira credentials.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tk-workspace">Workspace</Label>
                  <select
                    id="tk-workspace"
                    required
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select workspace...</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.workspaceName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tk-name">Token Name</Label>
                  <Input
                    id="tk-name"
                    required
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tk-days">Expires in (days)</Label>
                    <Input
                      id="tk-days"
                      type="number"
                      min={1}
                      max={365}
                      disabled={neverExpires}
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(Number(e.target.value || 30))}
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="tk-no-expire"
                        checked={neverExpires}
                        onCheckedChange={(checked) => setNeverExpires(checked === true)}
                      />
                      <Label htmlFor="tk-no-expire" className="cursor-pointer">
                        Never expires
                      </Label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Token"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Newly created token display */}
      {createdToken && (
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CardContent className="flex items-center gap-4 py-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">
                Token created! Copy it now &mdash; you won&apos;t see it again.
              </p>
              <div className="flex gap-2">
                <Input
                  type={showToken ? "text" : "password"}
                  value={createdToken}
                  readOnly
                  className="flex-1 font-mono text-sm bg-background"
                />
                <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={() => void copyToClipboard()}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No workspaces notice */}
      {!isLoading && workspaces.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-1 text-lg font-semibold">Create a workspace first</h3>
            <p className="mb-4 max-w-sm text-sm text-muted-foreground">
              You need at least one Jira workspace before you can issue tokens.
            </p>
            <Button variant="outline" asChild>
              <a href="/dashboard/workspaces">Go to Workspaces</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Active tokens */}
      {!isLoading && activeTokens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Tokens ({activeTokens.length})</CardTitle>
            <CardDescription>Bearer tokens currently valid for MCP authentication.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        {t.tokenName}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.workspaceName || "(unscoped)"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {t.tokenPrefix}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(t.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(t.expiresAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void onRevoke(t.id)}
                      >
                        <Ban className="mr-1 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Revoked tokens */}
      {!isLoading && revokedTokens.length > 0 && (
        <>
          <Separator />
          <Card className="opacity-60">
            <CardHeader>
              <CardTitle className="text-lg">Revoked Tokens ({revokedTokens.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Revoked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revokedTokens.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium line-through">{t.tokenName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.workspaceName || "(unscoped)"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {t.tokenPrefix}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">
                          Revoked {formatDate(t.revokedAt)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty state */}
      {!isLoading && tokens.length === 0 && workspaces.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-1 text-lg font-semibold">No tokens yet</h3>
            <p className="mb-4 max-w-sm text-sm text-muted-foreground">
              Create your first API token to start using MCP with your Jira workspace.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create Token
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
