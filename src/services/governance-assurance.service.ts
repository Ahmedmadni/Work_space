import { isSupabaseBackend } from "@/lib/backend-config";
import { listExecutiveGovernanceExceptions } from "@/services/governance-exceptions.service";
import { listExecutiveStrategyMeetings } from "@/services/executive-meetings.service";
import { buildExecutiveGovernanceTrends } from "@/services/governance-trends.service";
import {
  evaluateExecutiveGovernanceTargets,
  listExecutiveGovernanceTargets,
} from "@/services/governance-targets.service";
import { supabaseRest } from "@/services/supabase-rest";
import type { ExecutiveGovernanceException } from "@/types/governance-exceptions";
import type {
  CreateExecutiveGovernanceReviewInput,
  ExecutiveGovernanceReview,
  ExecutiveGovernanceReviewHistory,
  ExecutiveGovernanceReviewsData,
  GovernanceAssuranceConclusion,
  GovernanceAssuranceEvidenceItem,
  GovernanceAssuranceEvidenceType,
  GovernanceAssuranceCadenceProfile,
  GovernanceAssuranceCadenceState,
  GovernanceAssuranceCadenceStatus,
  ActOnGovernanceAssuranceAttestationInput,
  GovernanceAssuranceAttestation,
  GovernanceAssuranceAttestationInboxItem,
  GovernanceAssuranceAttestationRole,
  GovernanceAssuranceAttestationStatus,
  GovernanceAssuranceHistoryPoint,
  GovernanceAssuranceMetricComparison,
  GovernanceAssuranceOwnedSignoff,
  GovernanceAssuranceReviewComparison,
  GovernanceAssuranceSignatoryCandidate,
  GovernanceAssuranceSignoff,
  GovernanceAssuranceSignoffData,
  GovernanceAssuranceSignoffStatus,
  GovernanceReviewStatus,
  SaveGovernanceAssuranceCadenceInput,
  SaveGovernanceAssuranceSignoffPlanInput,
  UpdateExecutiveGovernanceReviewInput,
} from "@/types/governance-assurance";
import type {
  GovernanceOperatingRhythm,
  GovernanceTargetAssessment,
  GovernanceTargetOperator,
  GovernanceTargetStatus,
} from "@/types/governance-targets";
import type {
  GovernancePeriodMetric,
  GovernanceTrendDirection,
} from "@/types/governance-trends";

const LOCAL_KEY = "projectflow.executive-governance-assurance.v1";
const CADENCE_LOCAL_KEY = "projectflow.executive-governance-assurance-cadence.v1";
const SIGNOFF_LOCAL_KEY = "projectflow.executive-governance-assurance-signoff.v1";

interface LocalStore {
  version: 1;
  reviews: ExecutiveGovernanceReview[];
  history: ExecutiveGovernanceReviewHistory[];
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") {
    return { version: 1, reviews: [], history: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalStore>;
    return {
      version: 1,
      reviews: Array.isArray(parsed.reviews)
        ? parsed.reviews
            .map(normalizeReview)
            .filter((row): row is ExecutiveGovernanceReview => !!row)
        : [],
      history: Array.isArray(parsed.history)
        ? parsed.history
            .map(normalizeHistory)
            .filter(
              (row): row is ExecutiveGovernanceReviewHistory => !!row,
            )
        : [],
    };
  } catch {
    return { version: 1, reviews: [], history: [] };
  }
}

function writeLocal(store: LocalStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

function intOrNull(value: unknown) {
  const valueNumber = numberOrNull(value);
  return valueNumber == null ? null : Math.trunc(valueNumber);
}

function conclusionValue(value: unknown): GovernanceAssuranceConclusion | null {
  return value === "satisfactory" ||
    value === "needs_improvement" ||
    value === "unsatisfactory" ||
    value === "insufficient_evidence"
    ? value
    : null;
}

function reviewStatus(value: unknown): GovernanceReviewStatus | null {
  return value === "draft" || value === "finalized" ? value : null;
}

function evidenceType(value: unknown): GovernanceAssuranceEvidenceType | null {
  return value === "note" || value === "reference" || value === "url"
    ? value
    : null;
}

function trendDirection(value: unknown): GovernanceTrendDirection | null {
  return value === "improved" ||
    value === "worsened" ||
    value === "unchanged" ||
    value === "insufficient_data"
    ? value
    : null;
}

function targetStatus(value: unknown): GovernanceTargetStatus | null {
  return value === "met" ||
    value === "not_met" ||
    value === "no_target" ||
    value === "insufficient_data"
    ? value
    : null;
}

function targetOperator(value: unknown): GovernanceTargetOperator | null {
  return value === "gte" || value === "lte" ? value : null;
}

function normalizeTrend(value: unknown): GovernancePeriodMetric | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const direction = trendDirection(row.direction);
  if (!direction) return null;
  return {
    current: numberOrNull(row.current),
    previous: numberOrNull(row.previous),
    delta: numberOrNull(row.delta),
    direction,
  };
}

function normalizeAssessment(
  value: unknown,
): GovernanceTargetAssessment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys: GovernanceTargetAssessment["key"][] = [
    "decision_resolution",
    "deferred_rate",
    "action_completion",
    "overdue_open",
    "unowned_open",
    "on_time_completion",
    "median_completion_days",
    "repeated_deferrals",
  ];
  const key = keys.includes(row.key as GovernanceTargetAssessment["key"])
    ? (row.key as GovernanceTargetAssessment["key"])
    : null;
  const status = targetStatus(row.status);
  const operator = targetOperator(row.operator);
  const trend = normalizeTrend(row.trend);
  const unit =
    row.unit === "%" || row.unit === "days" || row.unit === "count"
      ? row.unit
      : null;

  if (
    !key ||
    !status ||
    !operator ||
    !unit ||
    !trend ||
    typeof row.label !== "string"
  ) {
    return null;
  }

  return {
    key,
    label: row.label,
    operator,
    actual: numberOrNull(row.actual),
    target: numberOrNull(row.target),
    unit,
    status,
    gap: numberOrNull(row.gap),
    trend,
  };
}

function normalizeRhythm(value: unknown): GovernanceOperatingRhythm | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status =
    row.status === "on_schedule" ||
    row.status === "due_soon" ||
    row.status === "overdue" ||
    row.status === "no_target" ||
    row.status === "no_meetings"
      ? row.status
      : null;
  if (!status) return null;

  return {
    cadence_days: intOrNull(row.cadence_days),
    warning_days_before: intOrNull(row.warning_days_before),
    last_finalized_meeting_date:
      typeof row.last_finalized_meeting_date === "string"
        ? row.last_finalized_meeting_date
        : null,
    next_due_date:
      typeof row.next_due_date === "string" ? row.next_due_date : null,
    warning_date:
      typeof row.warning_date === "string" ? row.warning_date : null,
    days_to_due: intOrNull(row.days_to_due),
    status,
  };
}

function normalizeException(value: unknown): ExecutiveGovernanceException | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const metricKeys = [
    "decision_resolution",
    "deferred_rate",
    "action_completion",
    "overdue_open",
    "unowned_open",
    "on_time_completion",
    "median_completion_days",
    "repeated_deferrals",
  ] as const;
  const statuses = [
    "open",
    "mitigating",
    "accepted",
    "resolved",
    "cancelled",
  ] as const;
  const metric = metricKeys.includes(row.metric_key as (typeof metricKeys)[number])
    ? (row.metric_key as ExecutiveGovernanceException["metric_key"])
    : null;
  const status = statuses.includes(row.status as (typeof statuses)[number])
    ? (row.status as ExecutiveGovernanceException["status"])
    : null;
  const operator =
    row.target_operator === "gte" || row.target_operator === "lte"
      ? row.target_operator
      : null;
  const unit =
    row.target_unit === "%" ||
    row.target_unit === "days" ||
    row.target_unit === "count"
      ? row.target_unit
      : null;
  const actual = numberOrNull(row.actual_value);
  const target = numberOrNull(row.target_value);
  const targetVersion = intOrNull(row.target_version);
  const version = intOrNull(row.version);

  if (
    typeof row.id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.rationale !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !metric ||
    !status ||
    !operator ||
    !unit ||
    actual == null ||
    target == null ||
    targetVersion == null ||
    version == null
  ) {
    return null;
  }

  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    metric_key: metric,
    title: row.title,
    rationale: row.rationale,
    corrective_action:
      typeof row.corrective_action === "string"
        ? row.corrective_action
        : null,
    responsible_name:
      typeof row.responsible_name === "string" ? row.responsible_name : null,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
    status,
    actual_value: actual,
    target_value: target,
    target_operator: operator,
    target_unit: unit,
    target_version: targetVersion,
    source_window_meeting_ids: Array.isArray(row.source_window_meeting_ids)
      ? row.source_window_meeting_ids.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    resolved_at:
      typeof row.resolved_at === "string" ? row.resolved_at : null,
    version,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeEvidence(
  value: unknown,
): GovernanceAssuranceEvidenceItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const type = evidenceType(row.type);
  if (
    typeof row.id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.reference !== "string" ||
    !type
  ) {
    return null;
  }
  return {
    id: row.id,
    type,
    title: row.title,
    reference: row.reference,
    note: typeof row.note === "string" ? row.note : null,
  };
}

function normalizeReview(value: unknown): ExecutiveGovernanceReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = reviewStatus(row.status);
  const conclusion = conclusionValue(row.assurance_conclusion);
  const rhythm = normalizeRhythm(row.operating_rhythm_snapshot);
  const targetVersion = intOrNull(row.target_version);
  const version = intOrNull(row.version);

  if (
    typeof row.id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.period_label !== "string" ||
    typeof row.review_date !== "string" ||
    typeof row.summary !== "string" ||
    typeof row.source_generated_at !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !status ||
    !conclusion ||
    !rhythm ||
    targetVersion == null ||
    version == null
  ) {
    return null;
  }

  const assessments = Array.isArray(row.target_assessments_snapshot)
    ? row.target_assessments_snapshot
        .map(normalizeAssessment)
        .filter((item): item is GovernanceTargetAssessment => !!item)
    : [];
  if (assessments.length !== 8) return null;

  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    period_label: row.period_label,
    review_date: row.review_date,
    status,
    assurance_conclusion: conclusion,
    summary: row.summary,
    management_response:
      typeof row.management_response === "string"
        ? row.management_response
        : null,
    target_version: targetVersion,
    source_window_meeting_ids: Array.isArray(row.source_window_meeting_ids)
      ? row.source_window_meeting_ids.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    target_assessments_snapshot: assessments,
    operating_rhythm_snapshot: rhythm,
    exceptions_snapshot: Array.isArray(row.exceptions_snapshot)
      ? row.exceptions_snapshot
          .map(normalizeException)
          .filter((item): item is ExecutiveGovernanceException => !!item)
      : [],
    evidence_snapshot: Array.isArray(row.evidence_snapshot)
      ? row.evidence_snapshot
          .map(normalizeEvidence)
          .filter(
            (item): item is GovernanceAssuranceEvidenceItem => !!item,
          )
      : [],
    source_generated_at: row.source_generated_at,
    finalized_at:
      typeof row.finalized_at === "string" ? row.finalized_at : null,
    version,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeHistory(
  value: unknown,
): ExecutiveGovernanceReviewHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const snapshot = normalizeReview(row.snapshot);
  const version = intOrNull(row.version);
  if (
    typeof row.id !== "string" ||
    typeof row.review_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.changed_by !== "string" ||
    typeof row.changed_at !== "string" ||
    version == null ||
    !snapshot
  ) {
    return null;
  }
  return {
    id: row.id,
    review_id: row.review_id,
    owner_user_id: row.owner_user_id,
    version,
    snapshot,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
  };
}

function validateEvidence(items: GovernanceAssuranceEvidenceItem[]) {
  if (items.length > 50) {
    throw new Error("الحد الأقصى للأدلة هو 50 عنصرًا.");
  }
  const ids = new Set<string>();
  for (const item of items) {
    if (
      !item.id.trim() ||
      item.id.length > 120 ||
      !item.title.trim() ||
      item.title.trim().length > 180 ||
      !item.reference.trim() ||
      item.reference.trim().length > 2000 ||
      (item.note?.length ?? 0) > 4000
    ) {
      throw new Error("بيانات Evidence غير صالحة.");
    }
    if (ids.has(item.id)) {
      throw new Error("يوجد Evidence ID مكرر.");
    }
    ids.add(item.id);
    if (
      item.type === "url" &&
      !/^https?:\/\//i.test(item.reference.trim())
    ) {
      throw new Error("رابط Evidence يجب أن يبدأ بـ http:// أو https://.");
    }
  }
}

function validateReviewNarrative(
  periodLabel: string,
  reviewDate: string,
  summary: string,
  managementResponse: string | null | undefined,
  evidence: GovernanceAssuranceEvidenceItem[],
) {
  if (!periodLabel.trim() || periodLabel.trim().length > 180) {
    throw new Error("Period Label مطلوب وبحد أقصى 180 حرفًا.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
    throw new Error("Review Date غير صالح.");
  }
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  if (reviewDate > today) {
    throw new Error("Review Date لا يمكن أن تكون في المستقبل.");
  }
  if (!summary.trim() || summary.trim().length > 12000) {
    throw new Error("Summary مطلوب وبحد أقصى 12000 حرف.");
  }
  if ((managementResponse?.length ?? 0) > 12000) {
    throw new Error("Management Response طويل جدًا.");
  }
  validateEvidence(evidence);
}

function sameIds(left: string[], right: string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function listExecutiveGovernanceReviews(): Promise<ExecutiveGovernanceReviewsData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_executive_governance_reviews",
      { method: "POST", body: {} },
    );
    return {
      reviews: Array.isArray(raw.reviews)
        ? raw.reviews
            .map(normalizeReview)
            .filter((row): row is ExecutiveGovernanceReview => !!row)
        : [],
      history: Array.isArray(raw.history)
        ? raw.history
            .map(normalizeHistory)
            .filter(
              (row): row is ExecutiveGovernanceReviewHistory => !!row,
            )
        : [],
    };
  }

  const store = readLocal();
  return {
    reviews: [...store.reviews].sort(
      (a, b) =>
        b.review_date.localeCompare(a.review_date) ||
        b.created_at.localeCompare(a.created_at),
    ),
    history: [...store.history].sort((a, b) =>
      b.changed_at.localeCompare(a.changed_at),
    ),
  };
}

export async function createExecutiveGovernanceReview(
  input: CreateExecutiveGovernanceReviewInput,
): Promise<ExecutiveGovernanceReview> {
  validateReviewNarrative(
    input.period_label,
    input.review_date,
    input.summary,
    input.management_response,
    input.evidence_snapshot,
  );

  if (input.target_assessments_snapshot.length !== 8) {
    throw new Error("Assurance Review يجب أن تحتوي الثمانية Governance Metrics.");
  }
  const sourceIds = [...new Set(input.source_window_meeting_ids)];
  if (
    sourceIds.length < 1 ||
    sourceIds.length > 3 ||
    sourceIds.length !== input.source_window_meeting_ids.length
  ) {
    throw new Error("Source window يجب أن تحتوي 1 إلى 3 اجتماعات بدون تكرار.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/create_executive_governance_review",
      {
        method: "POST",
        body: {
          p_period_label: input.period_label,
          p_review_date: input.review_date,
          p_assurance_conclusion: input.assurance_conclusion,
          p_summary: input.summary,
          p_management_response: input.management_response ?? null,
          p_expected_target_version: input.expected_target_version,
          p_source_window_meeting_ids: input.source_window_meeting_ids,
          p_target_assessments_snapshot:
            input.target_assessments_snapshot,
          p_operating_rhythm_snapshot:
            input.operating_rhythm_snapshot,
          p_exceptions_snapshot: input.exceptions_snapshot,
          p_source_generated_at: input.source_generated_at,
          p_evidence_snapshot: input.evidence_snapshot,
        },
      },
    );
    const review = normalizeReview(raw);
    if (!review) {
      throw new Error("عاد الخادم بمراجعة حوكمة غير صالحة.");
    }
    return review;
  }

  const [targetData, meetingData, exceptionData] = await Promise.all([
    listExecutiveGovernanceTargets(),
    listExecutiveStrategyMeetings(),
    listExecutiveGovernanceExceptions(),
  ]);
  const profile = targetData.profile;
  if (!profile) throw new Error("احفظ Governance Targets أولًا.");
  if (profile.version !== input.expected_target_version) {
    throw new Error("تغيرت Governance Targets. حدّث البيانات وأعد المحاولة.");
  }

  const trends = buildExecutiveGovernanceTrends(meetingData);
  if (!sameIds(trends.period.current_meeting_ids, sourceIds)) {
    throw new Error("تغيرت نافذة الاجتماعات الحالية. حدّث البيانات وأعد المحاولة.");
  }
  const evaluation = evaluateExecutiveGovernanceTargets(
    targetData,
    trends,
    meetingData,
  );

  const currentExceptions = new Map(
    exceptionData.exceptions.map((row) => [row.id, row] as const),
  );
  const verifiedExceptions = input.exceptions_snapshot.map((snapshot) => {
    const current = currentExceptions.get(snapshot.id);
    if (!current || current.version !== snapshot.version) {
      throw new Error(
        "تغيرت Governance Exceptions. حدّث البيانات وأعد المحاولة.",
      );
    }
    return current;
  });

  const now = new Date().toISOString();
  const review: ExecutiveGovernanceReview = {
    id: crypto.randomUUID(),
    owner_user_id: profile.owner_user_id,
    period_label: input.period_label.trim(),
    review_date: input.review_date,
    status: "draft",
    assurance_conclusion: input.assurance_conclusion,
    summary: input.summary.trim(),
    management_response: input.management_response?.trim() || null,
    target_version: profile.version,
    source_window_meeting_ids: [...trends.period.current_meeting_ids],
    target_assessments_snapshot: evaluation.assessments,
    operating_rhythm_snapshot: evaluation.rhythm,
    exceptions_snapshot: verifiedExceptions,
    evidence_snapshot: input.evidence_snapshot.map((row) => ({
      ...row,
      title: row.title.trim(),
      reference: row.reference.trim(),
      note: row.note?.trim() || null,
    })),
    source_generated_at: now,
    finalized_at: null,
    version: 1,
    created_by: profile.owner_user_id,
    created_at: now,
    updated_at: now,
  };

  const history: ExecutiveGovernanceReviewHistory = {
    id: crypto.randomUUID(),
    review_id: review.id,
    owner_user_id: review.owner_user_id,
    version: review.version,
    snapshot: structuredClone(review),
    changed_by: review.owner_user_id,
    changed_at: now,
  };
  const store = readLocal();
  store.reviews = [review, ...store.reviews];
  store.history = [history, ...store.history].slice(0, 100);
  writeLocal(store);
  return review;
}

export async function updateExecutiveGovernanceReview(
  input: UpdateExecutiveGovernanceReviewInput,
): Promise<ExecutiveGovernanceReview> {
  validateReviewNarrative(
    input.period_label,
    input.review_date,
    input.summary,
    input.management_response,
    input.evidence_snapshot,
  );

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/update_executive_governance_review",
      {
        method: "POST",
        body: {
          p_review_id: input.id,
          p_expected_version: input.expected_version,
          p_period_label: input.period_label,
          p_review_date: input.review_date,
          p_assurance_conclusion: input.assurance_conclusion,
          p_summary: input.summary,
          p_management_response: input.management_response ?? null,
          p_evidence_snapshot: input.evidence_snapshot,
        },
      },
    );
    const review = normalizeReview(raw);
    if (!review) throw new Error("عاد الخادم بمراجعة حوكمة غير صالحة.");
    return review;
  }

  const store = readLocal();
  const existing = store.reviews.find((row) => row.id === input.id);
  if (!existing) throw new Error("Governance Review غير موجودة.");
  if (existing.status !== "draft") {
    throw new Error("المراجعة Finalized ولا يمكن تعديلها.");
  }
  if (existing.version !== input.expected_version) {
    throw new Error("تم تعديل المراجعة. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const review: ExecutiveGovernanceReview = {
    ...existing,
    period_label: input.period_label.trim(),
    review_date: input.review_date,
    assurance_conclusion: input.assurance_conclusion,
    summary: input.summary.trim(),
    management_response: input.management_response?.trim() || null,
    evidence_snapshot: input.evidence_snapshot.map((row) => ({
      ...row,
      title: row.title.trim(),
      reference: row.reference.trim(),
      note: row.note?.trim() || null,
    })),
    version: existing.version + 1,
    updated_at: now,
  };

  const history: ExecutiveGovernanceReviewHistory = {
    id: crypto.randomUUID(),
    review_id: review.id,
    owner_user_id: review.owner_user_id,
    version: review.version,
    snapshot: structuredClone(review),
    changed_by: review.owner_user_id,
    changed_at: now,
  };
  store.reviews = store.reviews.map((row) =>
    row.id === review.id ? review : row,
  );
  store.history = [history, ...store.history].slice(0, 100);
  writeLocal(store);
  return review;
}

export async function finalizeExecutiveGovernanceReview(
  reviewId: string,
  expectedVersion: number,
): Promise<ExecutiveGovernanceReview> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/finalize_executive_governance_review",
      {
        method: "POST",
        body: {
          p_review_id: reviewId,
          p_expected_version: expectedVersion,
        },
      },
    );
    const review = normalizeReview(raw);
    if (!review) throw new Error("عاد الخادم بمراجعة حوكمة غير صالحة.");
    return review;
  }

  const store = readLocal();
  const existing = store.reviews.find((row) => row.id === reviewId);
  if (!existing) throw new Error("Governance Review غير موجودة.");
  if (existing.status !== "draft") {
    throw new Error("المراجعة Finalized بالفعل.");
  }
  if (existing.version !== expectedVersion) {
    throw new Error("تم تعديل المراجعة. حدّث البيانات وأعد المحاولة.");
  }
  if (
    (existing.assurance_conclusion === "needs_improvement" ||
      existing.assurance_conclusion === "unsatisfactory") &&
    !existing.management_response?.trim()
  ) {
    throw new Error(
      "Management Response مطلوبة قبل Finalize لهذه النتيجة.",
    );
  }

  const now = new Date().toISOString();
  const review: ExecutiveGovernanceReview = {
    ...existing,
    status: "finalized",
    finalized_at: now,
    version: existing.version + 1,
    updated_at: now,
  };
  const history: ExecutiveGovernanceReviewHistory = {
    id: crypto.randomUUID(),
    review_id: review.id,
    owner_user_id: review.owner_user_id,
    version: review.version,
    snapshot: structuredClone(review),
    changed_by: review.owner_user_id,
    changed_at: now,
  };
  store.reviews = store.reviews.map((row) =>
    row.id === review.id ? review : row,
  );
  store.history = [history, ...store.history].slice(0, 100);
  writeLocal(store);
  return review;
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const protectedText = /^[=+@-]/.test(raw.trimStart())
    ? "'" + raw
    : raw;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

function csvLine(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export function governanceAssuranceReviewCsv(
  review: ExecutiveGovernanceReview,
) {
  const lines: string[] = [
    csvLine(["Governance Assurance Review", review.period_label]),
    csvLine(["Review Date", review.review_date]),
    csvLine(["Status", review.status]),
    csvLine(["Assurance Conclusion", review.assurance_conclusion]),
    csvLine(["Target Version", review.target_version]),
    csvLine(["Source Generated At", review.source_generated_at]),
    csvLine(["Finalized At", review.finalized_at ?? ""]),
    csvLine(["Summary", review.summary]),
    csvLine(["Management Response", review.management_response ?? ""]),
    "",
    csvLine([
      "Metric",
      "Actual",
      "Operator",
      "Target",
      "Unit",
      "Status",
      "Gap",
      "Previous",
      "Delta",
      "Trend",
    ]),
  ];

  for (const row of review.target_assessments_snapshot) {
    lines.push(
      csvLine([
        row.label,
        row.actual ?? "",
        row.operator === "gte" ? ">=" : "<=",
        row.target ?? "",
        row.unit,
        row.status,
        row.gap ?? "",
        row.trend.previous ?? "",
        row.trend.delta ?? "",
        row.trend.direction,
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvLine([
      "Operating Rhythm",
      "Cadence Days",
      "Warning Days",
      "Last Finalized Meeting",
      "Next Due",
      "Warning Date",
      "Days To Due",
      "Status",
    ]),
  );
  lines.push(
    csvLine([
      "Operating Rhythm",
      review.operating_rhythm_snapshot.cadence_days ?? "",
      review.operating_rhythm_snapshot.warning_days_before ?? "",
      review.operating_rhythm_snapshot.last_finalized_meeting_date ?? "",
      review.operating_rhythm_snapshot.next_due_date ?? "",
      review.operating_rhythm_snapshot.warning_date ?? "",
      review.operating_rhythm_snapshot.days_to_due ?? "",
      review.operating_rhythm_snapshot.status,
    ]),
  );

  lines.push("");
  lines.push(
    csvLine([
      "Exception",
      "Metric",
      "Status",
      "Actual",
      "Operator",
      "Target",
      "Unit",
      "Responsible",
      "Due Date",
      "Rationale",
      "Corrective Action",
      "Target Version",
      "Exception Version",
    ]),
  );
  for (const row of review.exceptions_snapshot) {
    lines.push(
      csvLine([
        row.title,
        row.metric_key,
        row.status,
        row.actual_value,
        row.target_operator === "gte" ? ">=" : "<=",
        row.target_value,
        row.target_unit,
        row.responsible_name ?? "",
        row.due_date ?? "",
        row.rationale,
        row.corrective_action ?? "",
        row.target_version,
        row.version,
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvLine(["Evidence", "Type", "Reference", "Note"]),
  );
  for (const row of review.evidence_snapshot) {
    lines.push(
      csvLine([
        row.title,
        row.type,
        row.reference,
        row.note ?? "",
      ]),
    );
  }

  return "\uFEFF" + lines.join("\r\n");
}

export function downloadGovernanceAssuranceReviewCsv(
  review: ExecutiveGovernanceReview,
) {
  const blob = new Blob([governanceAssuranceReviewCsv(review)], {
    type: "text/csv;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `governance-assurance-${review.review_date}-${review.id.slice(0, 8)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}


interface LocalCadenceStore {
  version: 1;
  profile: GovernanceAssuranceCadenceProfile | null;
}

function normalizeCadenceStatus(
  value: unknown,
): GovernanceAssuranceCadenceStatus | null {
  return value === "no_cadence" ||
    value === "disabled" ||
    value === "on_schedule" ||
    value === "due_soon" ||
    value === "overdue"
    ? value
    : null;
}

function normalizeCadenceProfile(
  value: unknown,
): GovernanceAssuranceCadenceProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const interval = intOrNull(row.review_interval_days);
  const warning = intOrNull(row.warning_days_before);
  const version = intOrNull(row.version);
  if (
    typeof row.owner_user_id !== "string" ||
    typeof row.first_due_date !== "string" ||
    typeof row.is_enabled !== "boolean" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    interval == null ||
    version == null
  ) {
    return null;
  }
  return {
    owner_user_id: row.owner_user_id,
    review_interval_days: interval,
    warning_days_before: warning,
    first_due_date: row.first_due_date,
    is_enabled: row.is_enabled,
    version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCadenceState(
  value: unknown,
): GovernanceAssuranceCadenceState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = normalizeCadenceStatus(row.status);
  if (!status) return null;
  return {
    profile: normalizeCadenceProfile(row.profile),
    latest_finalized_review_id:
      typeof row.latest_finalized_review_id === "string"
        ? row.latest_finalized_review_id
        : null,
    latest_finalized_review_date:
      typeof row.latest_finalized_review_date === "string"
        ? row.latest_finalized_review_date
        : null,
    next_due_date:
      typeof row.next_due_date === "string" ? row.next_due_date : null,
    warning_date:
      typeof row.warning_date === "string" ? row.warning_date : null,
    days_to_due: intOrNull(row.days_to_due),
    status,
  };
}

function readLocalCadence(): LocalCadenceStore {
  if (typeof window === "undefined") {
    return { version: 1, profile: null };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CADENCE_LOCAL_KEY) ?? "{}",
    ) as Partial<LocalCadenceStore>;
    return {
      version: 1,
      profile: normalizeCadenceProfile(parsed.profile),
    };
  } catch {
    return { version: 1, profile: null };
  }
}

function writeLocalCadence(store: LocalCadenceStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CADENCE_LOCAL_KEY, JSON.stringify(store));
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDateDays(value: string, days: number) {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function dayDifference(from: string, to: string) {
  const start = new Date(from + "T12:00:00").getTime();
  const end = new Date(to + "T12:00:00").getTime();
  return Math.round((end - start) / 86_400_000);
}

function buildLocalCadenceState(
  profile: GovernanceAssuranceCadenceProfile | null,
  reviews: ExecutiveGovernanceReview[],
): GovernanceAssuranceCadenceState {
  if (!profile) {
    return {
      profile: null,
      latest_finalized_review_id: null,
      latest_finalized_review_date: null,
      next_due_date: null,
      warning_date: null,
      days_to_due: null,
      status: "no_cadence",
    };
  }

  const latest =
    reviews
      .filter((row) => row.status === "finalized")
      .slice()
      .sort(
        (a, b) =>
          b.review_date.localeCompare(a.review_date) ||
          (b.finalized_at ?? "").localeCompare(a.finalized_at ?? ""),
      )[0] ?? null;

  if (!profile.is_enabled) {
    return {
      profile,
      latest_finalized_review_id: latest?.id ?? null,
      latest_finalized_review_date: latest?.review_date ?? null,
      next_due_date: null,
      warning_date: null,
      days_to_due: null,
      status: "disabled",
    };
  }

  const nextDue = latest
    ? addDateDays(latest.review_date, profile.review_interval_days)
    : profile.first_due_date;
  const warningDate =
    profile.warning_days_before == null
      ? null
      : addDateDays(nextDue, -profile.warning_days_before);
  const today = dateKey(new Date());
  const daysToDue = dayDifference(today, nextDue);
  const status: GovernanceAssuranceCadenceStatus =
    today > nextDue
      ? "overdue"
      : warningDate && today >= warningDate
        ? "due_soon"
        : "on_schedule";

  return {
    profile,
    latest_finalized_review_id: latest?.id ?? null,
    latest_finalized_review_date: latest?.review_date ?? null,
    next_due_date: nextDue,
    warning_date: warningDate,
    days_to_due: daysToDue,
    status,
  };
}

function validateCadenceInput(input: SaveGovernanceAssuranceCadenceInput) {
  if (
    !Number.isInteger(input.review_interval_days) ||
    input.review_interval_days < 1 ||
    input.review_interval_days > 366
  ) {
    throw new Error("Review Interval يجب أن يكون بين 1 و366 يومًا.");
  }
  if (
    input.warning_days_before != null &&
    (!Number.isInteger(input.warning_days_before) ||
      input.warning_days_before < 0 ||
      input.warning_days_before > 90 ||
      input.warning_days_before > input.review_interval_days)
  ) {
    throw new Error("Warning Days غير صالحة.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.first_due_date)) {
    throw new Error("First Due Date غير صالح.");
  }
}

export async function listGovernanceAssuranceCadence(): Promise<GovernanceAssuranceCadenceState> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/list_executive_governance_assurance_cadence",
      { method: "POST", body: {} },
    );
    const state = normalizeCadenceState(raw);
    if (!state) {
      throw new Error("عاد الخادم بحالة Assurance Cadence غير صالحة.");
    }
    return state;
  }

  return buildLocalCadenceState(
    readLocalCadence().profile,
    readLocal().reviews,
  );
}

export async function saveGovernanceAssuranceCadence(
  input: SaveGovernanceAssuranceCadenceInput,
): Promise<GovernanceAssuranceCadenceState> {
  validateCadenceInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_executive_governance_assurance_cadence",
      {
        method: "POST",
        body: {
          p_expected_version: input.expected_version ?? null,
          p_review_interval_days: input.review_interval_days,
          p_warning_days_before: input.warning_days_before ?? null,
          p_first_due_date: input.first_due_date,
          p_is_enabled: input.is_enabled,
        },
      },
    );
    const state = normalizeCadenceState(raw);
    if (!state) {
      throw new Error("عاد الخادم بحالة Assurance Cadence غير صالحة.");
    }
    return state;
  }

  const store = readLocalCadence();
  const existing = store.profile;
  if (
    existing &&
    (input.expected_version == null ||
      input.expected_version !== existing.version)
  ) {
    throw new Error("تم تعديل Assurance Cadence. حدّث البيانات وأعد المحاولة.");
  }
  if (!existing && input.expected_version != null) {
    throw new Error("تم تعديل Assurance Cadence. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const profile: GovernanceAssuranceCadenceProfile = {
    owner_user_id: existing?.owner_user_id ?? "local-user",
    review_interval_days: input.review_interval_days,
    warning_days_before: input.warning_days_before ?? null,
    first_due_date: input.first_due_date,
    is_enabled: input.is_enabled,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store.profile = profile;
  writeLocalCadence(store);
  return buildLocalCadenceState(profile, readLocal().reviews);
}

export async function refreshGovernanceAssuranceNotifications(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  const value = await supabaseRest<unknown>(
    "rpc/refresh_governance_assurance_notifications",
    { method: "POST", body: {} },
  );
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}


function isActiveAssuranceException(row: ExecutiveGovernanceException) {
  return (
    row.status === "open" ||
    row.status === "mitigating" ||
    row.status === "accepted"
  );
}

function metricActualDirection(
  previous: number | null,
  current: number | null,
  operator: GovernanceTargetOperator,
): GovernanceAssuranceMetricComparison["actual_direction"] {
  if (previous == null || current == null) return "insufficient_data";
  if (current === previous) return "unchanged";
  if (operator === "gte") {
    return current > previous ? "improved" : "worsened";
  }
  return current < previous ? "improved" : "worsened";
}

function complianceTransition(
  previous: GovernanceTargetStatus,
  current: GovernanceTargetStatus,
): GovernanceAssuranceMetricComparison["compliance_transition"] {
  if (
    previous === "insufficient_data" ||
    current === "insufficient_data"
  ) {
    return "insufficient_data";
  }
  if (previous === "no_target" || current === "no_target") {
    return previous === "no_target" && current === "no_target"
      ? "no_target"
      : "status_changed";
  }
  if (previous === "not_met" && current === "met") return "recovered";
  if (previous === "met" && current === "not_met") return "new_breach";
  if (previous === "not_met" && current === "not_met") {
    return "persistent_breach";
  }
  if (previous === "met" && current === "met") return "persistent_met";
  return "status_changed";
}

export function compareGovernanceAssuranceReviews(
  previous: ExecutiveGovernanceReview,
  current: ExecutiveGovernanceReview,
): GovernanceAssuranceReviewComparison {
  if (previous.status !== "finalized" || current.status !== "finalized") {
    throw new Error("المقارنة التاريخية تستخدم Finalized Reviews فقط.");
  }
  if (
    current.review_date < previous.review_date ||
    (current.review_date === previous.review_date &&
      (current.finalized_at ?? current.updated_at) <
        (previous.finalized_at ?? previous.updated_at))
  ) {
    throw new Error("رتب المراجعات من الأقدم إلى الأحدث قبل المقارنة.");
  }

  const previousByKey = new Map(
    previous.target_assessments_snapshot.map((row) => [row.key, row] as const),
  );
  const currentByKey = new Map(
    current.target_assessments_snapshot.map((row) => [row.key, row] as const),
  );

  const metrics: GovernanceAssuranceMetricComparison[] = [
    "decision_resolution",
    "deferred_rate",
    "action_completion",
    "overdue_open",
    "unowned_open",
    "on_time_completion",
    "median_completion_days",
    "repeated_deferrals",
  ].map((key) => {
    const previousMetric = previousByKey.get(
      key as GovernanceTargetAssessment["key"],
    );
    const currentMetric = currentByKey.get(
      key as GovernanceTargetAssessment["key"],
    );
    if (!previousMetric || !currentMetric) {
      throw new Error("Finalized Review تحتوي Snapshot Metrics ناقصة.");
    }

    const delta =
      previousMetric.actual == null || currentMetric.actual == null
        ? null
        : Math.round(
            (currentMetric.actual - previousMetric.actual) * 100,
          ) / 100;

    return {
      key: currentMetric.key,
      label: currentMetric.label,
      unit: currentMetric.unit,
      operator: currentMetric.operator,
      previous_actual: previousMetric.actual,
      current_actual: currentMetric.actual,
      actual_delta: delta,
      actual_direction: metricActualDirection(
        previousMetric.actual,
        currentMetric.actual,
        currentMetric.operator,
      ),
      previous_target: previousMetric.target,
      current_target: currentMetric.target,
      target_changed:
        previousMetric.target !== currentMetric.target ||
        previousMetric.operator !== currentMetric.operator ||
        previousMetric.unit !== currentMetric.unit,
      previous_status: previousMetric.status,
      current_status: currentMetric.status,
      compliance_transition: complianceTransition(
        previousMetric.status,
        currentMetric.status,
      ),
    };
  });

  const previousActive = previous.exceptions_snapshot.filter(
    isActiveAssuranceException,
  );
  const currentActive = current.exceptions_snapshot.filter(
    isActiveAssuranceException,
  );
  const previousActiveIds = new Set(previousActive.map((row) => row.id));
  const currentActiveIds = new Set(currentActive.map((row) => row.id));
  const currentExceptionById = new Map(
    current.exceptions_snapshot.map((row) => [row.id, row] as const),
  );

  const persistentActive = previousActive.filter((row) =>
    currentActiveIds.has(row.id),
  ).length;
  const newlyActive = currentActive.filter(
    (row) => !previousActiveIds.has(row.id),
  ).length;
  const resolvedSincePrevious = previousActive.filter(
    (row) => currentExceptionById.get(row.id)?.status === "resolved",
  ).length;
  const noLongerPresent = previousActive.filter(
    (row) => !currentExceptionById.has(row.id),
  ).length;
  const currentOverdue = currentActive.filter(
    (row) => !!row.due_date && row.due_date < current.review_date,
  ).length;

  return {
    previous_review: previous,
    current_review: current,
    target_version_changed:
      previous.target_version !== current.target_version,
    metrics,
    summary: {
      previous_met: metrics.filter((row) => row.previous_status === "met")
        .length,
      current_met: metrics.filter((row) => row.current_status === "met")
        .length,
      previous_not_met: metrics.filter(
        (row) => row.previous_status === "not_met",
      ).length,
      current_not_met: metrics.filter(
        (row) => row.current_status === "not_met",
      ).length,
      recovered_metrics: metrics.filter(
        (row) => row.compliance_transition === "recovered",
      ).length,
      new_breaches: metrics.filter(
        (row) => row.compliance_transition === "new_breach",
      ).length,
      persistent_breaches: metrics.filter(
        (row) => row.compliance_transition === "persistent_breach",
      ).length,
      target_changed_metrics: metrics.filter((row) => row.target_changed)
        .length,
      improved_actuals: metrics.filter(
        (row) => row.actual_direction === "improved",
      ).length,
      worsened_actuals: metrics.filter(
        (row) => row.actual_direction === "worsened",
      ).length,
    },
    exceptions: {
      previous_active: previousActive.length,
      current_active: currentActive.length,
      persistent_active: persistentActive,
      newly_active: newlyActive,
      resolved_since_previous: resolvedSincePrevious,
      no_longer_present: noLongerPresent,
      current_overdue: currentOverdue,
    },
  };
}

export function buildGovernanceAssuranceHistory(
  reviews: ExecutiveGovernanceReview[],
): GovernanceAssuranceHistoryPoint[] {
  return reviews
    .filter((review) => review.status === "finalized")
    .slice()
    .sort(
      (a, b) =>
        a.review_date.localeCompare(b.review_date) ||
        (a.finalized_at ?? a.updated_at).localeCompare(
          b.finalized_at ?? b.updated_at,
        ),
    )
    .map((review) => {
      const activeExceptions = review.exceptions_snapshot.filter(
        isActiveAssuranceException,
      );
      return {
        review_id: review.id,
        review_date: review.review_date,
        period_label: review.period_label,
        assurance_conclusion: review.assurance_conclusion,
        target_version: review.target_version,
        met_count: review.target_assessments_snapshot.filter(
          (row) => row.status === "met",
        ).length,
        not_met_count: review.target_assessments_snapshot.filter(
          (row) => row.status === "not_met",
        ).length,
        insufficient_count: review.target_assessments_snapshot.filter(
          (row) => row.status === "insufficient_data",
        ).length,
        no_target_count: review.target_assessments_snapshot.filter(
          (row) => row.status === "no_target",
        ).length,
        active_exceptions: activeExceptions.length,
        overdue_exceptions: activeExceptions.filter(
          (row) => !!row.due_date && row.due_date < review.review_date,
        ).length,
        evidence_count: review.evidence_snapshot.length,
      };
    });
}

export function governanceAssuranceComparisonCsv(
  comparison: GovernanceAssuranceReviewComparison,
) {
  const lines: string[] = [
    csvLine([
      "Governance Assurance Comparison",
      comparison.previous_review.period_label,
      comparison.current_review.period_label,
    ]),
    csvLine([
      "Review Dates",
      comparison.previous_review.review_date,
      comparison.current_review.review_date,
    ]),
    csvLine([
      "Target Versions",
      comparison.previous_review.target_version,
      comparison.current_review.target_version,
    ]),
    csvLine([
      "Target Version Changed",
      comparison.target_version_changed ? "yes" : "no",
    ]),
    "",
    csvLine([
      "Metric",
      "Previous Actual",
      "Current Actual",
      "Actual Delta",
      "Actual Direction",
      "Previous Target",
      "Current Target",
      "Target Changed",
      "Previous Status",
      "Current Status",
      "Compliance Transition",
    ]),
  ];

  for (const row of comparison.metrics) {
    lines.push(
      csvLine([
        row.label,
        row.previous_actual ?? "",
        row.current_actual ?? "",
        row.actual_delta ?? "",
        row.actual_direction,
        row.previous_target ?? "",
        row.current_target ?? "",
        row.target_changed ? "yes" : "no",
        row.previous_status,
        row.current_status,
        row.compliance_transition,
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvLine([
      "Exception Summary",
      "Previous Active",
      "Current Active",
      "Persistent Active",
      "Newly Active",
      "Resolved Since Previous",
      "No Longer Present",
      "Current Overdue",
    ]),
  );
  lines.push(
    csvLine([
      "Exceptions",
      comparison.exceptions.previous_active,
      comparison.exceptions.current_active,
      comparison.exceptions.persistent_active,
      comparison.exceptions.newly_active,
      comparison.exceptions.resolved_since_previous,
      comparison.exceptions.no_longer_present,
      comparison.exceptions.current_overdue,
    ]),
  );

  return "\uFEFF" + lines.join("\r\n");
}

export function downloadGovernanceAssuranceComparisonCsv(
  comparison: GovernanceAssuranceReviewComparison,
) {
  const blob = new Blob([governanceAssuranceComparisonCsv(comparison)], {
    type: "text/csv;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download =
    "governance-assurance-comparison-" +
    comparison.previous_review.review_date +
    "-to-" +
    comparison.current_review.review_date +
    ".csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}


interface LocalSignoffStore {
  version: 1;
  signoffs: GovernanceAssuranceSignoff[];
}

function signoffStatus(value: unknown): GovernanceAssuranceSignoffStatus | null {
  return value === "open" || value === "completed" || value === "declined"
    ? value
    : null;
}

function attestationRole(
  value: unknown,
): GovernanceAssuranceAttestationRole | null {
  return value === "prepared_by" ||
    value === "reviewed_by" ||
    value === "approved_by"
    ? value
    : null;
}

function attestationStatus(
  value: unknown,
): GovernanceAssuranceAttestationStatus | null {
  return value === "pending" ||
    value === "attested" ||
    value === "attested_with_reservation" ||
    value === "declined"
    ? value
    : null;
}

function normalizeAttestation(
  value: unknown,
): GovernanceAssuranceAttestation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const role = attestationRole(row.role);
  const status = attestationStatus(row.status);
  const sequence = intOrNull(row.sequence_no);
  const version = intOrNull(row.version);
  if (
    typeof row.id !== "string" ||
    typeof row.signoff_id !== "string" ||
    typeof row.review_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.assignee_user_id !== "string" ||
    typeof row.assignee_name_snapshot !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !role ||
    !status ||
    sequence == null ||
    version == null
  ) {
    return null;
  }

  return {
    id: row.id,
    signoff_id: row.signoff_id,
    review_id: row.review_id,
    owner_user_id: row.owner_user_id,
    role,
    sequence_no: sequence,
    assignee_user_id: row.assignee_user_id,
    assignee_name_snapshot: row.assignee_name_snapshot,
    assignee_email_snapshot:
      typeof row.assignee_email_snapshot === "string"
        ? row.assignee_email_snapshot
        : null,
    status,
    statement: typeof row.statement === "string" ? row.statement : null,
    reservation:
      typeof row.reservation === "string" ? row.reservation : null,
    acted_at: typeof row.acted_at === "string" ? row.acted_at : null,
    version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeSignoff(value: unknown): GovernanceAssuranceSignoff | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = signoffStatus(row.status);
  const version = intOrNull(row.version);
  if (
    typeof row.id !== "string" ||
    typeof row.review_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !status ||
    version == null
  ) {
    return null;
  }

  return {
    id: row.id,
    review_id: row.review_id,
    owner_user_id: row.owner_user_id,
    status,
    version,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
    declined_at:
      typeof row.declined_at === "string" ? row.declined_at : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    attestations: Array.isArray(row.attestations)
      ? row.attestations
          .map(normalizeAttestation)
          .filter(
            (item): item is GovernanceAssuranceAttestation => !!item,
          )
          .sort((a, b) => a.sequence_no - b.sequence_no)
      : [],
  };
}

function readLocalSignoffs(): LocalSignoffStore {
  if (typeof window === "undefined") {
    return { version: 1, signoffs: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SIGNOFF_LOCAL_KEY) ?? "{}",
    ) as Partial<LocalSignoffStore>;
    return {
      version: 1,
      signoffs: Array.isArray(parsed.signoffs)
        ? parsed.signoffs
            .map(normalizeSignoff)
            .filter((item): item is GovernanceAssuranceSignoff => !!item)
        : [],
    };
  } catch {
    return { version: 1, signoffs: [] };
  }
}

function writeLocalSignoffs(store: LocalSignoffStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIGNOFF_LOCAL_KEY, JSON.stringify(store));
}

function validateSignoffAssignments(
  input: SaveGovernanceAssuranceSignoffPlanInput,
) {
  if (input.assignments.length !== 3) {
    throw new Error("Sign-off يحتاج Prepared / Reviewed / Approved.");
  }
  const roles = new Set(input.assignments.map((row) => row.role));
  const users = new Set(input.assignments.map((row) => row.assignee_user_id));
  if (
    roles.size !== 3 ||
    !roles.has("prepared_by") ||
    !roles.has("reviewed_by") ||
    !roles.has("approved_by")
  ) {
    throw new Error("يجب تعيين الأدوار الثلاثة مرة واحدة لكل دور.");
  }
  if (users.size !== 3) {
    throw new Error("Prepared / Reviewed / Approved يجب أن يكونوا 3 مستخدمين مختلفين.");
  }
  for (const row of input.assignments) {
    if (!row.assignee_user_id || !row.assignee_name.trim()) {
      throw new Error("هوية كل Signer مطلوبة.");
    }
  }
}

export function buildGovernanceAssuranceSignatoryCandidates(
  review: ExecutiveGovernanceReview,
  meetingData: Awaited<ReturnType<typeof listExecutiveStrategyMeetings>>,
): GovernanceAssuranceSignatoryCandidate[] {
  const sourceIds = new Set(review.source_window_meeting_ids);
  const candidates = new Map<string, GovernanceAssuranceSignatoryCandidate>();

  const add = (candidate: GovernanceAssuranceSignatoryCandidate) => {
    const prior = candidates.get(candidate.user_id);
    if (!prior) {
      candidates.set(candidate.user_id, candidate);
      return;
    }
    if (
      prior.source !== "attendee" &&
      candidate.source === "attendee"
    ) {
      candidates.set(candidate.user_id, candidate);
      return;
    }
    if (!prior.email && candidate.email) {
      candidates.set(candidate.user_id, {
        ...prior,
        email: candidate.email,
      });
    }
  };

  for (const meeting of meetingData.meetings) {
    if (!sourceIds.has(meeting.id)) continue;

    for (const attendee of meeting.attendees) {
      if (!attendee.user_id) continue;
      add({
        user_id: attendee.user_id,
        display_name: attendee.display_name.trim() || "مستخدم",
        email: attendee.email_snapshot,
        source: "attendee",
      });
    }

    if (meeting.chair_user_id) {
      add({
        user_id: meeting.chair_user_id,
        display_name: meeting.chair_name?.trim() || "رئيس الاجتماع",
        email: null,
        source: "chair",
      });
    }

    if (meeting.created_by) {
      add({
        user_id: meeting.created_by,
        display_name: "منشئ الاجتماع",
        email: null,
        source: "creator",
      });
    }
  }

  return [...candidates.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ar"),
  );
}

export async function listGovernanceAssuranceSignoffs(): Promise<GovernanceAssuranceSignoffData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_executive_governance_review_signoffs",
      { method: "POST", body: {} },
    );

    const owned: GovernanceAssuranceOwnedSignoff[] = Array.isArray(raw.owned)
      ? raw.owned.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return [];
          }
          const row = item as Record<string, unknown>;
          const signoff = normalizeSignoff(row.signoff);
          const review = normalizeReview(row.review);
          return signoff && review ? [{ signoff, review }] : [];
        })
      : [];

    const inbox: GovernanceAssuranceAttestationInboxItem[] = Array.isArray(
      raw.inbox,
    )
      ? raw.inbox.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return [];
          }
          const row = item as Record<string, unknown>;
          const attestation = normalizeAttestation(row.attestation);
          const signoff = normalizeSignoff(row.signoff);
          const review = normalizeReview(row.review);
          return attestation && signoff && review
            ? [
                {
                  attestation,
                  signoff,
                  review,
                  can_act: row.can_act === true,
                },
              ]
            : [];
        })
      : [];

    return { owned, inbox };
  }

  const reviews = new Map(
    readLocal().reviews.map((review) => [review.id, review] as const),
  );
  const signoffs = readLocalSignoffs().signoffs;
  return {
    owned: signoffs.flatMap((signoff) => {
      const review = reviews.get(signoff.review_id);
      return review ? [{ signoff, review }] : [];
    }),
    inbox: signoffs.flatMap((signoff) => {
      const review = reviews.get(signoff.review_id);
      if (!review) return [];
      return signoff.attestations
        .filter((attestation) => attestation.assignee_user_id === "local-user")
        .map((attestation) => {
          const priorIncomplete = signoff.attestations.some(
            (row) =>
              row.sequence_no < attestation.sequence_no &&
              row.status !== "attested" &&
              row.status !== "attested_with_reservation",
          );
          return {
            attestation,
            signoff,
            review,
            can_act:
              signoff.status === "open" &&
              attestation.status === "pending" &&
              !priorIncomplete,
          };
        });
    }),
  };
}

export async function saveGovernanceAssuranceSignoffPlan(
  input: SaveGovernanceAssuranceSignoffPlanInput,
): Promise<GovernanceAssuranceSignoff> {
  validateSignoffAssignments(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_executive_governance_review_signoff_plan",
      {
        method: "POST",
        body: {
          p_review_id: input.review_id,
          p_expected_signoff_version:
            input.expected_signoff_version ?? null,
          p_assignments: input.assignments,
        },
      },
    );
    const signoff = normalizeSignoff(raw);
    if (!signoff) {
      throw new Error("عاد الخادم بخطة Sign-off غير صالحة.");
    }
    return signoff;
  }

  const review = readLocal().reviews.find(
    (row) => row.id === input.review_id,
  );
  if (!review || review.status !== "finalized") {
    throw new Error("Sign-off يتطلب Finalized Review.");
  }

  const store = readLocalSignoffs();
  const existing = store.signoffs.find(
    (row) => row.review_id === input.review_id,
  );
  if (
    existing &&
    (input.expected_signoff_version == null ||
      input.expected_signoff_version !== existing.version)
  ) {
    throw new Error("تم تعديل Sign-off. حدّث البيانات وأعد المحاولة.");
  }
  if (!existing && input.expected_signoff_version != null) {
    throw new Error("تم تعديل Sign-off. حدّث البيانات وأعد المحاولة.");
  }
  if (
    existing &&
    (existing.status !== "open" ||
      existing.attestations.some((row) => row.status !== "pending"))
  ) {
    throw new Error("تم قفل تعيينات Sign-off بعد بدء الاعتماد.");
  }

  const now = new Date().toISOString();
  const signoffId = existing?.id ?? crypto.randomUUID();
  const sequence: Record<GovernanceAssuranceAttestationRole, number> = {
    prepared_by: 1,
    reviewed_by: 2,
    approved_by: 3,
  };
  const signoff: GovernanceAssuranceSignoff = {
    id: signoffId,
    review_id: review.id,
    owner_user_id: review.owner_user_id,
    status: "open",
    version: existing ? existing.version + 1 : 1,
    completed_at: null,
    declined_at: null,
    created_by: review.owner_user_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    attestations: input.assignments
      .map((row) => ({
        id: crypto.randomUUID(),
        signoff_id: signoffId,
        review_id: review.id,
        owner_user_id: review.owner_user_id,
        role: row.role,
        sequence_no: sequence[row.role],
        assignee_user_id: row.assignee_user_id,
        assignee_name_snapshot: row.assignee_name.trim(),
        assignee_email_snapshot: row.assignee_email?.trim() || null,
        status: "pending" as const,
        statement: null,
        reservation: null,
        acted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
      }))
      .sort((a, b) => a.sequence_no - b.sequence_no),
  };

  store.signoffs = [
    signoff,
    ...store.signoffs.filter((row) => row.review_id !== review.id),
  ];
  writeLocalSignoffs(store);
  return signoff;
}

export async function actOnGovernanceAssuranceAttestation(
  input: ActOnGovernanceAssuranceAttestationInput,
): Promise<GovernanceAssuranceSignoff> {
  if (!input.statement.trim() || input.statement.trim().length > 8000) {
    throw new Error("Attestation Statement مطلوبة وبحد أقصى 8000 حرف.");
  }
  if (
    input.decision === "attested_with_reservation" &&
    !input.reservation?.trim()
  ) {
    throw new Error("Reservation مطلوبة لهذا القرار.");
  }
  if ((input.reservation?.length ?? 0) > 8000) {
    throw new Error("Reservation طويلة جدًا.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/act_on_executive_governance_attestation",
      {
        method: "POST",
        body: {
          p_attestation_id: input.attestation_id,
          p_expected_version: input.expected_version,
          p_decision: input.decision,
          p_statement: input.statement,
          p_reservation: input.reservation ?? null,
        },
      },
    );
    const signoff = normalizeSignoff(raw);
    if (!signoff) {
      throw new Error("عاد الخادم بنتيجة Sign-off غير صالحة.");
    }
    return signoff;
  }

  const store = readLocalSignoffs();
  const signoff = store.signoffs.find((row) =>
    row.attestations.some((item) => item.id === input.attestation_id),
  );
  if (!signoff) throw new Error("Attestation غير موجودة.");
  if (signoff.status !== "open") throw new Error("Sign-off ليس مفتوحًا.");

  const attestation = signoff.attestations.find(
    (row) => row.id === input.attestation_id,
  )!;
  if (attestation.assignee_user_id !== "local-user") {
    throw new Error("Local mode لا يمكنه التوقيع نيابةً عن مستخدم آخر.");
  }
  if (
    attestation.status !== "pending" ||
    attestation.version !== input.expected_version
  ) {
    throw new Error("Attestation تغيرت. حدّث البيانات وأعد المحاولة.");
  }
  const priorIncomplete = signoff.attestations.some(
    (row) =>
      row.sequence_no < attestation.sequence_no &&
      row.status !== "attested" &&
      row.status !== "attested_with_reservation",
  );
  if (priorIncomplete) {
    throw new Error("يجب إكمال خطوة Sign-off السابقة أولًا.");
  }

  const now = new Date().toISOString();
  const updatedAttestations = signoff.attestations.map((row) =>
    row.id === attestation.id
      ? {
          ...row,
          status: input.decision,
          statement: input.statement.trim(),
          reservation: input.reservation?.trim() || null,
          acted_at: now,
          version: row.version + 1,
          updated_at: now,
        }
      : row,
  );
  const updated: GovernanceAssuranceSignoff = {
    ...signoff,
    attestations: updatedAttestations,
    status:
      input.decision === "declined"
        ? "declined"
        : attestation.sequence_no === 3
          ? "completed"
          : "open",
    completed_at:
      input.decision !== "declined" && attestation.sequence_no === 3
        ? now
        : signoff.completed_at,
    declined_at:
      input.decision === "declined" ? now : signoff.declined_at,
    version: signoff.version + 1,
    updated_at: now,
  };

  store.signoffs = store.signoffs.map((row) =>
    row.id === updated.id ? updated : row,
  );
  writeLocalSignoffs(store);
  return updated;
}
