import type { ExecutiveStrategyMeeting } from "@/types/executive-meetings";

export type GovernanceTrendDirection =
  | "improved"
  | "worsened"
  | "unchanged"
  | "insufficient_data";

export interface GovernancePeriodMetric {
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: GovernanceTrendDirection;
}

export interface GovernanceTrendPeriod {
  current_meeting_ids: string[];
  previous_meeting_ids: string[];
  current_label: string;
  previous_label: string;
  window_size: number;
}

export interface GovernanceTrendSummary {
  decision_resolution_rate: GovernancePeriodMetric;
  deferred_rate: GovernancePeriodMetric;
  action_completion_rate: GovernancePeriodMetric;
  overdue_open_rate: GovernancePeriodMetric;
  unowned_open_rate: GovernancePeriodMetric;
  on_time_completion_rate: GovernancePeriodMetric;
  median_completion_days: GovernancePeriodMetric;
  repeated_deferrals_open: GovernancePeriodMetric;
}

export interface GovernanceMeetingTrendPoint {
  meeting_id: string;
  title: string;
  meeting_date: string;
  decisions_total: number;
  decision_resolution_rate: number | null;
  deferred_rate: number | null;
  actions_total: number;
  action_completion_rate: number | null;
  overdue_open_rate: number | null;
  unowned_open_rate: number | null;
  on_time_completion_rate: number | null;
  median_completion_days: number | null;
}

export interface GovernanceBottleneckRow {
  key: string;
  label: string;
  project_id: string | null;
  objective_id: string | null;
  meetings: number;
  decisions_total: number;
  decisions_deferred: number;
  repeated_deferred_sources: number;
  actions_total: number;
  actions_open: number;
  actions_overdue: number;
  actions_unowned: number;
  actions_done: number;
  late_completed_actions: number;
  median_completion_days: number | null;
}

export interface GovernanceDecisionPattern {
  source_decision_id: string;
  title: string;
  project_id: string | null;
  project_name: string | null;
  objective_id: string | null;
  objective_title: string | null;
  appearances: number;
  deferred_count: number;
  decided_count: number;
  rejected_count: number;
  first_meeting_date: string;
  latest_meeting_date: string;
  latest_meeting_id: string;
  latest_outcome: "decided" | "deferred" | "rejected";
}

export interface ExecutiveGovernanceTrendsData {
  generated_at: string;
  period: GovernanceTrendPeriod;
  summary: GovernanceTrendSummary;
  meeting_trend: GovernanceMeetingTrendPoint[];
  project_bottlenecks: GovernanceBottleneckRow[];
  objective_bottlenecks: GovernanceBottleneckRow[];
  decision_patterns: GovernanceDecisionPattern[];
  finalized_meetings: ExecutiveStrategyMeeting[];
}
