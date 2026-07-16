import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
// audit 2026-07-06 (Batch 3): module-level i18n instance so the global
// mutation-error toast is translated outside React render.
import i18n from "@/lib/i18n";

// Pull a clean, human message out of a failed response. The server returns
// { success:false, error:{ code, message } } (or sometimes { message }), so we
// surface that instead of dumping raw JSON / "400: {…}" at the user.
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const body = await res.clone().json();
      message = body?.error?.message || body?.message ||
        (Array.isArray(body?.error?.issues) ? body.error.issues[0]?.message : undefined) || message;
    } catch {
      try { const t = await res.text(); if (t) message = t; } catch { /* keep statusText */ }
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
      // Safety net: any mutation that does NOT define its own onError surfaces a
      // toast here instead of failing silently. Mutations with their own onError
      // keep that behaviour (TanStack v5 overrides the default, so no double toast).
      onError: (error: unknown) => {
        const message = error instanceof Error && error.message
          ? error.message
          : i18n.t("shell.actionFailedDesc");
        toast({ title: i18n.t("shell.actionFailed"), description: message, variant: "destructive" });
      },
    },
  },
});
