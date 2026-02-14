import { createAuthClient } from "better-auth/react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_PROXY_TARGET ||
  (import.meta.env.DEV ? "http://localhost:8787" : window.location.origin);
const normalizedBaseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

export const authClient = createAuthClient({
  baseURL: normalizedBaseUrl,
});
