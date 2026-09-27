import { BACKEND_CONFIG, isSupabaseBackend } from "@/lib/backend-config";
import { requireRemoteSession } from "@/services/auth.service";

export interface RestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  prefer?: string;
}

export class SupabaseRestError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "SupabaseRestError";
    this.status = status;
    this.code = code;
  }
}

export async function supabaseRest<T>(
  resource: string,
  options: RestOptions = {},
): Promise<T> {
  if (!isSupabaseBackend() || !BACKEND_CONFIG.supabaseConfigured) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  const session = await requireRemoteSession();
  const url = new URL(
    `${BACKEND_CONFIG.supabaseUrl}/rest/v1/${resource.replace(/^\/+/, "")}`,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      apikey: BACKEND_CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const error = payload as { message?: string; details?: string; code?: string } | null;
    throw new SupabaseRestError(
      error?.message || error?.details || `SUPABASE_HTTP_${response.status}`,
      response.status,
      error?.code ?? null,
    );
  }
  return payload as T;
}
