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
  created_at: string;
  finished_at: string | null;
}
