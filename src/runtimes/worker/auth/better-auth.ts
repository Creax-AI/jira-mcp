import type { D1DatabaseLike } from "../auth-service";
import * as generatedSchema from "./schema.generated";

const betterAuthSchema = {
  ...generatedSchema,
  user: generatedSchema.auth_users,
  session: generatedSchema.auth_sessions,
  account: generatedSchema.auth_accounts,
  verification: generatedSchema.auth_verifications,
};

type BetterAuthLike = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<unknown>;
  };
};

type BetterAuthPasswordModule = {
  verifyPassword(input: { hash: string; password: string }): Promise<boolean>;
};

type BetterAuthUser = {
  userId: string;
  email: string;
};

const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const DEPLOYED_TRUSTED_ORIGINS = [
  "https://jira-mcp-server.creax-ai.com",
  "https://jira-context-mcp.contacto-80f.workers.dev",
  "https://jira-context-mcp-preview.contacto-80f.workers.dev",
];
const EDGE_PASSWORD_HASH_SCHEME = "pbkdf2_sha256";
const EDGE_PASSWORD_HASH_ITERATIONS = 1000;
const EDGE_PASSWORD_HASH_SALT_BYTES = 16;

let cachedAuthPromise: Promise<BetterAuthLike> | null = null;
let cachedAuthSecret = "";

export async function handleBetterAuthRequest(
  request: Request,
  db: D1DatabaseLike | undefined,
  secret: string | undefined,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/auth")) {
    return null;
  }

  if (!db || !secret) {
    return Response.json(
      {
        error:
          "Better Auth is not configured. Missing AUTH_DB or BETTER_AUTH_SECRET.",
      },
      { status: 503 },
    );
  }

  const auth = await getAuthInstance(db, secret);
  return auth.handler(request);
}

export async function resolveBetterAuthUserFromRequest(
  request: Request,
  db: D1DatabaseLike | undefined,
  secret: string | undefined,
): Promise<BetterAuthUser | null> {
  if (!db || !secret) {
    return null;
  }

  const auth = await getAuthInstance(db, secret);
  const session = (await auth.api.getSession({ headers: request.headers })) as {
    user?: { id?: string; email?: string };
  } | null;

  const userId = session?.user?.id?.trim();
  const email = session?.user?.email?.trim();
  if (!userId || !email) {
    return null;
  }

  return {
    userId,
    email,
  };
}

async function getAuthInstance(
  db: D1DatabaseLike,
  secret: string,
): Promise<BetterAuthLike> {
  if (cachedAuthPromise && cachedAuthSecret === secret) {
    return cachedAuthPromise;
  }

  cachedAuthSecret = secret;
  cachedAuthPromise = createAuthInstance(db, secret);
  return cachedAuthPromise;
}

async function createAuthInstance(
  db: D1DatabaseLike,
  secret: string,
): Promise<BetterAuthLike> {
  const [{ betterAuth }, { drizzleAdapter }, { drizzle }, passwordModule] =
    await Promise.all([
      import("better-auth"),
      import("better-auth/adapters/drizzle"),
      import("drizzle-orm/d1"),
      import("better-auth/crypto") as Promise<BetterAuthPasswordModule>,
    ]);

  const drizzleDb = drizzle(db as never, { schema: betterAuthSchema });

  const auth = betterAuth({
    secret,
    basePath: "/api/auth",
    user: {
      modelName: "auth_users",
    },
    session: {
      modelName: "auth_sessions",
    },
    account: {
      modelName: "auth_accounts",
    },
    verification: {
      modelName: "auth_verifications",
    },
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      schema: betterAuthSchema,
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      password: {
        hash: (password: string) => hashEdgePassword(password, secret),
        verify: async ({
          hash,
          password,
        }: {
          hash: string;
          password: string;
        }) => {
          if (isEdgePasswordHash(hash)) {
            return verifyEdgePasswordHash(hash, password, secret);
          }

          return passwordModule.verifyPassword({ hash, password });
        },
      },
    },
    trustedOrigins: [...DEFAULT_TRUSTED_ORIGINS, ...DEPLOYED_TRUSTED_ORIGINS],
  });

  return auth as BetterAuthLike;
}

function isEdgePasswordHash(hash: string): boolean {
  return hash.startsWith(`${EDGE_PASSWORD_HASH_SCHEME}$`);
}

async function hashEdgePassword(
  password: string,
  secret: string,
): Promise<string> {
  const salt = randomBase64Url(EDGE_PASSWORD_HASH_SALT_BYTES);
  const digest = await derivePbkdf2Digest(
    password,
    secret,
    salt,
    EDGE_PASSWORD_HASH_ITERATIONS,
  );
  return `${EDGE_PASSWORD_HASH_SCHEME}$${EDGE_PASSWORD_HASH_ITERATIONS}$${salt}$${digest}`;
}

async function verifyEdgePasswordHash(
  hash: string,
  password: string,
  secret: string,
): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4) {
    return false;
  }

  const [scheme, iterationsRaw, salt, expectedDigest] = parts;
  if (scheme !== EDGE_PASSWORD_HASH_SCHEME || !salt || !expectedDigest) {
    return false;
  }

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const computedDigest = await derivePbkdf2Digest(
    password,
    secret,
    salt,
    iterations,
  );
  return timingSafeEqual(computedDigest, expectedDigest);
}

async function derivePbkdf2Digest(
  password: string,
  secret: string,
  saltBase64Url: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}\u0000${secret}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(base64UrlToBytes(saltBase64Url)),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
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
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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
