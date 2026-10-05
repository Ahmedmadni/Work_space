import { isSupabaseBackend } from "@/lib/backend-config";
import { buildObjectiveForecast } from "@/services/strategy-forecast.service";
import {
  listPortfolioStrategy,
  listStrategyReviewData,
} from "@/services/strategy.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ObjectiveRecoveryPlan,
  RecoveryCommitment,
  RecoveryCommitmentStatus,
  RecoveryPlanData,
  RecoveryPlanStatus,
  RecoveryTriggerReason,
  SaveObjectiveRecoveryPlanInput,
  SavedRecoveryPlanRef,
  PortfolioObjective,
  ObjectiveStrategyReview,
  RecoveryPlanEffectiveness,
} from "@/types/strategy";

const LOCAL_KEY = "projectflow.strategy-recovery.v1";

interface LocalRecoveryStore {
  version: 1;
  plans: ObjectiveRecoveryPlan[];
}

function readLocal(): LocalRecoveryStore {
  if (typeof window === "undefined") return { version: 1, plans: [] };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalRecoveryStore>;
    return Array.isArray(parsed.plans)
      ? { version: 1, plans: parsed.plans }
      : { version: 1, plans: [] };
  } catch {
    return { version: 1, plans: [] };
  }
}

function writeLocal(store: LocalRecoveryStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
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

function numberValue(value: unknown, fallback = 0) {
  return numberOrNull(value) ?? fallback;
}

function planStatus(value: unknown): RecoveryPlanStatus {
  return value === "draft" ||
    value === "active" ||
    value === "recovered" ||
    value === "closed" ||
    value === "cancelled"
    ? value
    : "active";
}

function triggerReason(value: unknown): RecoveryTriggerReason {
  return value === "projected_late" ||
    value === "stalled" ||
    value === "overdue" ||
    value === "manual"
    ? value
    : "manual";
}

function commitmentStatus(value: unknown): RecoveryCommitmentStatus {
  return value === "open" ||
    value === "in_progress" ||
    value === "done" ||
    value === "cancelled"
    ? value
    : "open";
}

function normalizeCommitment(value: unknown): RecoveryCommitment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  return {
    id: row.id,
    title: row.title,
    description: stringOrNull(row.description),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    due_date: stringOrNull(row.due_date),
    status: commitmentStatus(row.status),
    completed_at: stringOrNull(row.completed_at),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizePlan(value: unknown): ObjectiveRecoveryPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.objective_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.created_by !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    objective_id: row.objective_id,
    title: row.title,
    summary: stringOrNull(row.summary),
    success_criteria: stringOrNull(row.success_criteria),
    trigger_reason: triggerReason(row.trigger_reason),
    status: planStatus(row.status),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    target_recovery_date: stringOrNull(row.target_recovery_date),
    baseline_objective_progress: numberOrNull(row.baseline_objective_progress),
    baseline_daily_progress_rate: numberOrNull(row.baseline_daily_progress_rate),
    baseline_review_count: numberValue(row.baseline_review_count),
    activated_at: stringOrNull(row.activated_at),
    recovered_at: stringOrNull(row.recovered_at),
    closed_at: stringOrNull(row.closed_at),
    version: numberValue(row.version, 1),
    created_by: row.created_by,
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    commitments: Array.isArray(row.commitments)
      ? row.commitments
          .map(normalizeCommitment)
          .filter((item): item is RecoveryCommitment => !!item)
      : [],
  };
}

export async function listObjectiveRecoveryPlans(): Promise<RecoveryPlanData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_objective_recovery_plans",
      {
        method: "POST",
        body: {},
      },
    );
    return {
      plans: Array.isArray(raw.plans)
        ? raw.plans
            .map(normalizePlan)
            .filter((item): item is ObjectiveRecoveryPlan => !!item)
        : [],
    };
  }

  return { plans: [...readLocal().plans] };
}

export async function saveObjectiveRecoveryPlan(
  input: SaveObjectiveRecoveryPlanInput,
): Promise<SavedRecoveryPlanRef> {
  if (!input.title.trim()) throw new Error("عنوان خطة التعافي مطلوب.");
  if (input.commitments.length > 100) {
    throw new Error("الحد الأقصى 100 Commitment لكل خطة.");
  }
  for (const commitment of input.commitments) {
    if (!commitment.title.trim()) {
      throw new Error("عنوان كل Commitment مطلوب.");
    }
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/save_objective_recovery_plan",
      {
        method: "POST",
        body: {
          p_objective_id: input.objective_id,
          p_plan_id: input.id ?? null,
          p_expected_version: input.expected_version ?? null,
          p_title: input.title,
          p_summary: input.summary ?? null,
          p_success_criteria: input.success_criteria ?? null,
          p_trigger_reason: input.trigger_reason,
          p_status: input.status,
          p_owner_user_id: input.owner_user_id ?? null,
          p_target_recovery_date: input.target_recovery_date ?? null,
          p_commitments: input.commitments.map((row) => ({
            id: row.id ?? null,
            title: row.title,
            description: row.description ?? null,
            owner_user_id: row.owner_user_id ?? null,
            due_date: row.due_date ?? null,
            status: row.status,
          })),
        },
      },
    );
    if (typeof raw.id !== "string") {
      throw new Error("لم يتم حفظ خطة التعافي.");
    }
    return {
      id: raw.id,
      version: numberValue(raw.version, 1),
    };
  }

  const store = readLocal();
  const existing = input.id
    ? store.plans.find((plan) => plan.id === input.id)
    : null;

  if (input.id && !existing) throw new Error("خطة التعافي غير موجودة.");
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل خطة التعافي. حدّث البيانات وأعد المحاولة.");
  }

  const [strategy, reviewData] = await Promise.all([
    listPortfolioStrategy(),
    listStrategyReviewData(),
  ]);
  const objective = strategy.objectives.find(
    (row) => row.id === input.objective_id,
  );
  if (!objective) throw new Error("الهدف الاستراتيجي غير موجود.");

  const now = new Date().toISOString();
  const forecast = buildObjectiveForecast(objective, reviewData.reviews);
  const existingCommitments = new Map(
    (existing?.commitments ?? []).map((row) => [row.id, row] as const),
  );
  const incomingIds = new Set(
    input.commitments
      .map((row) => row.id)
      .filter((id): id is string => !!id),
  );

  const commitments: RecoveryCommitment[] = input.commitments.map((row) => {
    const prior = row.id ? existingCommitments.get(row.id) : null;
    return {
      id: prior?.id ?? row.id ?? crypto.randomUUID(),
      title: row.title.trim(),
      description: row.description?.trim() || null,
      owner_user_id: row.owner_user_id ?? null,
      owner_name: row.owner_name ?? prior?.owner_name ?? null,
      due_date: row.due_date ?? null,
      status: row.status,
      completed_at:
        row.status === "done"
          ? prior?.status === "done"
            ? prior.completed_at ?? now
            : now
          : row.status === "open" || row.status === "in_progress"
            ? null
            : prior?.completed_at ?? null,
      created_at: prior?.created_at ?? now,
      updated_at: now,
    };
  });

  for (const prior of existing?.commitments ?? []) {
    if (!incomingIds.has(prior.id) && prior.status !== "cancelled") {
      commitments.push({
        ...prior,
        status: "cancelled",
        updated_at: now,
      });
    }
  }

  const plan: ObjectiveRecoveryPlan = {
    id: existing?.id ?? crypto.randomUUID(),
    objective_id: input.objective_id,
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    success_criteria: input.success_criteria?.trim() || null,
    trigger_reason: input.trigger_reason,
    status: input.status,
    owner_user_id: input.owner_user_id ?? null,
    owner_name: input.owner_name ?? existing?.owner_name ?? null,
    target_recovery_date: input.target_recovery_date ?? null,
    baseline_objective_progress:
      existing?.baseline_objective_progress ?? forecast.latest_progress,
    baseline_daily_progress_rate:
      existing?.baseline_daily_progress_rate ?? forecast.daily_progress_rate,
    baseline_review_count:
      existing?.baseline_review_count ?? forecast.review_count,
    activated_at:
      input.status === "active"
        ? existing?.activated_at ?? now
        : existing?.activated_at ?? null,
    recovered_at:
      input.status === "recovered"
        ? existing?.status === "recovered"
          ? existing.recovered_at ?? now
          : now
        : input.status === "draft" || input.status === "active"
          ? null
          : existing?.recovered_at ?? null,
    closed_at:
      input.status === "closed"
        ? existing?.status === "closed"
          ? existing.closed_at ?? now
          : now
        : input.status === "draft" ||
            input.status === "active" ||
            input.status === "recovered"
          ? null
          : existing?.closed_at ?? null,
    version: existing ? existing.version + 1 : 1,
    created_by: existing?.created_by ?? "local-user",
    created_at: existing?.created_at ?? now,
    updated_at: now,
    commitments,
  };

  store.plans = existing
    ? store.plans.map((row) => (row.id === plan.id ? plan : row))
    : [plan, ...store.plans];
  writeLocal(store);
  return { id: plan.id, version: plan.version };
}


export function assessRecoveryPlanEffectiveness(
  plan: ObjectiveRecoveryPlan,
  objective: PortfolioObjective,
  reviews: ObjectiveStrategyReview[],
): RecoveryPlanEffectiveness {
  const current = buildObjectiveForecast(objective, reviews);
  const baselineWeekly =
    plan.baseline_daily_progress_rate == null
      ? null
      : plan.baseline_daily_progress_rate * 7;
  const currentWeekly =
    current.daily_progress_rate == null ? null : current.daily_progress_rate * 7;
  const delta =
    baselineWeekly == null || currentWeekly == null
      ? null
      : currentWeekly - baselineWeekly;
  const progressDelta =
    plan.baseline_objective_progress == null || current.latest_progress == null
      ? null
      : current.latest_progress - plan.baseline_objective_progress;

  return {
    plan_id: plan.id,
    assessment:
      delta == null
        ? "insufficient_data"
        : delta > 0.1
          ? "improved"
          : delta < -0.1
            ? "worsened"
            : "unchanged",
    baseline_weekly_rate: baselineWeekly,
    current_weekly_rate: currentWeekly,
    weekly_rate_delta: delta,
    baseline_progress: plan.baseline_objective_progress,
    current_progress: current.latest_progress,
    progress_delta: progressDelta,
  };
}
