const INTERNAL_SIGNATURE_HEADER = "x-mcp-internal-signature";
const INTERNAL_TIMESTAMP_HEADER = "x-mcp-internal-timestamp";
const INTERNAL_VERSION_HEADER = "x-mcp-internal-version";
const INTERNAL_SIGNATURE_VERSION = "v1";
const INTERNAL_SIGNATURE_MAX_AGE_MS = 2 * 60 * 1000;

type InternalSigningEnv = {
  MCP_INTERNAL_SIGNING_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_TOKENS?: string;
};

const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

export function resolveInternalSigningSecret(env: InternalSigningEnv): string | null {
  const explicitSecret = env.MCP_INTERNAL_SIGNING_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  const authSecret = env.BETTER_AUTH_SECRET?.trim();
  if (authSecret) {
    return authSecret;
  }

  const primaryToken = env.MCP_AUTH_TOKEN?.trim();
  if (primaryToken) {
    return primaryToken;
  }

  const fallbackToken = env.MCP_AUTH_TOKENS?.split(",")
    .map((token) => token.trim())
    .find((token) => token.length > 0);

  return fallbackToken || null;
}

export async function signWorkerToDoRequest(request: Request, secret: string): Promise<Request> {
  const headers = new Headers(request.headers);
  const timestamp = Date.now().toString();

  headers.set(INTERNAL_TIMESTAMP_HEADER, timestamp);
  headers.set(INTERNAL_VERSION_HEADER, INTERNAL_SIGNATURE_VERSION);

  const signature = await createInternalSignature(request, headers, timestamp, secret);
  headers.set(INTERNAL_SIGNATURE_HEADER, signature);

  return new Request(request, { headers });
}

export async function verifyWorkerToDoRequestSignature(
  request: Request,
  secret: string,
): Promise<boolean> {
  const timestamp = request.headers.get(INTERNAL_TIMESTAMP_HEADER)?.trim();
  const providedSignature = request.headers.get(INTERNAL_SIGNATURE_HEADER)?.trim();
  const version = request.headers.get(INTERNAL_VERSION_HEADER)?.trim();

  if (!timestamp || !providedSignature || version !== INTERNAL_SIGNATURE_VERSION) {
    return false;
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Math.abs(Date.now() - timestampMs) > INTERNAL_SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const expectedSignature = await createInternalSignature(
    request,
    request.headers,
    timestamp,
    secret,
  );
  return timingSafeEqual(providedSignature, expectedSignature);
}

async function createInternalSignature(
  request: Request,
  headers: Headers,
  timestamp: string,
  secret: string,
): Promise<string> {
  const url = new URL(request.url);
  const sessionId = getSessionId(headers, url);
  const bodyHash = await hashRequestBody(request);
  const parts = [
    INTERNAL_SIGNATURE_VERSION,
    request.method.toUpperCase(),
    url.pathname,
    url.search,
    sessionId,
    headers.get("x-auth-user-id")?.trim() || "",
    headers.get("x-auth-user-email")?.trim() || "",
    headers.get("x-auth-token-id")?.trim() || "",
    headers.get("x-auth-workspace-id")?.trim() || "",
    headers.get("x-jira-base-url")?.trim() || "",
    headers.get("x-jira-username")?.trim() || "",
    headers.get("x-jira-api-token")?.trim() || "",
    timestamp,
    bodyHash,
  ];

  return hmacSha256Base64Url(secret, parts.join("\n"));
}

async function hashRequestBody(request: Request): Promise<string> {
  const bodyBytes = new Uint8Array(await request.clone().arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bodyBytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function getSessionId(headers: Headers, url: URL): string {
  const headerValue =
    headers.get("mcp-session-id")?.trim() || headers.get("x-mcp-session-id")?.trim() || "";
  if (headerValue) {
    return headerValue;
  }

  const queryValue = url.searchParams.get("sessionId")?.trim();
  return queryValue || "";
}

async function hmacSha256Base64Url(secret: string, value: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function getHmacKey(secret: string): Promise<CryptoKey> {
  let key = hmacKeyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    hmacKeyCache.set(secret, key);
  }

  return key;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : btoa(String.fromCharCode(...bytes));

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return result === 0;
}
