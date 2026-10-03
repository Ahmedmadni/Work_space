import type { CanvasNodeStatus, CanvasPriority } from "@/types";

export type CopilotMode = "brief" | "risks" | "next_steps" | "ask";

export type CopilotSeverity = "critical" | "warning" | "info";

export interface CopilotProjectItem {
  id: string;
  board_id: string;
  board_name: string;
  title: string;
  description: string;
  kind: string;
  status: CanvasNodeStatus;
  priority: CanvasPriority | null;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  assignee_name: string | null;
  is_overdue: boolean;
  is_upcoming: boolean;
  is_critical: boolean;
  is_unassigned: boolean;
  waiting_on: string[];
}

export interface CopilotProjectContext {
  project: {
    id: string;
    name: string;
    description: string;
    status: string;
  };
  metrics: {
    total: number;
    completed: number;
    in_progress: number;
    blocked: number;
    overdue: number;
    upcoming: number;
    critical: number;
    unassigned: number;
    dependency_ready: number;
    waiting_on_dependencies: number;
    average_progress: number;
  };
  boards: Array<{ id: string; name: string }>;
  team: Array<{ name: string; role: string }>;
  risks: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    owner_name: string | null;
    mitigation: string;
    due_date: string | null;
    node_id: string | null;
  }>;
  decisions: Array<{
    id: string;
    title: string;
    decision: string;
    rationale: string;
    status: string;
    owner_name: string | null;
    decided_at: string | null;
    node_id: string | null;
  }>;
  items: CopilotProjectItem[];
}

export interface CopilotInsight {
  title: string;
  detail: string;
  severity: CopilotSeverity;
  node_id: string | null;
}

export interface CopilotCreateTaskAction {
  type: "create_task";
  title: string;
  description: string;
  priority: CanvasPriority;
  reason: string;
  board_id: string | null;
  source_node_ids: string[];
}

export interface CopilotRecommendationAction {
  type: "recommendation";
  title: string;
  description: string;
  reason: string;
  source_node_ids: string[];
}

export type CopilotAction =
  | CopilotCreateTaskAction
  | CopilotRecommendationAction;

export interface CopilotResult {
  answer: string;
  executive_summary: string;
  insights: CopilotInsight[];
  actions: CopilotAction[];
}
