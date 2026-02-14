import { Link, Outlet, useNavigate } from "react-router-dom";
import { Zap, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function PublicLayout() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Jira MCP
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button onClick={() => void navigate("/dashboard")} size="sm">
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate("/login")}
                >
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Sign In
                </Button>
                <Button size="sm" onClick={() => void navigate("/register")}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Get Started
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-6xl px-4">
          Jira MCP Server &middot; Secure workspace tokens for AI-powered Jira
          access
        </div>
      </footer>
    </div>
  );
}
