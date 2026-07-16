import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type InsertUser, type User } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: ReturnType<typeof useLoginMutation>;
  registerMutation: ReturnType<typeof useRegisterMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
};

const AuthContext = createContext<AuthContextType | null>(null);

function useLoginMutation() {
  return useMutation({
    mutationFn: async (credentials: Pick<InsertUser, "username" | "password">) => {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      // HTIS BUG-001 — dashboard was showing stale data (blank username /
      // email) until manual refresh. Root cause: anonymous queries like
      // /candidates/profile, /jobs/saved/my etc. were cached at 401 from
      // landing-page fetches; invalidating only `auth/me` left them stale.
      //
      // Seed the user cache synchronously from the login response so the
      // redirect target renders with user data on first paint, then drop
      // every other cached entry so identity-scoped queries refetch fresh.
      const user = data?.data ?? null;
      if (user) queryClient.setQueryData(["/api/v1/auth/me"], { success: true, data: user });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "/api/v1/auth/me" });
    },
  });
}

function useRegisterMutation() {
  return useMutation({
    mutationFn: async (data: InsertUser) => {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: () => {
      // Clear any previous user's cached queries (staleTime is Infinity) so a
      // fresh registration never renders the prior account's profile/apps.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "/api/v1/auth/me" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/me"] });
    },
  });
}

function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/v1/auth/me"], { success: false });
      // Drop the previous user's cached data so it can't bleed into the next
      // session (e.g. switching demo accounts without a full reload).
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "/api/v1/auth/me" });
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["/api/v1/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/v1/auth/me");
      if (!res.ok) return { success: false, data: null };
      return res.json();
    },
    retry: false,
  });

  const user = data?.data || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error: error as Error | null,
        loginMutation: useLoginMutation(),
        registerMutation: useRegisterMutation(),
        logoutMutation: useLogoutMutation(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
