export type ProjectRiskSeverity = "low" | "medium" | "high" | "critical";
export type ProjectRiskStatus = "open" | "mitigating" | "accepted" | "closed";
export type ProjectDecisionStatus =
  | "proposed"
  | "decided"
  | "superseded"
  | "cancelled";

export interface ProjectRisk {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  severity: ProjectRiskSeverity;
  status: ProjectRiskStatus;
  owner_user_id: string | null;
  owner_name: string | null;
  mitigation: string | null;
  due_date: string | null;
  board_id: string | null;
  board_name: string | null;
  node_id: string | null;
  node_title: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDecision {
  id: string;
  project_id: string;
  title: string;
  decision: string;
  rationale: string | null;
  status: ProjectDecisionStatus;
  owner_user_id: string | null;
  owner_name: string | null;
  decided_at: string | null;
  board_id: string | null;
  board_name: string | null;
  node_id: string | null;
  node_title: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectActionCenterSummary {
  active_risks: number;
  critical_high_risks: number;
  overdue_mitigations: number;
  accepted_risks: number;
  pending_decisions: number;
  decided_30d: number;
}

export interface ProjectActionCenterData {
  risks: ProjectRisk[];
  decisions: ProjectDecision[];
  summary: ProjectActionCenterSummary;
}

export interface SaveProjectRiskInput {
  id?: string | null;
  expected_version?: number | null;
  title: string;
  description?: string | null;
  severity: ProjectRiskSeverity;
  status: ProjectRiskStatus;
  owner_user_id?: string | null;
  owner_name?: string | null;
  mitigation?: string | null;
  due_date?: string | null;
  board_id?: string | null;
  node_id?: string | null;
}

export interface SaveProjectDecisionInput {
  id?: string | null;
  expected_version?: number | null;
  title: string;
  decision: string;
  rationale?: string | null;
  status: ProjectDecisionStatus;
  owner_user_id?: string | null;
  owner_name?: string | null;
  board_id?: string | null;
  node_id?: string | null;
}
