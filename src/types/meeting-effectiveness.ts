import type {
  ExecutiveMeetingActionItem,
  ExecutiveMeetingDecision,
  ExecutiveStrategyMeeting,
} from "@/types/executive-meetings";

export interface MeetingEffectivenessSummary {
  finalized_meetings: number;
  decisions_total: number;
  decisions_resolved: number;
  decisions_deferred: number;
  decision_resolution_rate: number | null;
  repeated_deferred_sources: number;
  unresolved_repeated_deferrals: number;
  actions_total: number;
  actions_done: number;
  actions_open: number;
  actions_overdue: number;
  actions_unowned: number;
  action_completion_rate: number | null;
  median_completion_days: number | null;
  late_completed_actions: number;
  oldest_open_action_days: number | null;
  max_carryover_meetings: number;
}

export interface RepeatedDeferredDecision {
  source_decision_id: string;
  title: string;
  project_name: string | null;
  objective_title: string | null;
  deferral_count: number;
  total_appearances: number;
  first_meeting_date: string;
  latest_meeting_date: string;
  latest_outcome: ExecutiveMeetingDecision["outcome"];
  still_unresolved: boolean;
}

export interface ActionFollowThroughRow {
  action: ExecutiveMeetingActionItem;
  origin_meeting: ExecutiveStrategyMeeting;
  age_days: number;
  carryover_meetings: number;
  overdue: boolean;
  late_completed: boolean;
  completion_days: number | null;
}

export interface MeetingOutcomeRow {
  meeting: ExecutiveStrategyMeeting;
  decisions_total: number;
  decisions_decided: number;
  decisions_deferred: number;
  decisions_rejected: number;
  actions_total: number;
  actions_done: number;
  actions_open: number;
  actions_overdue: number;
  action_completion_rate: number | null;
}

export interface ExecutiveMeetingEffectivenessData {
  generated_at: string;
  summary: MeetingEffectivenessSummary;
  repeated_deferrals: RepeatedDeferredDecision[];
  open_follow_through: ActionFollowThroughRow[];
  completed_follow_through: ActionFollowThroughRow[];
  meeting_outcomes: MeetingOutcomeRow[];
}
