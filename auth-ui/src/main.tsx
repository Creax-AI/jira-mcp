import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/lib/protected-route";
import { AuthLayout } from "@/ui/layout";
import { LoginPage } from "@/ui/login-page";
import { RegisterPage } from "@/ui/register-page";
import { McpTestPage } from "@/ui/mcp-test-page";
import "./styles.css";

const runtimeBasename =
  import.meta.env.VITE_ROUTER_BASENAME ||
  (window.location.pathname.startsWith("/auth") ? "/auth" : "/");

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AuthLayout />,
      children: [
        {
          index: true,
          element: (
            <ProtectedRoute redirectTo="/token">
              <Navigate to="/sign-up" replace />
            </ProtectedRoute>
          ),
        },
        {
          path: "sign-up",
          element: (
            <ProtectedRoute>
              <RegisterPage />
            </ProtectedRoute>
          ),
        },
        {
          path: "token",
          element: <LoginPage />,
        },
        {
          path: "mcp-test",
          element: <McpTestPage />,
        },
      ],
    },
  ],
  {
    basename: runtimeBasename,
  },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <TooltipProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </TooltipProvider>
    </AuthProvider>
  </React.StrictMode>,
);
