export type ProjectAutomationKind =
  | "blocked_notify_managers"
  | "dependency_ready_notify_assignee"
  | "due_soon_notify_assignee"
  | "overdue_escalate_managers"
  | "dependency_ready_set_planned";

export interface ProjectAutomationRule {
  id: string;
  kind: ProjectAutomationKind;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  last_tested_at: string | null;
  last_test_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type ProjectAutomationRunStatus =
  | "running"
  | "success"
  | "skipped"
  | "failed";

export interface ProjectAutomationRun {
  id: string;
  rule_id: string;
  rule_name: string;
  rule_kind: ProjectAutomationKind;
  board_id: string | null;
  board_name: string | null;
  node_id: string | null;
  node_title: string | null;
  event_key: string;
  status: ProjectAutomationRunStatus;
  trigger_payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string;
  created_at: string;
  finished_at: string | null;
}


export interface ProjectAutomationHealth {
  scheduler_mode: "pg_cron" | "active_app_fallback";
  scheduler_available: boolean;
  cron_job_name: string | null;
  cron_job_id: number | null;
  last_tick_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  running_since: string | null;
  failed_runs: number;
  retrying_runs: number;
  exhausted_runs: number;
  oldest_failed_at: string | null;
  enabled_rules: number;
  scheduled_rules: number;
  checked_at: string;
}

export interface ProjectAutomationDryRun {
  rule_id: string;
  kind: ProjectAutomationKind;
  enabled: boolean;
  candidate_count: number;
  sample: Array<Record<string, unknown>>;
  dry_run: true;
  tested_at: string;
}
