export type GovernanceExceptionMetricKey =
  | "decision_resolution"
  | "deferred_rate"
  | "action_completion"
  | "overdue_open"
  | "unowned_open"
  | "on_time_completion"
  | "median_completion_days"
  | "repeated_deferrals";

export type GovernanceExceptionStatus =
  | "open"
  | "mitigating"
  | "accepted"
  | "resolved"
  | "cancelled";

export type GovernanceExceptionOperator = "gte" | "lte";
export type GovernanceExceptionUnit = "%" | "days" | "count";

export interface ExecutiveGovernanceException {
  id: string;
  owner_user_id: string;
  metric_key: GovernanceExceptionMetricKey;
  title: string;
  rationale: string;
  corrective_action: string | null;
  responsible_name: string | null;
  due_date: string | null;
  status: GovernanceExceptionStatus;
  actual_value: number;
  target_value: number;
  target_operator: GovernanceExceptionOperator;
  target_unit: GovernanceExceptionUnit;
  target_version: number;
  source_window_meeting_ids: string[];
  resolved_at: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutiveGovernanceExceptionHistory {
  id: string;
  exception_id: string;
  owner_user_id: string;
  version: number;
  snapshot: ExecutiveGovernanceException;
  changed_by: string;
  changed_at: string;
}

export interface ExecutiveGovernanceExceptionsData {
  exceptions: ExecutiveGovernanceException[];
  history: ExecutiveGovernanceExceptionHistory[];
}

export interface CreateExecutiveGovernanceExceptionInput {
  expected_target_version: number;
  metric_key: GovernanceExceptionMetricKey;
  title: string;
  rationale: string;
  corrective_action?: string | null;
  responsible_name?: string | null;
  due_date?: string | null;
  actual_value: number;
  source_window_meeting_ids: string[];
}

export interface UpdateExecutiveGovernanceExceptionInput {
  id: string;
  expected_version: number;
  title: string;
  rationale: string;
  corrective_action?: string | null;
  responsible_name?: string | null;
  due_date?: string | null;
  status: GovernanceExceptionStatus;
}
