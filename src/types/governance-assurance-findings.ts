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

export type GovernanceAssuranceFindingVerificationStatus =
  | "not_requested"
  | "pending"
  | "effective"
  | "partially_effective"
  | "ineffective";

export type GovernanceAssuranceFindingEvidenceType =
  | "note"
  | "link"
  | "reference";

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
  reminder_date: string | null;
  corrective_action: string | null;
  resolution_note: string | null;
  verification_status: GovernanceAssuranceFindingVerificationStatus;
  verifier_user_id: string | null;
  verifier_name_snapshot: string | null;
  verifier_email_snapshot: string | null;
  verification_requested_at: string | null;
  verified_at: string | null;
  effectiveness_note: string | null;
  version: number;
  resolved_at: string | null;
  accepted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAssuranceFindingEvidence {
  id: string;
  finding_id: string;
  archive_id: string;
  owner_user_id: string;
  evidence_type: GovernanceAssuranceFindingEvidenceType;
  title: string;
  detail: string;
  reference_url: string | null;
  created_by: string;
  created_at: string;
}

export interface GovernanceAssuranceFindingRow {
  finding: GovernanceAssuranceFinding;
  archive: GovernanceAssuranceArchive;
  can_manage: boolean;
  is_responsible: boolean;
  can_verify: boolean;
  evidence: GovernanceAssuranceFindingEvidence[];
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
  assigned_to_me_active: number;
  verification_pending: number;
  ineffective_active: number;
}

export interface GovernanceAssuranceFindingData {
  findings: GovernanceAssuranceFindingRow[];
  manageable_archive_ids: string[];
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
  reminder_date?: string | null;
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


export interface AddGovernanceAssuranceFindingEvidenceInput {
  finding_id: string;
  evidence_type: GovernanceAssuranceFindingEvidenceType;
  title: string;
  detail: string;
  reference_url?: string | null;
}

export interface RequestGovernanceAssuranceFindingVerificationInput {
  finding_id: string;
  expected_version: number;
  verifier_user_id: string;
}

export interface ActOnGovernanceAssuranceFindingVerificationInput {
  finding_id: string;
  expected_version: number;
  decision: Extract<
    GovernanceAssuranceFindingVerificationStatus,
    "effective" | "partially_effective" | "ineffective"
  >;
  effectiveness_note: string;
}
