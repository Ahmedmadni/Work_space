import type { GovernancePeriodMetric } from "@/types/governance-trends";

export type GovernanceTargetStatus =
  | "met"
  | "not_met"
  | "no_target"
  | "insufficient_data";

export type GovernanceTargetOperator = "gte" | "lte";

export interface ExecutiveGovernanceTargetProfile {
  owner_user_id: string;
  decision_resolution_target_pct: number | null;
  max_deferred_rate_pct: number | null;
  action_completion_target_pct: number | null;
  max_overdue_open_rate_pct: number | null;
  max_unowned_open_rate_pct: number | null;
  on_time_completion_target_pct: number | null;
  max_median_completion_days: number | null;
  max_repeated_deferrals: number | null;
  meeting_cadence_days: number | null;
  cadence_warning_days_before: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ExecutiveGovernanceTargetHistory {
  id: string;
  owner_user_id: string;
  version: number;
  targets: ExecutiveGovernanceTargetProfile;
  changed_by: string;
  changed_at: string;
}

export interface ExecutiveGovernanceTargetsData {
  profile: ExecutiveGovernanceTargetProfile | null;
  history: ExecutiveGovernanceTargetHistory[];
}

export interface SaveExecutiveGovernanceTargetsInput {
  expected_version?: number | null;
  decision_resolution_target_pct?: number | null;
  max_deferred_rate_pct?: number | null;
  action_completion_target_pct?: number | null;
  max_overdue_open_rate_pct?: number | null;
  max_unowned_open_rate_pct?: number | null;
  on_time_completion_target_pct?: number | null;
  max_median_completion_days?: number | null;
  max_repeated_deferrals?: number | null;
  meeting_cadence_days?: number | null;
  cadence_warning_days_before?: number | null;
}

export interface GovernanceTargetAssessment {
  key:
    | "decision_resolution"
    | "deferred_rate"
    | "action_completion"
    | "overdue_open"
    | "unowned_open"
    | "on_time_completion"
    | "median_completion_days"
    | "repeated_deferrals";
  label: string;
  operator: GovernanceTargetOperator;
  actual: number | null;
  target: number | null;
  unit: "%" | "days" | "count";
  status: GovernanceTargetStatus;
  gap: number | null;
  trend: GovernancePeriodMetric;
}

export type GovernanceCadenceStatus =
  | "on_schedule"
  | "due_soon"
  | "overdue"
  | "no_target"
  | "no_meetings";

export interface GovernanceOperatingRhythm {
  cadence_days: number | null;
  warning_days_before: number | null;
  last_finalized_meeting_date: string | null;
  next_due_date: string | null;
  warning_date: string | null;
  days_to_due: number | null;
  status: GovernanceCadenceStatus;
}

export interface ExecutiveGovernanceTargetEvaluation {
  assessments: GovernanceTargetAssessment[];
  met_count: number;
  not_met_count: number;
  configured_count: number;
  insufficient_count: number;
  rhythm: GovernanceOperatingRhythm;
}
