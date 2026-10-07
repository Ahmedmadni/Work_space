import type {
  GovernanceAssuranceArchive,
  GovernanceAssuranceSignatoryCandidate,
} from "@/types/governance-assurance";

export type GovernanceAssuranceFindingSourceType =
  | "manual"
  | "signoff_reservation"
  | "recipient_acknowledgement";

export type GovernanceAssuranceFindingSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type GovernanceAssuranceFindingStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "accepted";

export interface GovernanceAssuranceFinding {
  id: string;
  archive_id: string;
  owner_user_id: string;
  source_type: GovernanceAssuranceFindingSourceType;
  source_ref_id: string | null;
  title: string;
  description: string;
  severity: GovernanceAssuranceFindingSeverity;
  status: GovernanceAssuranceFindingStatus;
  responsible_user_id: string | null;
  responsible_name_snapshot: string | null;
  responsible_email_snapshot: string | null;
  due_date: string | null;
  corrective_action: string | null;
  resolution_note: string | null;
  version: number;
  resolved_at: string | null;
  accepted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAssuranceFindingRow {
  finding: GovernanceAssuranceFinding;
  archive: GovernanceAssuranceArchive;
  can_manage: boolean;
}

export interface GovernanceAssuranceFindingSummary {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  accepted: number;
  critical_active: number;
  high_active: number;
  overdue_active: number;
  unassigned_active: number;
}

export interface GovernanceAssuranceFindingData {
  findings: GovernanceAssuranceFindingRow[];
  summary: GovernanceAssuranceFindingSummary;
}

export interface SaveGovernanceAssuranceFindingInput {
  id?: string | null;
  expected_version?: number | null;
  archive_id: string;
  source_type: GovernanceAssuranceFindingSourceType;
  source_ref_id?: string | null;
  title: string;
  description: string;
  severity: GovernanceAssuranceFindingSeverity;
  status: GovernanceAssuranceFindingStatus;
  responsible_user_id?: string | null;
  due_date?: string | null;
  corrective_action?: string | null;
  resolution_note?: string | null;
}

export interface GovernanceAssuranceFindingSourceCandidate {
  type: Exclude<GovernanceAssuranceFindingSourceType, "manual">;
  ref_id: string;
  label: string;
  detail: string;
}

export type GovernanceAssuranceFindingResponsibleCandidate =
  GovernanceAssuranceSignatoryCandidate;
