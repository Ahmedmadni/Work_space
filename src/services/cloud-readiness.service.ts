import { BACKEND_CONFIG } from "@/lib/backend-config";
import type { CloudBackendReadiness } from "@/types/cloud-readiness";

const REQUIRED_SCHEMA_VERSION = 16;

const EMPTY: CloudBackendReadiness = {
  configured: false,
  reachable: false,
  ready: false,
  schema_version: 0,
  expected_schema_version: REQUIRED_SCHEMA_VERSION,
  checks_passed: 0,
  checks_total: 0,
  missing: [],
  checked_at: null,
  backend_contract: null,
  error: null,
};

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export async function getCloudBackendReadiness(): Promise<CloudBackendReadiness> {
  if (!BACKEND_CONFIG.supabaseConfigured) {
    return {
      ...EMPTY,
      error: "SUPABASE_NOT_CONFIGURED",
    };
  }

  const url =
    BACKEND_CONFIG.supabaseUrl +
    "/rest/v1/rpc/get_projectflow_backend_readiness";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: BACKEND_CONFIG.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const text = await response.text();
    const payload = text
      ? (JSON.parse(text) as Record<string, unknown>)
      : {};

    if (!response.ok) {
      const code =
        typeof payload.code === "string" ? payload.code : null;
      const functionMissing =
        response.status === 404 ||
        code === "PGRST202" ||
        code === "42883";

      return {
        ...EMPTY,
        configured: true,
        reachable: true,
        missing: functionMissing
          ? ["migration:015_cloud_readiness"]
          : [],
        error: functionMissing
          ? "CLOUD_SCHEMA_NOT_READY"
          : typeof payload.message === "string"
            ? payload.message
            : "CLOUD_READINESS_HTTP_" + response.status,
      };
    }

    const schemaVersion = numberValue(payload.schema_version);
    const remoteMissing = Array.isArray(payload.missing)
      ? payload.missing.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const migrationMissing =
      schemaVersion < REQUIRED_SCHEMA_VERSION
        ? ["migration:016_complete_cloud_cutover"]
        : [];
    const missing = Array.from(
      new Set([...remoteMissing, ...migrationMissing]),
    );

    return {
      configured: true,
      reachable: true,
      ready:
        payload.ready === true &&
        schemaVersion >= REQUIRED_SCHEMA_VERSION &&
        missing.length === 0,
      schema_version: schemaVersion,
      expected_schema_version: REQUIRED_SCHEMA_VERSION,
      checks_passed: numberValue(payload.checks_passed),
      checks_total: numberValue(payload.checks_total),
      missing,
      checked_at:
        typeof payload.checked_at === "string"
          ? payload.checked_at
          : null,
      backend_contract:
        typeof payload.backend_contract === "string"
          ? payload.backend_contract
          : null,
      error: null,
    };
  } catch (error) {
    return {
      ...EMPTY,
      configured: true,
      error:
        error instanceof Error
          ? error.message
          : "CLOUD_READINESS_NETWORK_ERROR",
    };
  }
}
