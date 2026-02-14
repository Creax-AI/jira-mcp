import { createContext, useContext, type ReactNode } from "react";
import { authClient } from "./auth-client";

type AuthContextType = {
  isAuthenticated: boolean;
  userEmail: string;
  userId: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending, refetch } = authClient.useSession();

  async function signIn(email: string, password: string) {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      throw new Error(result.error.message || "Failed to sign in.");
    }

    await refetch();
  }

  async function signUp(name: string, email: string, password: string) {
    const result = await authClient.signUp.email({
      name,
      email,
      password,
    });

    if (result.error) {
      throw new Error(result.error.message || "Failed to create account.");
    }

    await refetch();
  }

  async function logout() {
    const result = await authClient.signOut();
    if (result.error) {
      throw new Error(result.error.message || "Failed to sign out.");
    }

    await refetch();
  }

  const isAuthenticated = Boolean(data?.session && data?.user);
  const userEmail = data?.user?.email || "";
  const userId = data?.user?.id || "";

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        userEmail,
        userId,
        signIn,
        signUp,
        logout,
        isLoading: isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
