import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { Loader2 } from "lucide-react";

interface RedirectIfAuthProps {
  children: ReactNode;
}

export function RedirectIfAuth({ children }: RedirectIfAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
