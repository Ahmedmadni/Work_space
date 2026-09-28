export type DataBackendMode = "local" | "supabase";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  ""
).trim();
const supabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// Cloud mode stays opt-in until every database migration is applied.
const requestedMode: DataBackendMode =
  import.meta.env.VITE_DATA_BACKEND === "supabase" ? "supabase" : "local";

export const BACKEND_CONFIG = {
  requestedMode,
  mode: requestedMode === "supabase" && supabaseConfigured ? "supabase" : "local",
  supabaseConfigured,
  supabaseUrl,
  supabaseAnonKey,
} as const;

export function isSupabaseBackend() {
  return BACKEND_CONFIG.mode === "supabase";
}
