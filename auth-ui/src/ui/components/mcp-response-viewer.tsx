import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  AlertTriangle,
  Server,
  Terminal,
  Wrench,
  FileText,
  Zap,
  Hash,
  Type,
  ToggleLeft,
  List,
  Braces,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type McpResponseMethod = "initialize" | "tools/list" | "tools/call" | "error" | "unknown";

export interface McpResponseEntry {
  id: string;
  method: McpResponseMethod;
  payload: unknown;
  timestamp: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Type detection helpers
// ---------------------------------------------------------------------------

function detectMethod(payload: unknown): McpResponseMethod {
  if (!payload || typeof payload !== "object") return "unknown";
  const obj = payload as Record<string, unknown>;

  // JSON-RPC error
  if (obj.error && typeof obj.error === "object") return "error";

  const result = obj.result as Record<string, unknown> | undefined;
  if (!result || typeof result !== "object") return "unknown";

  // initialize — has serverInfo
  if ("serverInfo" in result) return "initialize";

  // tools/list — has tools array
  if ("tools" in result && Array.isArray(result.tools)) return "tools/list";

  // tools/call — has content array
  if ("content" in result && Array.isArray(result.content)) return "tools/call";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Main viewer
// ---------------------------------------------------------------------------

export function McpResponseViewer({ entry }: { entry: McpResponseEntry }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const method = entry.method !== "unknown" ? entry.method : detectMethod(entry.payload);
  const raw = JSON.stringify(entry.payload, null, 2);

  function handleCopy() {
    void navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card>
      {/* Header with metadata */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MethodBadge method={method} />
            <span className="text-xs text-muted-foreground">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {entry.durationMs}ms
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant={showRaw ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setShowRaw(!showRaw)}
            >
              <Code2 className="h-3.5 w-3.5" />
              Raw
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {showRaw ? (
          <RawJsonView json={raw} />
        ) : (
          <StructuredView method={method} payload={entry.payload} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Method badge
// ---------------------------------------------------------------------------

const methodColors: Record<McpResponseMethod, string> = {
  initialize: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "tools/list": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "tools/call": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  unknown: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400",
};

const methodIcons: Record<McpResponseMethod, React.ReactNode> = {
  initialize: <Zap className="h-3 w-3" />,
  "tools/list": <Wrench className="h-3 w-3" />,
  "tools/call": <FileText className="h-3 w-3" />,
  error: <AlertTriangle className="h-3 w-3" />,
  unknown: <Code2 className="h-3 w-3" />,
};

function MethodBadge({ method }: { method: McpResponseMethod }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${methodColors[method]}`}
    >
      {methodIcons[method]}
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Structured view router
// ---------------------------------------------------------------------------

function StructuredView({ method, payload }: { method: McpResponseMethod; payload: unknown }) {
  switch (method) {
    case "initialize":
      return <InitializeView payload={payload} />;
    case "tools/list":
      return <ToolsListView payload={payload} />;
    case "tools/call":
      return <ToolsCallView payload={payload} />;
    case "error":
      return <ErrorView payload={payload} />;
    default:
      return <RawJsonView json={JSON.stringify(payload, null, 2)} />;
  }
}

// ---------------------------------------------------------------------------
// Raw JSON view
// ---------------------------------------------------------------------------

function RawJsonView({ json }: { json: string }) {
  return (
    <div className="max-h-[500px] overflow-auto">
      <pre className="rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
        {json}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initialize view
// ---------------------------------------------------------------------------

function InitializeView({ payload }: { payload: unknown }) {
  const obj = payload as Record<string, unknown>;
  const result = obj?.result as Record<string, unknown> | undefined;
  if (!result) return <RawJsonView json={JSON.stringify(payload, null, 2)} />;

  const serverInfo = result.serverInfo as { name?: string; version?: string } | undefined;
  const protocolVersion = result.protocolVersion as string | undefined;
  const capabilities = result.capabilities as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      {/* Server info */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Server className="mt-0.5 h-5 w-5 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{serverInfo?.name ?? "Unknown Server"}</p>
          <div className="flex flex-wrap gap-2">
            {serverInfo?.version && (
              <Badge variant="secondary" className="text-xs">
                v{serverInfo.version}
              </Badge>
            )}
            {protocolVersion && (
              <Badge variant="outline" className="text-xs">
                Protocol {protocolVersion}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Capabilities */}
      {capabilities && Object.keys(capabilities).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Capabilities
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(capabilities).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="text-sm font-medium">{key}</span>
                {typeof value === "object" && value !== null ? (
                  <Badge variant="secondary" className="text-xs">
                    {Object.keys(value as Record<string, unknown>).length} options
                  </Badge>
                ) : (
                  <Badge variant={value ? "default" : "outline"} className="text-xs">
                    {String(value)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools list view
// ---------------------------------------------------------------------------

interface ToolSchema {
  type?: string;
  properties?: Record<
    string,
    {
      type?: string;
      description?: string;
      enum?: string[];
      default?: unknown;
      items?: { type?: string };
    }
  >;
  required?: string[];
}

interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: ToolSchema;
}

function ToolsListView({ payload }: { payload: unknown }) {
  const obj = payload as Record<string, unknown>;
  const result = obj?.result as { tools?: ToolDef[] } | undefined;
  const tools = result?.tools;

  if (!tools || !Array.isArray(tools)) {
    return <RawJsonView json={JSON.stringify(payload, null, 2)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Registered Tools
        </h4>
        <Badge variant="secondary" className="text-xs">
          {tools.length}
        </Badge>
      </div>

      <div className="max-h-[600px] overflow-y-auto rounded-md pr-1">
        <div className="space-y-2">
          {tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const [open, setOpen] = useState(false);
  const params = tool.inputSchema?.properties ? Object.entries(tool.inputSchema.properties) : [];
  const required = new Set(tool.inputSchema?.required ?? []);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="mt-0.5">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 text-primary" />
                <code className="text-sm font-semibold">{tool.name}</code>
                {params.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {params.length} param{params.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {tool.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {params.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead className="h-7">Parameter</TableHead>
                      <TableHead className="h-7">Type</TableHead>
                      <TableHead className="h-7">Required</TableHead>
                      <TableHead className="h-7">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {params.map(([name, schema]) => (
                      <TableRow key={name} className="text-xs">
                        <TableCell className="py-1.5 font-mono font-medium">{name}</TableCell>
                        <TableCell className="py-1.5">
                          <ParamTypeTag type={schema.type} enumVals={schema.enum} />
                        </TableCell>
                        <TableCell className="py-1.5">
                          {required.has(name) ? (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              required
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">optional</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-muted-foreground max-w-[300px] truncate">
                          {schema.description ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

const typeIcons: Record<string, React.ReactNode> = {
  string: <Type className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  integer: <Hash className="h-3 w-3" />,
  boolean: <ToggleLeft className="h-3 w-3" />,
  array: <List className="h-3 w-3" />,
  object: <Braces className="h-3 w-3" />,
};

function ParamTypeTag({ type, enumVals }: { type?: string; enumVals?: string[] }) {
  if (enumVals && enumVals.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        enum({enumVals.length})
      </span>
    );
  }

  const icon = typeIcons[type ?? ""] ?? null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      {type ?? "any"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tools/call view
// ---------------------------------------------------------------------------

function ToolsCallView({ payload }: { payload: unknown }) {
  const obj = payload as Record<string, unknown>;
  const result = obj?.result as
    | {
        content?: Array<{ type: string; text?: string }>;
      }
    | undefined;
  const content = result?.content;

  if (!content || !Array.isArray(content) || content.length === 0) {
    return <RawJsonView json={JSON.stringify(payload, null, 2)} />;
  }

  return (
    <div className="space-y-3">
      {content.map((item, idx) => (
        <ContentBlock key={idx} item={item} index={idx} total={content.length} />
      ))}
    </div>
  );
}

function ContentBlock({
  item,
  index,
  total,
}: {
  item: { type: string; text?: string };
  index: number;
  total: number;
}) {
  if (item.type !== "text" || !item.text) {
    return <RawJsonView json={JSON.stringify(item, null, 2)} />;
  }

  // Try parsing the text as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(item.text);
  } catch {
    // Plain text
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        {total > 1 && (
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Content {index + 1}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm">{item.text}</p>
      </div>
    );
  }

  // If it's an array of objects, try rendering as a table
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
    return <SmartDataTable data={parsed as Record<string, unknown>[]} />;
  }

  // Single object — render as key/value
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return <KeyValueCard data={parsed as Record<string, unknown>} />;
  }

  // Fallback to raw
  return <RawJsonView json={JSON.stringify(parsed, null, 2)} />;
}

// ---------------------------------------------------------------------------
// Smart data table (for arrays of objects like projects)
// ---------------------------------------------------------------------------

function SmartDataTable({ data }: { data: Record<string, unknown>[] }) {
  // Derive columns from all object keys
  const columnSet = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }
  const columns = Array.from(columnSet);

  // Prioritize some common columns
  const priority = ["key", "name", "id", "summary", "status", "type", "lead"];
  columns.sort((a, b) => {
    const ai = priority.indexOf(a.toLowerCase());
    const bi = priority.indexOf(b.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // If too many columns, limit to first 8 and mark truncated
  const maxCols = 8;
  const displayCols = columns.slice(0, maxCols);
  const truncatedCols = columns.length > maxCols;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Results
        </h4>
        <Badge variant="secondary" className="text-xs">
          {data.length} {data.length === 1 ? "item" : "items"}
        </Badge>
        {truncatedCols && (
          <Badge variant="outline" className="text-[10px]">
            showing {maxCols}/{columns.length} columns
          </Badge>
        )}
      </div>

      <div className="max-h-[400px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {displayCols.map((col) => (
                <TableHead key={col} className="text-xs capitalize">
                  {formatColumnName(col)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                {displayCols.map((col) => (
                  <TableCell key={col} className="py-2 text-xs">
                    <CellValue value={row[col]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Badge variant={value ? "default" : "outline"} className="text-[10px]">
        {String(value)}
      </Badge>
    );
  }
  if (typeof value === "object") {
    return (
      <code className="text-[11px] text-muted-foreground">
        {JSON.stringify(value).slice(0, 60)}
        {JSON.stringify(value).length > 60 ? "..." : ""}
      </code>
    );
  }
  return <span>{String(value)}</span>;
}

function formatColumnName(col: string): string {
  // camelCase / snake_case → Title Case
  return col
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

// ---------------------------------------------------------------------------
// Key-value card (for single object results)
// ---------------------------------------------------------------------------

function KeyValueCard({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  return (
    <div className="rounded-lg border">
      <div className="divide-y">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-4 px-4 py-2">
            <span className="min-w-[120px] shrink-0 text-xs font-medium text-muted-foreground">
              {formatColumnName(key)}
            </span>
            <span className="text-xs">
              {typeof value === "object" && value !== null ? (
                <code className="text-[11px]">{JSON.stringify(value, null, 2)}</code>
              ) : (
                String(value ?? "—")
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error view
// ---------------------------------------------------------------------------

function ErrorView({ payload }: { payload: unknown }) {
  const obj = payload as Record<string, unknown>;
  const error = obj?.error as
    | {
        code?: number;
        message?: string;
        data?: unknown;
      }
    | undefined;

  if (!error) return <RawJsonView json={JSON.stringify(payload, null, 2)} />;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-destructive">
              {error.message ?? "Unknown error"}
            </p>
            {error.code !== undefined && (
              <Badge
                variant="outline"
                className="text-[10px] text-destructive border-destructive/30"
              >
                Code {error.code}
              </Badge>
            )}
          </div>
          {error.data != null ? (
            <pre className="mt-2 rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
              {JSON.stringify(error.data, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder view for empty state
// ---------------------------------------------------------------------------

export function McpResponsePlaceholder() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Terminal className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No response yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Paste a token and click Initialize to get started.
        </p>
      </CardContent>
    </Card>
  );
}
