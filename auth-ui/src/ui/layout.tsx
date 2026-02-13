import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function AuthLayout() {
  const { isAuthenticated, userEmail, logout, isLoading } = useAuth();

  async function onLogout() {
    try {
      await logout();
    } catch {
      // no-op
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="rounded-xl bg-gradient-to-r from-primary to-blue-600 p-6 text-primary-foreground shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Jira MCP Auth Console
                </h1>
                <p className="text-sm text-primary-foreground/80">
                  Register, manage tokens, and test MCP tools
                </p>
              </div>
            </div>
            {isAuthenticated && (
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium">
                  {userEmail}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onLogout()}
                  className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                >
                  <LogOut className="mr-1.5 h-4 w-4" />
                  Logout
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Navigation */}
        <nav
          className="mt-4 flex gap-1 rounded-lg bg-background p-1 shadow-sm border"
          aria-label="Auth navigation"
        >
          <NavLink
            to="/sign-up"
            className={({ isActive }) =>
              cn(
                "flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            Sign Up
          </NavLink>
          <NavLink
            to="/token"
            className={({ isActive }) =>
              cn(
                "flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            Tokens
          </NavLink>
          <NavLink
            to="/mcp-test"
            className={({ isActive }) =>
              cn(
                "flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            MCP Test
          </NavLink>
        </nav>

        <Separator className="my-4" />

        {/* Main Content */}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
