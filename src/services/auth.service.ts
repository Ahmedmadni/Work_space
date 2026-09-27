import { BACKEND_CONFIG, isSupabaseBackend } from "@/lib/backend-config";

const SESSION_KEY = "projectflow.supabase.session.v1";
let refreshInFlight: Promise<RemoteAuthSession | null> | null = null;

export interface RemoteAuthUser {
  id: string;
  email: string | null;
  full_name: string;
}

export interface RemoteAuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: RemoteAuthUser;
}

interface SupabaseAuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id?: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null;
}

function userFromResponse(user: SupabaseAuthResponse["user"]): RemoteAuthUser {
  if (!user?.id) throw new Error("AUTH_INVALID_USER");
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
    full_name:
      metadataName ||
      (typeof user.email === "string" ? user.email.split("@")[0] : "") ||
      "مستخدم",
  };
}

function readStoredSession(): RemoteAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RemoteAuthSession>;
    if (
      typeof value.access_token !== "string" ||
      typeof value.refresh_token !== "string" ||
      typeof value.expires_at !== "number" ||
      !value.user ||
      typeof value.user.id !== "string"
    ) {
      return null;
    }
    return value as RemoteAuthSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: RemoteAuthSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function authRequest<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  if (!BACKEND_CONFIG.supabaseConfigured) throw new Error("SUPABASE_NOT_CONFIGURED");
  const response = await fetch(`${BACKEND_CONFIG.supabaseUrl}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: BACKEND_CONFIG.supabaseAnonKey,
      "Content-Type": "application/json",
      ...(init.accessToken
        ? { Authorization: `Bearer ${init.accessToken}` }
        : {}),
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { msg?: string; message?: string; error_description?: string }
    | T
    | null;

  if (!response.ok) {
    const details = payload as
      | { msg?: string; message?: string; error_description?: string }
      | null;
    throw new Error(
      details?.error_description ||
        details?.msg ||
        details?.message ||
        `AUTH_HTTP_${response.status}`,
    );
  }
  return payload as T;
}

function sessionFromResponse(payload: SupabaseAuthResponse): RemoteAuthSession | null {
  if (
    !payload.access_token ||
    !payload.refresh_token ||
    !payload.expires_in ||
    !payload.user?.id
  ) {
    return null;
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000,
    user: userFromResponse(payload.user),
  };
}

export function getStoredRemoteSession(): RemoteAuthSession | null {
  return isSupabaseBackend() ? readStoredSession() : null;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<RemoteAuthSession> {
  const payload = await authRequest<SupabaseAuthResponse>(
    "token?grant_type=password",
    {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    },
  );
  const session = sessionFromResponse(payload);
  if (!session) throw new Error("تعذر إنشاء جلسة تسجيل الدخول.");
  writeStoredSession(session);
  return session;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  fullName: string,
): Promise<{ session: RemoteAuthSession | null; requiresEmailConfirmation: boolean }> {
  const payload = await authRequest<SupabaseAuthResponse>("signup", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim(),
      password,
      data: { full_name: fullName.trim() },
    }),
  });
  const session = sessionFromResponse(payload);
  if (session) writeStoredSession(session);
  return {
    session,
    requiresEmailConfirmation: !session && !!payload.user?.id,
  };
}

export async function refreshRemoteSession(): Promise<RemoteAuthSession | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const current = readStoredSession();
    if (!current) return null;
    try {
      const payload = await authRequest<SupabaseAuthResponse>(
        "token?grant_type=refresh_token",
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: current.refresh_token }),
        },
      );
      const session = sessionFromResponse(payload);
      writeStoredSession(session);
      return session;
    } catch {
      writeStoredSession(null);
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getValidRemoteSession(): Promise<RemoteAuthSession | null> {
  if (!isSupabaseBackend()) return null;
  const current = readStoredSession();
  if (!current) return null;
  if (current.expires_at - Date.now() > 60_000) return current;
  return refreshRemoteSession();
}

export async function requireRemoteSession(): Promise<RemoteAuthSession> {
  const session = await getValidRemoteSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  return session;
}

export async function signOutRemote(): Promise<void> {
  const current = readStoredSession();
  writeStoredSession(null);
  if (!current || !BACKEND_CONFIG.supabaseConfigured) return;
  try {
    await authRequest<unknown>("logout", {
      method: "POST",
      accessToken: current.access_token,
    });
  } catch {
    // الجلسة المحلية أزيلت بالفعل، لذلك لا نعيدها إذا فشل logout الشبكي.
  }
}
