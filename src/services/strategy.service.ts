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
