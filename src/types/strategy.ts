export type ObjectiveStatus =
  | "draft"
  | "active"
  | "achieved"
  | "paused"
  | "cancelled";

export type KeyResultDirection = "increase" | "decrease";

export interface ObjectiveKeyResult {
  id: string;
  title: string;
  unit: string | null;
  direction: KeyResultDirection;
  baseline_value: number;
  target_value: number;
  current_value: number;
  weight: number;
}

export interface ObjectiveMilestoneLink {
  project_id: string;
  board_id: string;
  node_id: string;
  board_name: string | null;
  node_title: string | null;
  status: string | null;
  progress: number | null;
  due_date: string | null;
}

export interface PortfolioObjective {
  id: string;
  title: string;
  description: string | null;
  status: ObjectiveStatus;
  owner_user_id: string | null;
  owner_name: string | null;
  start_date: string | null;
  due_date: string | null;
  version: number;
  created_by: string;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
  key_results: ObjectiveKeyResult[];
  project_ids: string[];
  milestones: ObjectiveMilestoneLink[];
}

export interface PortfolioStrategyData {
  objectives: PortfolioObjective[];
}

export interface SavePortfolioObjectiveInput {
  id?: string | null;
  expected_version?: number | null;
  title: string;
  description?: string | null;
  status: ObjectiveStatus;
  owner_user_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  key_results: Array<{
    id?: string | null;
    title: string;
    unit?: string | null;
    direction: KeyResultDirection;
    baseline_value: number;
    target_value: number;
    current_value: number;
    weight: number;
  }>;
  project_ids: string[];
  milestones: Array<{
    project_id: string;
    board_id: string;
    node_id: string;
  }>;
}

export interface SavedObjectiveRef {
  id: string;
  version: number;
}


export type BenefitType =
  | "financial"
  | "customer"
  | "operational"
  | "risk"
  | "capability"
  | "other";

export type BenefitStatus =
  | "planned"
  | "realizing"
  | "realized"
  | "not_realized";

export type StrategyReviewAssessment =
  | "on_track"
  | "at_risk"
  | "off_track"
  | "achieved";

export interface ObjectiveBenefit {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  benefit_type: BenefitType;
  status: BenefitStatus;
  owner_user_id: string | null;
  owner_name: string | null;
  target_date: string | null;
  expected_outcome: string | null;
  realized_outcome: string | null;
  evidence: string | null;
  realized_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ObjectiveStrategyReview {
  id: string;
  objective_id: string;
  review_date: string;
  period_label: string;
  assessment: StrategyReviewAssessment;
  summary: string | null;
  decisions_needed: string | null;
  objective_progress_snapshot: number | null;
  delivery_progress_snapshot: number | null;
  active_risks_snapshot: number;
  critical_risks_snapshot: number;
  pending_decisions_snapshot: number;
  key_results_snapshot: ObjectiveKeyResult[];
  created_by: string;
  created_at: string;
}

export interface StrategyReviewData {
  benefits: ObjectiveBenefit[];
  reviews: ObjectiveStrategyReview[];
}

export interface SaveObjectiveBenefitInput {
  objective_id: string;
  id?: string | null;
  expected_version?: number | null;
  title: string;
  description?: string | null;
  benefit_type: BenefitType;
  status: BenefitStatus;
  owner_user_id?: string | null;
  target_date?: string | null;
  expected_outcome?: string | null;
  realized_outcome?: string | null;
  evidence?: string | null;
}

export interface RecordStrategyReviewInput {
  objective_id: string;
  period_label: string;
  assessment: StrategyReviewAssessment;
  summary?: string | null;
  decisions_needed?: string | null;
  /** Used only by Local mode to mirror the server snapshot experience. */
  local_delivery_progress?: number | null;
  local_active_risks?: number;
  local_critical_risks?: number;
  local_pending_decisions?: number;
}


export type StrategyForecastStatus =
  | "achieved"
  | "overdue"
  | "projected_on_time"
  | "projected_late"
  | "stalled"
  | "insufficient_data";

export type ForecastEvidenceStrength = "low" | "medium" | "high";

export interface StrategyForecastPoint {
  review_id: string;
  review_date: string;
  progress: number;
}

export interface ObjectiveForecast {
  objective_id: string;
  status: StrategyForecastStatus;
  latest_progress: number | null;
  latest_review_date: string | null;
  review_count: number;
  history_span_days: number;
  daily_progress_rate: number | null;
  projected_due_progress: number | null;
  projected_completion_date: string | null;
  days_to_due: number | null;
  evidence_strength: ForecastEvidenceStrength;
  points: StrategyForecastPoint[];
}

export interface BenefitForecastWarning {
  benefit_id: string;
  objective_id: string;
  severity: "warning" | "critical";
  reason: "overdue" | "objective_projected_late" | "objective_stalled";
}
