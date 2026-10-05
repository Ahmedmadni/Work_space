import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type {
  ProjectDecision,
  ProjectRisk,
} from "@/types/action-center";
import type {
  ObjectiveForecast,
  ObjectiveRecoveryPlan,
  ObjectiveStrategyReview,
  PortfolioObjective,
  StrategyCalendarEvent,
} from "@/types/strategy";

export type ExecutiveObjectiveAttention =
  | "intervention"
  | "follow_up"
  | "stable"
  | "insufficient_data";

export interface ExecutiveObjectiveScorecardRow {
  objective: PortfolioObjective;
  forecast: ObjectiveForecast;
  attention: ExecutiveObjectiveAttention;
  attention_reasons: string[];
  latest_review: ObjectiveStrategyReview | null;
  benefits_total: number;
  benefits_realized: number;
  benefits_overdue: number;
  active_risks: number;
  critical_high_risks: number;
  pending_decisions: number;
  active_recovery_plans: number;
  overdue_recovery_commitments: number;
  next_event: StrategyCalendarEvent | null;
}

export interface ExecutiveDecisionRequired {
  id: string;
  source: "decision_log" | "strategy_review";
  title: string;
  detail: string;
  objective_id: string | null;
  objective_title: string | null;
  project_id: string | null;
  project_name: string | null;
  owner_name: string | null;
  created_at: string;
}

export interface ExecutiveRiskItem {
  risk: ProjectRisk;
  objective_ids: string[];
  objective_titles: string[];
}

export interface ExecutiveStrategyBoardPack {
  generated_at: string;
  objectives: ExecutiveObjectiveScorecardRow[];
  summary: {
    objectives_total: number;
    objectives_intervention: number;
    objectives_follow_up: number;
    objectives_stable: number;
    objectives_insufficient_data: number;
    projected_late_or_overdue: number;
    benefits_total: number;
    benefits_realized: number;
    benefits_overdue: number;
    active_risks: number;
    critical_high_risks: number;
    pending_decisions: number;
    active_recovery_plans: number;
    overdue_recovery_commitments: number;
    calendar_overdue: number;
    calendar_due_soon: number;
    execution_total: number;
    execution_completed: number;
    execution_overdue: number;
    execution_blocked: number;
    execution_average_progress: number;
  };
  decisions_required: ExecutiveDecisionRequired[];
  top_risks: ExecutiveRiskItem[];
  active_recovery_plans: ObjectiveRecoveryPlan[];
  upcoming_agenda: StrategyCalendarEvent[];
  projects: Project[];
  boards: BoardWithContext[];
  execution: ProjectExecutionSummary | null;
  project_decisions: ProjectDecision[];
}
