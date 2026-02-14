import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = "/mcp-test" }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return <Navigate to={redirectTo} replace />;
}
