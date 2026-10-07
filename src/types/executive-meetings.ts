export type ExecutiveMeetingStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ExecutiveMeetingAttendanceStatus =
  | "invited"
  | "attended"
  | "absent"
  | "excused";

export type ExecutiveMeetingDecisionOutcome =
  | "decided"
  | "deferred"
  | "rejected";

export type ExecutiveMeetingActionStatus =
  | "open"
  | "in_progress"
  | "done"
  | "cancelled";

export interface ExecutiveMeetingAttendee {
  id: string;
  user_id: string | null;
  display_name: string;
  email_snapshot: string | null;
  role_label: string | null;
  attendance_status: ExecutiveMeetingAttendanceStatus;
  created_at: string;
}

export interface ExecutiveMeetingDecision {
  id: string;
  source_decision_id: string | null;
  source_decision_version: number | null;
  objective_id: string | null;
  objective_title: string | null;
  project_id: string | null;
  project_name: string | null;
  title: string;
  outcome: ExecutiveMeetingDecisionOutcome;
  decision_text: string | null;
  rationale: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  follow_up_date: string | null;
  created_at: string;
}

export interface ExecutiveMeetingActionItem {
  id: string;
  decision_id: string | null;
  objective_id: string | null;
  objective_title: string | null;
  project_id: string | null;
  project_name: string | null;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  status: ExecutiveMeetingActionStatus;
  completed_at: string | null;
  version: number;
  can_update: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExecutiveStrategyMeeting {
  id: string;
  title: string;
  meeting_date: string;
  period_label: string | null;
  status: ExecutiveMeetingStatus;
  chair_user_id: string | null;
  chair_name: string | null;
  summary: string | null;
  next_meeting_date: string | null;
  board_pack_generated_at: string | null;
  finalized_at: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  attendees: ExecutiveMeetingAttendee[];
  decisions: ExecutiveMeetingDecision[];
  action_items: ExecutiveMeetingActionItem[];
}

export interface ExecutiveMeetingGovernanceData {
  meetings: ExecutiveStrategyMeeting[];
}

export interface SaveExecutiveMeetingAttendeeInput {
  id?: string | null;
  user_id?: string | null;
  display_name: string;
  email_snapshot?: string | null;
  role_label?: string | null;
  attendance_status: ExecutiveMeetingAttendanceStatus;
}

export interface SaveExecutiveMeetingDecisionInput {
  id?: string | null;
  source_decision_id?: string | null;
  source_decision_version?: number | null;
  objective_id?: string | null;
  project_id?: string | null;
  title: string;
  outcome: ExecutiveMeetingDecisionOutcome;
  decision_text?: string | null;
  rationale?: string | null;
  owner_user_id?: string | null;
  follow_up_date?: string | null;
}

export interface SaveExecutiveMeetingActionInput {
  id?: string | null;
  decision_id?: string | null;
  objective_id?: string | null;
  project_id?: string | null;
  title: string;
  description?: string | null;
  owner_user_id?: string | null;
  due_date?: string | null;
  status: ExecutiveMeetingActionStatus;
}

export interface SaveExecutiveStrategyMeetingInput {
  id?: string | null;
  expected_version?: number | null;
  title: string;
  meeting_date: string;
  period_label?: string | null;
  status: Extract<ExecutiveMeetingStatus, "draft" | "in_progress">;
  chair_user_id?: string | null;
  summary?: string | null;
  next_meeting_date?: string | null;
  board_pack_generated_at?: string | null;
  attendees: SaveExecutiveMeetingAttendeeInput[];
  decisions: SaveExecutiveMeetingDecisionInput[];
  action_items: SaveExecutiveMeetingActionInput[];
}

export interface SavedExecutiveMeetingRef {
  id: string;
  version: number;
  status?: ExecutiveMeetingStatus;
  finalized_at?: string | null;
}

export interface UpdateExecutiveMeetingActionInput {
  id: string;
  expected_version: number;
  status: ExecutiveMeetingActionStatus;
}
