export type DataBackendMode = "local" | "supabase";

const requestedMode: DataBackendMode =
  import.meta.env.VITE_DATA_BACKEND === "supabase" ? "supabase" : "local";
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const supabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const BACKEND_CONFIG = {
  requestedMode,
  mode: requestedMode === "supabase" && supabaseConfigured ? "supabase" : "local",
  supabaseConfigured,
  supabaseUrl,
  supabaseAnonKey,
} as const;

if (
  import.meta.env.DEV &&
  requestedMode === "supabase" &&
  !supabaseConfigured
) {
  console.warn(
    "[backend] VITE_DATA_BACKEND=supabase لكن مفاتيح Supabase غير مكتملة؛ تم الرجوع للوضع المحلي.",
  );
}

export function isSupabaseBackend() {
  return BACKEND_CONFIG.mode === "supabase";
}
