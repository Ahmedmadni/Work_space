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
