import type { CanvasNodeStatus } from "@/types";

export interface ProjectNodeEffort {
  board_id: string;
  node_id: string;
  effort_hours: number | null;
}

export interface ProjectMemberCapacity {
  user_id: string;
  weekly_capacity_hours: number;
}

export interface ProjectPlanningDependency {
  board_id: string;
  source_node_id: string;
  target_node_id: string;
  target_title: string;
  target_due_date: string | null;
  target_status: CanvasNodeStatus;
}

export interface ProjectScheduleBaselineSummary {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string;
  item_count: number;
}

export interface ProjectScheduleBaselineItem {
  board_id: string;
  node_id: string;
  title: string;
  kind: string;
  start_date: string | null;
  due_date: string | null;
  status: CanvasNodeStatus;
  progress: number;
  assignee_user_id: string | null;
  effort_hours: number | null;
}

export interface ProjectScheduleBaseline {
  id: string;
  name: string;
  created_at: string;
  items: ProjectScheduleBaselineItem[];
}

export interface ProjectPlanningData {
  effort: ProjectNodeEffort[];
  capacity: ProjectMemberCapacity[];
  dependencies: ProjectPlanningDependency[];
  baselines: ProjectScheduleBaselineSummary[];
  latest_baseline: ProjectScheduleBaseline | null;
}

export interface CanvasNodeScheduleUpdate {
  node_id: string;
  version: number;
  start_date: string | null;
  due_date: string | null;
  effort_hours: number | null;
  updated_at: string;
  revision?: number;
}

export interface UpdateCanvasNodeScheduleInput {
  projectId: string;
  boardId: string;
  nodeId: string;
  expectedVersion: number;
  startDate?: string | null;
  dueDate?: string | null;
  effortHours?: number | null;
}


export interface PlanningScenarioChange {
  board_id: string;
  node_id: string;
  expected_version: number;
  start_date: string | null;
  due_date: string | null;
  effort_hours: number | null;
  assignee_user_id: string | null;
  /** Local fallback display label. Supabase resolves the canonical name server-side. */
  assignee_name?: string | null;
}

export interface PlanningScenarioApplyResult {
  ok: boolean;
  applied_count: number;
}
