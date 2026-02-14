import { useNavigate } from "react-router-dom";
import { Zap, Shield, Globe, Key, ArrowRight, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const features = [
  {
    icon: Globe,
    title: "Jira Workspaces",
    description:
      "Connect multiple Jira Cloud instances. Your credentials are stored securely server-side and never exposed to MCP clients.",
  },
  {
    icon: Key,
    title: "Scoped API Tokens",
    description:
      "Issue workspace-scoped bearer tokens with configurable expiry. Revoke access instantly without changing your Jira credentials.",
  },
  {
    icon: Shield,
    title: "Secure by Design",
    description:
      "MCP clients only see a bearer token. Jira credentials are resolved server-side, keeping your API tokens out of client configurations.",
  },
  {
    icon: Terminal,
    title: "MCP Protocol Native",
    description:
      "Built for the Model Context Protocol. Compatible with Claude, Cursor, and any MCP-enabled AI assistant out of the box.",
  },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-sm">
              <Zap className="h-3.5 w-3.5 text-primary" />
              MCP-native Jira integration
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Secure Jira access
              <br />
              <span className="text-primary">for AI assistants</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Manage Jira workspace tokens for MCP servers. Your credentials
              stay on the server &mdash; AI clients only get scoped bearer
              tokens.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              {isAuthenticated ? (
                <Button size="lg" onClick={() => void navigate("/dashboard")}>
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={() => void navigate("/register")}>
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => void navigate("/login")}
                  >
                    Sign In
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <p className="mt-3 text-muted-foreground">
              Connect your Jira, issue tokens, and let AI assistants do the
              rest.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border bg-background p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick start snippet */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready in 3 steps
            </h2>
            <div className="mt-10 space-y-4 text-left">
              <div className="flex gap-4 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  1
                </div>
                <div>
                  <p className="font-medium">Create an account</p>
                  <p className="text-sm text-muted-foreground">
                    Sign up and add your Jira workspace credentials.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </div>
                <div>
                  <p className="font-medium">Issue a scoped token</p>
                  <p className="text-sm text-muted-foreground">
                    Generate a bearer token tied to your workspace with optional
                    expiry.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  3
                </div>
                <div>
                  <p className="font-medium">Configure your MCP client</p>
                  <p className="text-sm text-muted-foreground">
                    Add the token to Claude, Cursor, or any MCP client. Your
                    Jira credentials never leave the server.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
