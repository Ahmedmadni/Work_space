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
  GovernanceReviewStatus,
  SaveGovernanceAssuranceCadenceInput,
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
