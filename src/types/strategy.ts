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


export interface StrategicScenarioKrOverride {
  key_result_id: string;
  current_value: number;
  target_value: number;
}

export interface StrategicScenarioInput {
  objective_id: string;
  due_date: string | null;
  trend_multiplier: number;
  key_results: StrategicScenarioKrOverride[];
}

export interface StrategicScenarioResult {
  objective_id: string;
  scenario_objective: PortfolioObjective;
  baseline_forecast: ObjectiveForecast;
  scenario_forecast: ObjectiveForecast;
  baseline_progress: number | null;
  scenario_progress: number | null;
  progress_delta: number | null;
  projected_due_delta: number | null;
  completion_date_delta_days: number | null;
}


export type RecoveryPlanStatus =
  | "draft"
  | "active"
  | "recovered"
  | "closed"
  | "cancelled";

export type RecoveryTriggerReason =
  | "manual"
  | "projected_late"
  | "stalled"
  | "overdue";

export type RecoveryCommitmentStatus =
  | "open"
  | "in_progress"
  | "done"
  | "cancelled";

export interface RecoveryCommitment {
  id: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  status: RecoveryCommitmentStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObjectiveRecoveryPlan {
  id: string;
  objective_id: string;
  title: string;
  summary: string | null;
  success_criteria: string | null;
  trigger_reason: RecoveryTriggerReason;
  status: RecoveryPlanStatus;
  owner_user_id: string | null;
  owner_name: string | null;
  target_recovery_date: string | null;
  baseline_objective_progress: number | null;
  baseline_daily_progress_rate: number | null;
  baseline_review_count: number;
  activated_at: string | null;
  recovered_at: string | null;
  closed_at: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  commitments: RecoveryCommitment[];
}

export interface RecoveryPlanData {
  plans: ObjectiveRecoveryPlan[];
}

export interface SaveRecoveryCommitmentInput {
  id?: string | null;
  title: string;
  description?: string | null;
  owner_user_id?: string | null;
  owner_name?: string | null;
  due_date?: string | null;
  status: RecoveryCommitmentStatus;
}

export interface SaveObjectiveRecoveryPlanInput {
  objective_id: string;
  id?: string | null;
  expected_version?: number | null;
  title: string;
  summary?: string | null;
  success_criteria?: string | null;
  trigger_reason: RecoveryTriggerReason;
  status: RecoveryPlanStatus;
  owner_user_id?: string | null;
  owner_name?: string | null;
  target_recovery_date?: string | null;
  commitments: SaveRecoveryCommitmentInput[];
}

export interface SavedRecoveryPlanRef {
  id: string;
  version: number;
}

export type RecoveryTrendAssessment =
  | "improved"
  | "unchanged"
  | "worsened"
  | "insufficient_data";

export interface RecoveryPlanEffectiveness {
  plan_id: string;
  assessment: RecoveryTrendAssessment;
  baseline_weekly_rate: number | null;
  current_weekly_rate: number | null;
  weekly_rate_delta: number | null;
  baseline_progress: number | null;
  current_progress: number | null;
  progress_delta: number | null;
}
