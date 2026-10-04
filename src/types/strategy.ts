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
