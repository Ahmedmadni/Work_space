import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectAuditSummary } from "@/types/audit";
import type { ProjectAutomationHealth } from "@/types/automations";
import type { ProjectCollaborator } from "@/types/collaboration";

export type ProjectHealthLevel = "healthy" | "attention" | "critical";

export interface ProjectReportWorkloadRow {
  user_id: string;
  name: string;
  role: string;
  assigned: number;
  open: number;
  completed: number;
  overdue: number;
  blocked: number;
  upcoming: number;
  average_progress: number;
}

export interface ProjectReportBoardRow {
  board_id: string;
  name: string;
  total: number;
  open: number;
  completed: number;
  overdue: number;
  blocked: number;
  average_progress: number;
}

export interface ProjectReportRisk {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
}

export interface ProjectExecutiveReport {
  generated_at: string;
  project: Project;
  health: {
    level: ProjectHealthLevel;
    reasons: string[];
  };
  kpis: {
    total: number;
    open: number;
    completed: number;
    completion_rate: number;
    average_progress: number;
    in_progress: number;
    blocked: number;
    overdue: number;
    upcoming: number;
    critical: number;
    unassigned: number;
    dependency_ready: number;
    waiting_on_dependencies: number;
  };
  milestones: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
    upcoming: number;
  };
  workload: ProjectReportWorkloadRow[];
  boards: ProjectReportBoardRow[];
  risks: ProjectReportRisk[];
  automation: ProjectAutomationHealth | null;
  governance: ProjectAuditSummary | null;
  team: {
    total: number;
    owner: number;
    admin: number;
    editor: number;
    viewer: number;
  };
  execution: ProjectExecutionSummary;
  board_catalog: BoardWithContext[];
}

export interface BuildProjectExecutiveReportInput {
  project: Project;
  execution: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
  automation: ProjectAutomationHealth | null;
  governance: ProjectAuditSummary | null;
}
