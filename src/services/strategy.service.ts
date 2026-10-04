import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  KeyResultDirection,
  ObjectiveKeyResult,
  ObjectiveMilestoneLink,
  ObjectiveStatus,
  PortfolioObjective,
  PortfolioStrategyData,
  SavePortfolioObjectiveInput,
  SavedObjectiveRef,
  BenefitStatus,
  BenefitType,
  ObjectiveBenefit,
  ObjectiveStrategyReview,
  RecordStrategyReviewInput,
  SaveObjectiveBenefitInput,
  StrategyReviewAssessment,
  StrategyReviewData,
} from "@/types/strategy";

const LOCAL_KEY = "projectflow.strategy.v1";

interface LocalStrategyStore {
  version: 1;
  objectives: PortfolioObjective[];
}

function readLocal(): LocalStrategyStore {
  if (typeof window === "undefined") return { version: 1, objectives: [] };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalStrategyStore>;
    return Array.isArray(parsed.objectives)
      ? { version: 1, objectives: parsed.objectives }
      : { version: 1, objectives: [] };
  } catch {
    return { version: 1, objectives: [] };
  }
}

function writeLocal(store: LocalStrategyStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;
}

function objectiveStatus(value: unknown): ObjectiveStatus {
  return value === "draft" ||
    value === "active" ||
    value === "achieved" ||
    value === "paused" ||
    value === "cancelled"
    ? value
    : "active";
}

function direction(value: unknown): KeyResultDirection {
  return value === "decrease" ? "decrease" : "increase";
}

function normalizeKeyResult(value: unknown): ObjectiveKeyResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  return {
    id: row.id,
    title: row.title,
    unit: stringOrNull(row.unit),
    direction: direction(row.direction),
    baseline_value: numberValue(row.baseline_value),
    target_value: numberValue(row.target_value),
    current_value: numberValue(row.current_value),
    weight: Math.max(0.0001, numberValue(row.weight, 1)),
  };
}

function normalizeMilestone(value: unknown): ObjectiveMilestoneLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.project_id !== "string" ||
    typeof row.board_id !== "string" ||
    typeof row.node_id !== "string"
  ) {
    return null;
  }
  return {
    project_id: row.project_id,
    board_id: row.board_id,
    node_id: row.node_id,
    board_name: stringOrNull(row.board_name),
    node_title: stringOrNull(row.node_title),
    status: stringOrNull(row.status),
    progress:
      row.progress === null || row.progress === undefined
        ? null
        : numberValue(row.progress),
    due_date: stringOrNull(row.due_date),
  };
}

function normalizeObjective(value: unknown): PortfolioObjective | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.created_by !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    description: stringOrNull(row.description),
    status: objectiveStatus(row.status),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    start_date: stringOrNull(row.start_date),
    due_date: stringOrNull(row.due_date),
    version: numberValue(row.version, 1),
    created_by: row.created_by,
    can_edit: row.can_edit === true,
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    key_results: Array.isArray(row.key_results)
      ? row.key_results
          .map(normalizeKeyResult)
          .filter((item): item is ObjectiveKeyResult => !!item)
      : [],
    project_ids: Array.isArray(row.project_ids)
      ? row.project_ids.filter((id): id is string => typeof id === "string")
      : [],
    milestones: Array.isArray(row.milestones)
      ? row.milestones
          .map(normalizeMilestone)
          .filter((item): item is ObjectiveMilestoneLink => !!item)
      : [],
  };
}

function normalizeStrategy(value: unknown): PortfolioStrategyData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { objectives: [] };
  }
  const row = value as Record<string, unknown>;
  return {
    objectives: Array.isArray(row.objectives)
      ? row.objectives
          .map(normalizeObjective)
          .filter((item): item is PortfolioObjective => !!item)
      : [],
  };
}

export async function listPortfolioStrategy(): Promise<PortfolioStrategyData> {
  if (isSupabaseBackend()) {
    return normalizeStrategy(
      await supabaseRest<unknown>("rpc/list_portfolio_strategy", {
        method: "POST",
        body: {},
      }),
    );
  }
  return { objectives: [...readLocal().objectives] };
}

function validateInput(input: SavePortfolioObjectiveInput) {
  if (!input.title.trim()) throw new Error("عنوان الهدف مطلوب.");
  if (input.start_date && input.due_date && input.start_date > input.due_date) {
    throw new Error("تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.");
  }
  if (input.key_results.length > 30) {
    throw new Error("الحد الأقصى 30 Key Result لكل هدف.");
  }
  for (const kr of input.key_results) {
    if (!kr.title.trim()) throw new Error("عنوان Key Result مطلوب.");
    if (!Number.isFinite(kr.weight) || kr.weight <= 0) {
      throw new Error("وزن Key Result يجب أن يكون أكبر من صفر.");
    }
    if (kr.direction === "increase" && kr.target_value < kr.baseline_value) {
      throw new Error("هدف الزيادة يجب ألا يقل عن baseline.");
    }
    if (kr.direction === "decrease" && kr.target_value > kr.baseline_value) {
      throw new Error("هدف الخفض يجب ألا يزيد عن baseline.");
    }
  }
}

export async function savePortfolioObjective(
  input: SavePortfolioObjectiveInput,
): Promise<SavedObjectiveRef> {
  validateInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/save_portfolio_objective",
      {
        method: "POST",
        body: {
          p_objective_id: input.id ?? null,
          p_expected_version: input.expected_version ?? null,
          p_title: input.title,
          p_description: input.description ?? null,
          p_status: input.status,
          p_owner_user_id: input.owner_user_id ?? null,
          p_start_date: input.start_date ?? null,
          p_due_date: input.due_date ?? null,
          p_key_results: input.key_results,
          p_project_ids: input.project_ids,
          p_milestones: input.milestones,
        },
      },
    );

    if (typeof raw.id !== "string") {
      throw new Error("لم يتم حفظ الهدف الاستراتيجي.");
    }
    return {
      id: raw.id,
      version: numberValue(raw.version, 1),
    };
  }

  const store = readLocal();
  const existing = input.id
    ? store.objectives.find((objective) => objective.id === input.id)
    : null;

  if (input.id && !existing) throw new Error("الهدف الاستراتيجي غير موجود.");
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل الهدف. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const objective: PortfolioObjective = {
    id: existing?.id ?? crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    status: input.status,
    owner_user_id: input.owner_user_id ?? null,
    owner_name: existing?.owner_name ?? null,
    start_date: input.start_date ?? null,
    due_date: input.due_date ?? null,
    version: existing ? existing.version + 1 : 1,
    created_by: existing?.created_by ?? "local-user",
    can_edit: true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    key_results: input.key_results.map((kr) => ({
      id: kr.id ?? crypto.randomUUID(),
      title: kr.title.trim(),
      unit: kr.unit?.trim() || null,
      direction: kr.direction,
      baseline_value: kr.baseline_value,
      target_value: kr.target_value,
      current_value: kr.current_value,
      weight: kr.weight,
    })),
    project_ids: [...new Set(input.project_ids)],
    milestones: input.milestones.map((link) => ({
      ...link,
      board_name:
        existing?.milestones.find((item) => item.node_id === link.node_id)
          ?.board_name ?? null,
      node_title:
        existing?.milestones.find((item) => item.node_id === link.node_id)
          ?.node_title ?? null,
      status:
        existing?.milestones.find((item) => item.node_id === link.node_id)
          ?.status ?? null,
      progress:
        existing?.milestones.find((item) => item.node_id === link.node_id)
          ?.progress ?? null,
      due_date:
        existing?.milestones.find((item) => item.node_id === link.node_id)
          ?.due_date ?? null,
    })),
  };

  store.objectives = existing
    ? store.objectives.map((row) => (row.id === objective.id ? objective : row))
    : [objective, ...store.objectives];
  writeLocal(store);
  return { id: objective.id, version: objective.version };
}


const LOCAL_REVIEW_KEY = "projectflow.strategy-reviews.v1";

interface LocalReviewStore {
  version: 1;
  benefits: ObjectiveBenefit[];
  reviews: ObjectiveStrategyReview[];
}

function readLocalReviews(): LocalReviewStore {
  if (typeof window === "undefined") {
    return { version: 1, benefits: [], reviews: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_REVIEW_KEY) ?? "{}",
    ) as Partial<LocalReviewStore>;
    return {
      version: 1,
      benefits: Array.isArray(parsed.benefits) ? parsed.benefits : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
  } catch {
    return { version: 1, benefits: [], reviews: [] };
  }
}

function writeLocalReviews(store: LocalReviewStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_REVIEW_KEY, JSON.stringify(store));
}

function benefitType(value: unknown): BenefitType {
  return value === "financial" ||
    value === "customer" ||
    value === "operational" ||
    value === "risk" ||
    value === "capability" ||
    value === "other"
    ? value
    : "other";
}

function benefitStatus(value: unknown): BenefitStatus {
  return value === "planned" ||
    value === "realizing" ||
    value === "realized" ||
    value === "not_realized"
    ? value
    : "planned";
}

function reviewAssessment(value: unknown): StrategyReviewAssessment {
  return value === "on_track" ||
    value === "at_risk" ||
    value === "off_track" ||
    value === "achieved"
    ? value
    : "on_track";
}

function normalizeBenefit(value: unknown): ObjectiveBenefit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.objective_id !== "string" ||
    typeof row.title !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    objective_id: row.objective_id,
    title: row.title,
    description: stringOrNull(row.description),
    benefit_type: benefitType(row.benefit_type),
    status: benefitStatus(row.status),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    target_date: stringOrNull(row.target_date),
    expected_outcome: stringOrNull(row.expected_outcome),
    realized_outcome: stringOrNull(row.realized_outcome),
    evidence: stringOrNull(row.evidence),
    realized_at: stringOrNull(row.realized_at),
    version: numberValue(row.version, 1),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizeReview(value: unknown): ObjectiveStrategyReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.objective_id !== "string" ||
    typeof row.review_date !== "string" ||
    typeof row.period_label !== "string" ||
    typeof row.created_by !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    objective_id: row.objective_id,
    review_date: row.review_date,
    period_label: row.period_label,
    assessment: reviewAssessment(row.assessment),
    summary: stringOrNull(row.summary),
    decisions_needed: stringOrNull(row.decisions_needed),
    objective_progress_snapshot:
      row.objective_progress_snapshot == null
        ? null
        : numberValue(row.objective_progress_snapshot),
    delivery_progress_snapshot:
      row.delivery_progress_snapshot == null
        ? null
        : numberValue(row.delivery_progress_snapshot),
    active_risks_snapshot: numberValue(row.active_risks_snapshot),
    critical_risks_snapshot: numberValue(row.critical_risks_snapshot),
    pending_decisions_snapshot: numberValue(row.pending_decisions_snapshot),
    key_results_snapshot: Array.isArray(row.key_results_snapshot)
      ? row.key_results_snapshot
          .map(normalizeKeyResult)
          .filter((item): item is ObjectiveKeyResult => !!item)
      : [],
    created_by: row.created_by,
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
  };
}

export async function listStrategyReviewData(): Promise<StrategyReviewData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_strategy_review_data",
      {
        method: "POST",
        body: {},
      },
    );
    return {
      benefits: Array.isArray(raw.benefits)
        ? raw.benefits
            .map(normalizeBenefit)
            .filter((item): item is ObjectiveBenefit => !!item)
        : [],
      reviews: Array.isArray(raw.reviews)
        ? raw.reviews
            .map(normalizeReview)
            .filter((item): item is ObjectiveStrategyReview => !!item)
        : [],
    };
  }

  const local = readLocalReviews();
  return {
    benefits: [...local.benefits],
    reviews: [...local.reviews],
  };
}

export async function saveObjectiveBenefit(
  input: SaveObjectiveBenefitInput,
): Promise<ObjectiveBenefit> {
  if (!input.title.trim()) throw new Error("عنوان المنفعة مطلوب.");

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>("rpc/save_objective_benefit", {
      method: "POST",
      body: {
        p_objective_id: input.objective_id,
        p_benefit_id: input.id ?? null,
        p_expected_version: input.expected_version ?? null,
        p_title: input.title,
        p_description: input.description ?? null,
        p_benefit_type: input.benefit_type,
        p_status: input.status,
        p_owner_user_id: input.owner_user_id ?? null,
        p_target_date: input.target_date ?? null,
        p_expected_outcome: input.expected_outcome ?? null,
        p_realized_outcome: input.realized_outcome ?? null,
        p_evidence: input.evidence ?? null,
      },
    });
    const benefit = normalizeBenefit(raw);
    if (!benefit) throw new Error("عاد الخادم بسجل منفعة غير صالح.");
    return benefit;
  }

  const store = readLocalReviews();
  const existing = input.id
    ? store.benefits.find((row) => row.id === input.id)
    : null;

  if (input.id && !existing) throw new Error("سجل المنفعة غير موجود.");
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل المنفعة. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const benefit: ObjectiveBenefit = {
    id: existing?.id ?? crypto.randomUUID(),
    objective_id: input.objective_id,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    benefit_type: input.benefit_type,
    status: input.status,
    owner_user_id: input.owner_user_id ?? null,
    owner_name: existing?.owner_name ?? null,
    target_date: input.target_date ?? null,
    expected_outcome: input.expected_outcome?.trim() || null,
    realized_outcome: input.realized_outcome?.trim() || null,
    evidence: input.evidence?.trim() || null,
    realized_at:
      input.status === "realized"
        ? existing?.status === "realized"
          ? existing.realized_at ?? now
          : now
        : input.status === "planned" || input.status === "realizing"
          ? null
          : existing?.realized_at ?? null,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  store.benefits = existing
    ? store.benefits.map((row) => (row.id === benefit.id ? benefit : row))
    : [benefit, ...store.benefits];
  writeLocalReviews(store);
  return benefit;
}

function localObjectiveProgress(objective: PortfolioObjective) {
  if (!objective.key_results.length) return null;
  const totalWeight = objective.key_results.reduce(
    (sum, row) => sum + row.weight,
    0,
  );
  if (totalWeight <= 0) return null;
  return (
    objective.key_results.reduce((sum, row) => {
      const denominator =
        row.direction === "increase"
          ? row.target_value - row.baseline_value
          : row.baseline_value - row.target_value;
      const numerator =
        row.direction === "increase"
          ? row.current_value - row.baseline_value
          : row.baseline_value - row.current_value;
      const progress =
        denominator === 0
          ? row.direction === "increase"
            ? row.current_value >= row.target_value
              ? 100
              : 0
            : row.current_value <= row.target_value
              ? 100
              : 0
          : (numerator / denominator) * 100;
      return sum + Math.max(0, Math.min(100, progress)) * row.weight;
    }, 0) / totalWeight
  );
}

export async function recordObjectiveStrategyReview(
  input: RecordStrategyReviewInput,
): Promise<ObjectiveStrategyReview> {
  if (!input.period_label.trim()) throw new Error("اسم فترة المراجعة مطلوب.");

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/record_objective_strategy_review",
      {
        method: "POST",
        body: {
          p_objective_id: input.objective_id,
          p_period_label: input.period_label,
          p_assessment: input.assessment,
          p_summary: input.summary ?? null,
          p_decisions_needed: input.decisions_needed ?? null,
        },
      },
    );
    const review = normalizeReview(raw);
    if (!review) throw new Error("عاد الخادم بمراجعة استراتيجية غير صالحة.");
    return review;
  }

  const strategy = await listPortfolioStrategy();
  const objective = strategy.objectives.find(
    (row) => row.id === input.objective_id,
  );
  if (!objective) throw new Error("الهدف الاستراتيجي غير موجود.");

  const now = new Date();
  const review: ObjectiveStrategyReview = {
    id: crypto.randomUUID(),
    objective_id: input.objective_id,
    review_date: [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-"),
    period_label: input.period_label.trim(),
    assessment: input.assessment,
    summary: input.summary?.trim() || null,
    decisions_needed: input.decisions_needed?.trim() || null,
    objective_progress_snapshot: localObjectiveProgress(objective),
    delivery_progress_snapshot: input.local_delivery_progress ?? null,
    active_risks_snapshot: input.local_active_risks ?? 0,
    critical_risks_snapshot: input.local_critical_risks ?? 0,
    pending_decisions_snapshot: input.local_pending_decisions ?? 0,
    key_results_snapshot: objective.key_results.map((row) => ({ ...row })),
    created_by: "local-user",
    created_at: now.toISOString(),
  };

  const store = readLocalReviews();
  store.reviews = [review, ...store.reviews];
  writeLocalReviews(store);
  return review;
}
