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
