type D1PreparedStatementLike = {
  bind(...values: unknown[]): {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<unknown>;
  };
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

type RegisterPayload = {
  email: string;
  password: string;
};

type LoginPayload = {
  email: string;
  password: string;
  tokenName?: string;
  expiresInDays?: number;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
};

type TokenValidationRow = {
  token_id: string;
  user_id: string;
  email: string;
};

export type UserAuthContext = {
  type: "user";
  userId: string;
  email: string;
  tokenId: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_TOKEN_TTL_DAYS = 30;
const MAX_TOKEN_TTL_DAYS = 365;
const PASSWORD_HASH_ITERATIONS = 100000;

export class WorkerAuthService {
  constructor(private readonly db?: D1DatabaseLike) {}

  isConfigured(): boolean {
    return !!this.db;
  }

  async handleAuthRequest(request: Request): Promise<Response | null> {
    const url = new URL(request.url);

    if (url.pathname === "/auth/register") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }
      return this.register(request);
    }

    if (url.pathname === "/auth/login") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }
      return this.login(request);
    }

    return null;
  }

  async validateUserToken(token: string): Promise<UserAuthContext | null> {
    if (!this.db) {
      return null;
    }

    const tokenHash = await hashToken(token);
    const now = nowIso();

    const row = await this.db
      .prepare(
        `
          SELECT
            t.id AS token_id,
            t.user_id AS user_id,
            u.email AS email
          FROM api_tokens t
          INNER JOIN users u ON u.id = t.user_id
          WHERE
            t.token_hash = ?
            AND t.revoked_at IS NULL
            AND (t.expires_at IS NULL OR t.expires_at > ?)
          LIMIT 1
        `,
      )
      .bind(tokenHash, now)
      .first<TokenValidationRow>();

    if (!row) {
      return null;
    }

    await this.db
      .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
      .bind(now, row.token_id)
      .run();

    return {
      type: "user",
      userId: row.user_id,
      email: row.email,
      tokenId: row.token_id,
    };
  }

  private async register(request: Request): Promise<Response> {
    if (!this.db) {
      return jsonResponse(503, {
        error: "Auth is not configured. Bind a D1 database before using /auth routes.",
      });
    }

    const payload = await readJson<RegisterPayload>(request);
    if (!payload.ok) {
      return jsonResponse(400, { error: payload.error });
    }

    const email = payload.value.email?.trim().toLowerCase();
    const password = payload.value.password ?? "";

    if (!email || !EMAIL_REGEX.test(email)) {
      return jsonResponse(400, { error: "A valid email is required." });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(400, {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    const existingUser = await this.db
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first<{ id: string }>();

    if (existingUser) {
      return jsonResponse(409, {
        error: "A user with this email already exists.",
      });
    }

    const userId = crypto.randomUUID();
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(password, salt);
    const createdAt = nowIso();

    await this.db
      .prepare(
        `
          INSERT INTO users (id, email, password_hash, password_salt, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(userId, email, passwordHash, salt, createdAt)
      .run();

    return jsonResponse(201, {
      userId,
      email,
      message: "User registered successfully.",
    });
  }

  private async login(request: Request): Promise<Response> {
    if (!this.db) {
      return jsonResponse(503, {
        error: "Auth is not configured. Bind a D1 database before using /auth routes.",
      });
    }

    const payload = await readJson<LoginPayload>(request);
    if (!payload.ok) {
      return jsonResponse(400, { error: payload.error });
    }

    const email = payload.value.email?.trim().toLowerCase();
    const password = payload.value.password ?? "";

    if (!email || !password) {
      return jsonResponse(400, {
        error: "Both email and password are required.",
      });
    }

    const user = await this.db
      .prepare("SELECT id, email, password_hash, password_salt FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first<UserRow>();

    if (!user) {
      return jsonResponse(401, { error: "Invalid email or password." });
    }

    const computedHash = await hashPassword(password, user.password_salt);
    if (!timingSafeEqual(computedHash, user.password_hash)) {
      return jsonResponse(401, { error: "Invalid email or password." });
    }

    const tokenPlainText = `mcp_${randomBase64Url(32)}`;
    const tokenHash = await hashToken(tokenPlainText);
    const tokenId = crypto.randomUUID();
    const createdAt = nowIso();
    const requestedTtlDays = payload.value.expiresInDays;
    const ttlDays =
      typeof requestedTtlDays === "number"
        ? Math.max(1, Math.min(MAX_TOKEN_TTL_DAYS, Math.floor(requestedTtlDays)))
        : DEFAULT_TOKEN_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const tokenPrefix = tokenPlainText.slice(0, 12);
    const tokenName = payload.value.tokenName?.trim() || "default";

    await this.db
      .prepare(
        `
          INSERT INTO api_tokens (
            id,
            user_id,
            token_name,
            token_prefix,
            token_hash,
            created_at,
            expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(tokenId, user.id, tokenName, tokenPrefix, tokenHash, createdAt, expiresAt)
      .run();

    return jsonResponse(200, {
      token: tokenPlainText,
      tokenId,
      tokenName,
      tokenPrefix,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  }
}

async function readJson<T>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const value = (await request.json()) as T;
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

function methodNotAllowed(allowedMethods: string[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: allowedMethods.join(", "),
    },
  });
}

function jsonResponse(status: number, payload: unknown): Response {
  return Response.json(payload, { status });
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashPassword(password: string, saltBase64Url: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(base64UrlToBytes(saltBase64Url)),
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
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

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : btoa(String.fromCharCode(...bytes));

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(padded, "base64"));
  }

  const decoded = atob(padded);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
