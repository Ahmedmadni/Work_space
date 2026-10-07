import type { ExecutiveGovernanceException } from "@/types/governance-exceptions";
import type {
  GovernanceOperatingRhythm,
  GovernanceTargetAssessment,
} from "@/types/governance-targets";

export type GovernanceAssuranceConclusion =
  | "satisfactory"
  | "needs_improvement"
  | "unsatisfactory"
  | "insufficient_evidence";

export type GovernanceReviewStatus = "draft" | "finalized";

export type GovernanceAssuranceEvidenceType =
  | "note"
  | "reference"
  | "url";

export interface GovernanceAssuranceEvidenceItem {
  id: string;
  type: GovernanceAssuranceEvidenceType;
  title: string;
  reference: string;
  note: string | null;
}

export interface ExecutiveGovernanceReview {
  id: string;
  owner_user_id: string;
  period_label: string;
  review_date: string;
  status: GovernanceReviewStatus;
  assurance_conclusion: GovernanceAssuranceConclusion;
  summary: string;
  management_response: string | null;
  target_version: number;
  source_window_meeting_ids: string[];
  target_assessments_snapshot: GovernanceTargetAssessment[];
  operating_rhythm_snapshot: GovernanceOperatingRhythm;
  exceptions_snapshot: ExecutiveGovernanceException[];
  evidence_snapshot: GovernanceAssuranceEvidenceItem[];
  source_generated_at: string;
  finalized_at: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutiveGovernanceReviewHistory {
  id: string;
  review_id: string;
  owner_user_id: string;
  version: number;
  snapshot: ExecutiveGovernanceReview;
  changed_by: string;
  changed_at: string;
}

export interface ExecutiveGovernanceReviewsData {
  reviews: ExecutiveGovernanceReview[];
  history: ExecutiveGovernanceReviewHistory[];
}

export interface CreateExecutiveGovernanceReviewInput {
  period_label: string;
  review_date: string;
  assurance_conclusion: GovernanceAssuranceConclusion;
  summary: string;
  management_response?: string | null;
  expected_target_version: number;
  source_window_meeting_ids: string[];
  target_assessments_snapshot: GovernanceTargetAssessment[];
  operating_rhythm_snapshot: GovernanceOperatingRhythm;
  exceptions_snapshot: ExecutiveGovernanceException[];
  evidence_snapshot: GovernanceAssuranceEvidenceItem[];
  source_generated_at: string;
}

export interface UpdateExecutiveGovernanceReviewInput {
  id: string;
  expected_version: number;
  period_label: string;
  review_date: string;
  assurance_conclusion: GovernanceAssuranceConclusion;
  summary: string;
  management_response?: string | null;
  evidence_snapshot: GovernanceAssuranceEvidenceItem[];
}


export type GovernanceAssuranceCadenceStatus =
  | "no_cadence"
  | "disabled"
  | "on_schedule"
  | "due_soon"
  | "overdue";

export interface GovernanceAssuranceCadenceProfile {
  owner_user_id: string;
  review_interval_days: number;
  warning_days_before: number | null;
  first_due_date: string;
  is_enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAssuranceCadenceState {
  profile: GovernanceAssuranceCadenceProfile | null;
  latest_finalized_review_id: string | null;
  latest_finalized_review_date: string | null;
  next_due_date: string | null;
  warning_date: string | null;
  days_to_due: number | null;
  status: GovernanceAssuranceCadenceStatus;
}

export interface SaveGovernanceAssuranceCadenceInput {
  expected_version?: number | null;
  review_interval_days: number;
  warning_days_before?: number | null;
  first_due_date: string;
  is_enabled: boolean;
}


export type GovernanceAssuranceActualDirection =
  | "improved"
  | "worsened"
  | "unchanged"
  | "insufficient_data";

export type GovernanceAssuranceComplianceTransition =
  | "recovered"
  | "new_breach"
  | "persistent_breach"
  | "persistent_met"
  | "status_changed"
  | "no_target"
  | "insufficient_data";

export interface GovernanceAssuranceMetricComparison {
  key: import("@/types/governance-targets").GovernanceTargetAssessment["key"];
  label: string;
  unit: "%" | "days" | "count";
  operator: "gte" | "lte";
  previous_actual: number | null;
  current_actual: number | null;
  actual_delta: number | null;
  actual_direction: GovernanceAssuranceActualDirection;
  previous_target: number | null;
  current_target: number | null;
  target_changed: boolean;
  previous_status: import("@/types/governance-targets").GovernanceTargetStatus;
  current_status: import("@/types/governance-targets").GovernanceTargetStatus;
  compliance_transition: GovernanceAssuranceComplianceTransition;
}

export interface GovernanceAssuranceExceptionComparison {
  previous_active: number;
  current_active: number;
  persistent_active: number;
  newly_active: number;
  resolved_since_previous: number;
  no_longer_present: number;
  current_overdue: number;
}

export interface GovernanceAssuranceReviewComparison {
  previous_review: ExecutiveGovernanceReview;
  current_review: ExecutiveGovernanceReview;
  target_version_changed: boolean;
  metrics: GovernanceAssuranceMetricComparison[];
  summary: {
    previous_met: number;
    current_met: number;
    previous_not_met: number;
    current_not_met: number;
    recovered_metrics: number;
    new_breaches: number;
    persistent_breaches: number;
    target_changed_metrics: number;
    improved_actuals: number;
    worsened_actuals: number;
  };
  exceptions: GovernanceAssuranceExceptionComparison;
}

export interface GovernanceAssuranceHistoryPoint {
  review_id: string;
  review_date: string;
  period_label: string;
  assurance_conclusion: GovernanceAssuranceConclusion;
  target_version: number;
  met_count: number;
  not_met_count: number;
  insufficient_count: number;
  no_target_count: number;
  active_exceptions: number;
  overdue_exceptions: number;
  evidence_count: number;
}


export type GovernanceAssuranceSignoffStatus =
  | "open"
  | "completed"
  | "declined";

export type GovernanceAssuranceAttestationRole =
  | "prepared_by"
  | "reviewed_by"
  | "approved_by";

export type GovernanceAssuranceAttestationStatus =
  | "pending"
  | "attested"
  | "attested_with_reservation"
  | "declined";

export interface GovernanceAssuranceSignatoryCandidate {
  user_id: string;
  display_name: string;
  email: string | null;
  source: "attendee" | "chair" | "creator";
}

export interface GovernanceAssuranceAttestation {
  id: string;
  signoff_id: string;
  review_id: string;
  owner_user_id: string;
  role: GovernanceAssuranceAttestationRole;
  sequence_no: number;
  assignee_user_id: string;
  assignee_name_snapshot: string;
  assignee_email_snapshot: string | null;
  status: GovernanceAssuranceAttestationStatus;
  statement: string | null;
  reservation: string | null;
  acted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAssuranceSignoff {
  id: string;
  review_id: string;
  owner_user_id: string;
  status: GovernanceAssuranceSignoffStatus;
  version: number;
  completed_at: string | null;
  declined_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  attestations: GovernanceAssuranceAttestation[];
}

export interface GovernanceAssuranceOwnedSignoff {
  signoff: GovernanceAssuranceSignoff;
  review: ExecutiveGovernanceReview;
}

export interface GovernanceAssuranceAttestationInboxItem {
  attestation: GovernanceAssuranceAttestation;
  signoff: GovernanceAssuranceSignoff;
  review: ExecutiveGovernanceReview;
  can_act: boolean;
}

export interface GovernanceAssuranceSignoffData {
  owned: GovernanceAssuranceOwnedSignoff[];
  inbox: GovernanceAssuranceAttestationInboxItem[];
}

export interface GovernanceAssuranceSignoffAssignmentInput {
  role: GovernanceAssuranceAttestationRole;
  assignee_user_id: string;
  assignee_name: string;
  assignee_email?: string | null;
}

export interface SaveGovernanceAssuranceSignoffPlanInput {
  review_id: string;
  expected_signoff_version?: number | null;
  assignments: GovernanceAssuranceSignoffAssignmentInput[];
}

export interface ActOnGovernanceAssuranceAttestationInput {
  attestation_id: string;
  expected_version: number;
  decision: Extract<
    GovernanceAssuranceAttestationStatus,
    "attested" | "attested_with_reservation" | "declined"
  >;
  statement: string;
  reservation?: string | null;
}
