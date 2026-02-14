import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { RequireAuth } from "@/lib/require-auth";
import { RedirectIfAuth } from "@/lib/redirect-if-auth";
import { PublicLayout } from "@/ui/layouts/public-layout";
import { DashboardLayout } from "@/ui/layouts/dashboard-layout";
import { LandingPage } from "@/ui/pages/landing-page";
import { LoginPage } from "@/ui/pages/login-page";
import { RegisterPage } from "@/ui/pages/register-page";
import { WorkspacesPage } from "@/ui/pages/workspaces-page";
import { TokensPage } from "@/ui/pages/tokens-page";
import { SettingsPage } from "@/ui/pages/settings-page";
import "./styles.css";

const runtimeBasename =
  import.meta.env.VITE_ROUTER_BASENAME ||
  (window.location.pathname.startsWith("/auth") ? "/auth" : "/");

const router = createBrowserRouter(
  [
    // Public routes with top navbar
    {
      element: <PublicLayout />,
      children: [
        {
          index: true,
          element: <LandingPage />,
        },
        {
          path: "login",
          element: (
            <RedirectIfAuth>
              <LoginPage />
            </RedirectIfAuth>
          ),
        },
        {
          path: "register",
          element: (
            <RedirectIfAuth>
              <RegisterPage />
            </RedirectIfAuth>
          ),
        },
      ],
    },
    // Dashboard routes (auth required) with sidebar
    {
      path: "dashboard",
      element: (
        <RequireAuth>
          <DashboardLayout />
        </RequireAuth>
      ),
      children: [
        {
          index: true,
          element: <Navigate to="workspaces" replace />,
        },
        {
          path: "workspaces",
          element: <WorkspacesPage />,
        },
        {
          path: "tokens",
          element: <TokensPage />,
        },
        {
          path: "settings",
          element: <SettingsPage />,
        },
      ],
    },
    // Legacy redirects
    {
      path: "sign-up",
      element: <Navigate to="/register" replace />,
    },
    {
      path: "token",
      element: <Navigate to="/dashboard/tokens" replace />,
    },
    {
      path: "mcp-test",
      element: <Navigate to="/dashboard/settings" replace />,
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
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </AuthProvider>
  </React.StrictMode>,
);
