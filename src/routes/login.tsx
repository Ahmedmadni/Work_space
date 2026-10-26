import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LockKeyhole, Mail, UserRound } from "lucide-react";

import { BACKEND_CONFIG, isSupabaseBackend } from "@/lib/backend-config";
import {
  getValidRemoteSession,
  signInWithPassword,
  signUpWithPassword,
} from "@/services/auth.service";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — ProjectFlow" },
      { property: "og:title", content: "تسجيل الدخول — ProjectFlow" },
      { property: "og:description", content: "تسجيل الدخول إلى حسابك في ProjectFlow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "تسجيل الدخول إلى ProjectFlow." },
    ],
  }),
  component: LoginPage,
});

function safeRedirect(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginPage() {
  const { redirect } = Route.useSearch();
  const destination = useMemo(() => safeRedirect(redirect), [redirect]);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseBackend()) {
      window.location.replace("/");
      return;
    }
    void getValidRemoteSession().then((session) => {
      if (session) window.location.replace(destination);
    });
  }, [destination]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!email.trim() || !password) {
      setError("أدخل البريد الإلكتروني وكلمة المرور.");
      return;
    }
    if (mode === "signup") {
      if (!fullName.trim()) {
        setError("أدخل الاسم.");
        return;
      }
      if (password.length < 8) {
        setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
        return;
      }
      if (password !== confirmPassword) {
        setError("تأكيد كلمة المرور غير مطابق.");
        return;
      }
    }

    setPending(true);
    try {
      if (mode === "signin") {
        await signInWithPassword(email, password);
        window.location.replace(destination);
      } else {
        const result = await signUpWithPassword(email, password, fullName);
        if (result.session) {
          window.location.replace(destination);
        } else if (result.requiresEmailConfirmation) {
          setMessage("تم إنشاء الحساب. افتح بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.");
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
        } else {
          setMessage("تم إرسال طلب إنشاء الحساب. أكمل خطوات التحقق ثم سجّل الدخول.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إكمال العملية.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="canvas-grid flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift sm:p-8">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand text-xl font-bold text-primary-foreground">
          ب
        </div>
        <div className="mt-5 text-center">
          <h1 className="text-2xl font-bold">ProjectFlow</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin" ? "سجّل الدخول إلى مشاريعك ولوحاتك." : "أنشئ حسابًا جديدًا وابدأ مشروعك."}
          </p>
        </div>

        {!BACKEND_CONFIG.supabaseConfigured && (
          <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            إعداد Supabase غير مكتمل في متغيرات البيئة.
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setMessage(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "signin" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setMessage(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            حساب جديد
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted-foreground">الاسم</span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-sm outline-none focus:border-brand"
                  placeholder="اسمك"
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">البريد الإلكتروني</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-sm outline-none focus:border-brand"
                placeholder="name@example.com"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">كلمة المرور</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-sm outline-none focus:border-brand"
                placeholder="••••••••"
              />
            </div>
          </label>

          {mode === "signup" && (
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted-foreground">تأكيد كلمة المرور</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
                placeholder="••••••••"
              />
            </label>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !BACKEND_CONFIG.supabaseConfigured}
            className="mt-2 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "جارٍ التنفيذ…" : mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>
      </div>
    </div>
  );
}
