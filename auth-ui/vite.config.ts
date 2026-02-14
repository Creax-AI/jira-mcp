import { fileURLToPath, URL } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:8787";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/api/auth": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/register": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/login": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/me": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/tokens": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/tokens/revoke": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/workspaces": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/auth/workspaces/delete": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/mcp": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/health": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
