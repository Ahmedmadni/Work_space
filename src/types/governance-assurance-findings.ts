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

export type GovernanceAssuranceFindingActionType =
  | "corrective"
  | "preventive";

export type GovernanceAssuranceFindingActionStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled";



export type GovernanceAssuranceFindingCategory =
  | "control_design"
  | "control_operation"
  | "process_gap"
  | "data_quality"
  | "compliance"
  | "governance"
  | "security_access"
  | "documentation"
  | "execution"
  | "third_party"
  | "other";

export type GovernanceAssuranceRootCauseCategory =
  | "people"
  | "process"
  | "technology"
  | "data"
  | "governance"
  | "third_party"
  | "external"
  | "unknown"
  | "other";

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
  finding_category: GovernanceAssuranceFindingCategory | null;
  root_cause_category: GovernanceAssuranceRootCauseCategory | null;
  root_cause_detail: string | null;
  recurrence_parent_finding_id: string | null;
  recurrence_root_finding_id: string | null;
  recurrence_sequence: number;
  recurrence_reason: string | null;
  taxonomy_version: number;
  classified_by: string | null;
  classified_at: string | null;
  version: number;
  resolved_at: string | null;
  accepted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAssuranceFindingAction {
  id: string;
  finding_id: string;
  archive_id: string;
  owner_user_id: string;
  action_type: GovernanceAssuranceFindingActionType;
  title: string;
  description: string;
  status: GovernanceAssuranceFindingActionStatus;
  responsible_user_id: string | null;
  responsible_name_snapshot: string | null;
  responsible_email_snapshot: string | null;
  due_date: string | null;
  outcome_note: string | null;
  version: number;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  can_manage?: boolean;
  is_responsible?: boolean;
}

export interface GovernanceAssuranceFindingClosureReadiness {
  ready: boolean;
  has_evidence: boolean;
  active_capa_actions: number;
  has_completed_preventive_action: boolean;
  preventive_required: boolean;
  reasons: Array<
    | "evidence_required"
    | "active_capa_actions"
    | "completed_preventive_required"
  >;
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
  actions: GovernanceAssuranceFindingAction[];
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


export interface ActOnGovernanceAssuranceFindingActionInput {
  action_id: string;
  expected_version: number;
  status: Extract<
    GovernanceAssuranceFindingActionStatus,
    "in_progress" | "completed"
  >;
  outcome_note?: string | null;
}

export interface SaveGovernanceAssuranceFindingActionInput {
  id?: string | null;
  expected_version?: number | null;
  finding_id: string;
  action_type: GovernanceAssuranceFindingActionType;
  title: string;
  description: string;
  status: GovernanceAssuranceFindingActionStatus;
  responsible_user_id?: string | null;
  due_date?: string | null;
  outcome_note?: string | null;
}

export interface AddGovernanceAssuranceFindingEvidenceInput {
  finding_id: string;
  evidence_type: GovernanceAssuranceFindingEvidenceType;
  title: string;
  detail: string;
  reference_url?: string | null;
}

export interface ClassifyGovernanceAssuranceFindingInput {
  finding_id: string;
  expected_version: number;
  finding_category: GovernanceAssuranceFindingCategory | null;
  root_cause_category: GovernanceAssuranceRootCauseCategory | null;
  root_cause_detail?: string | null;
  recurrence_parent_finding_id?: string | null;
  recurrence_reason?: string | null;
}

export type GovernanceAssuranceRecurrenceCandidateMatch =
  | "exact_taxonomy"
  | "same_category"
  | "other";

export interface GovernanceAssuranceRecurrenceCandidate {
  finding_id: string;
  archive_id: string;
  certificate_code: string;
  period_label: string;
  archived_at: string;
  title: string;
  severity: GovernanceAssuranceFindingSeverity;
  status: GovernanceAssuranceFindingStatus;
  finding_category: GovernanceAssuranceFindingCategory | null;
  root_cause_category: GovernanceAssuranceRootCauseCategory | null;
  recurrence_sequence: number;
  match: GovernanceAssuranceRecurrenceCandidateMatch;
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


export interface GovernanceAssuranceRemediationAgingBucket {
  key: "0_7" | "8_30" | "31_60" | "61_plus";
  label: string;
  min_days: number;
  max_days: number | null;
  count: number;
}

export interface GovernanceAssuranceArchiveRemediationSummary {
  archive_id: string;
  certificate_code: string;
  period_label: string;
  archived_at: string;
  total: number;
  active: number;
  critical_high_active: number;
  overdue_active: number;
  resolved: number;
  accepted: number;
  verification_pending: number;
  effective: number;
  partially_effective: number;
  ineffective: number;
}

export interface GovernanceAssuranceSeverityEffectivenessSummary {
  severity: GovernanceAssuranceFindingSeverity;
  total_findings: number;
  completed_verifications: number;
  effective: number;
  partially_effective: number;
  ineffective: number;
}

export interface GovernanceAssuranceTaxonomyAnalyticsRow {
  key: string;
  total: number;
  active: number;
  recurring: number;
  effective: number;
  partially_effective: number;
  ineffective: number;
}

export interface GovernanceAssuranceRemediationAnalytics {
  generated_at: string;
  total_findings: number;
  active_findings: number;
  closed_findings: number;
  overdue_active: number;
  unassigned_active: number;
  verification_pending: number;
  completed_verifications: number;
  effective_verifications: number;
  partially_effective_verifications: number;
  ineffective_verifications: number;
  effectiveness_rate_pct: number | null;
  median_resolution_days: number | null;
  median_acceptance_days: number | null;
  reopened_by_effectiveness: number;
  classified_findings: number;
  unclassified_findings: number;
  recurring_findings: number;
  recurring_active: number;
  recurrence_chains: number;
  total_capa_actions: number;
  active_capa_actions: number;
  overdue_capa_actions: number;
  preventive_actions: number;
  recurring_with_preventive_action: number;
  recurring_without_preventive_action: number;
  preventive_coverage_pct: number | null;
  active_aging: GovernanceAssuranceRemediationAgingBucket[];
  by_archive: GovernanceAssuranceArchiveRemediationSummary[];
  by_severity: GovernanceAssuranceSeverityEffectivenessSummary[];
  by_category: GovernanceAssuranceTaxonomyAnalyticsRow[];
  by_root_cause: GovernanceAssuranceTaxonomyAnalyticsRow[];
}
