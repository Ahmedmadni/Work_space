export interface CloudBackendReadiness {
  configured: boolean;
  reachable: boolean;
  ready: boolean;
  schema_version: number;
  expected_schema_version: number;
  checks_passed: number;
  checks_total: number;
  missing: string[];
  checked_at: string | null;
  backend_contract: string | null;
  error: string | null;
}
