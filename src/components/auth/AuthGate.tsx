import { useEffect, useState, type ReactNode } from "react";

import { isSupabaseBackend } from "@/lib/backend-config";
import { getValidRemoteSession } from "@/services/auth.service";

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "authenticated" | "anonymous">(
    isSupabaseBackend() ? "checking" : "authenticated",
  );

  useEffect(() => {
    if (!isSupabaseBackend()) {
      setState("authenticated");
      return;
    }
    let active = true;
    void getValidRemoteSession().then((session) => {
      if (!active) return;
      setState(session ? "authenticated" : "anonymous");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state !== "anonymous" || typeof window === "undefined") return;
    const redirect = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
  }, [state]);

  if (state !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="mt-3 text-sm text-muted-foreground">
            {state === "checking" ? "جارٍ التحقق من الجلسة…" : "جارٍ تحويلك لتسجيل الدخول…"}
          </p>
        </div>
      </div>
    );
  }

  return children;
}
