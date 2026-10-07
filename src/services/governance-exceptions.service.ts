import { isSupabaseBackend } from "@/lib/backend-config";
import { listExecutiveStrategyMeetings } from "@/services/executive-meetings.service";
import { listExecutiveGovernanceTargets } from "@/services/governance-targets.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  CreateExecutiveGovernanceExceptionInput,
  ExecutiveGovernanceException,
  ExecutiveGovernanceExceptionHistory,
  ExecutiveGovernanceExceptionsData,
  GovernanceExceptionMetricKey,
  GovernanceExceptionOperator,
  GovernanceExceptionStatus,
  GovernanceExceptionUnit,
  UpdateExecutiveGovernanceExceptionInput,
} from "@/types/governance-exceptions";

const LOCAL_KEY = "projectflow.executive-governance-exceptions.v1";

interface LocalStore {
  version: 1;
  exceptions: ExecutiveGovernanceException[];
  history: ExecutiveGovernanceExceptionHistory[];
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") {
    return { version: 1, exceptions: [], history: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalStore>;
    return {
      version: 1,
      exceptions: Array.isArray(parsed.exceptions)
        ? parsed.exceptions
            .map(normalizeException)
            .filter((row): row is ExecutiveGovernanceException => !!row)
        : [],
      history: Array.isArray(parsed.history)
        ? parsed.history
            .map(normalizeHistory)
            .filter(
              (row): row is ExecutiveGovernanceExceptionHistory => !!row,
            )
        : [],
    };
  } catch {
    return { version: 1, exceptions: [], history: [] };
  }
}

function writeLocal(store: LocalStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function numberValue(value: unknown) {
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

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function metricKey(value: unknown): GovernanceExceptionMetricKey | null {
  return value === "decision_resolution" ||
    value === "deferred_rate" ||
    value === "action_completion" ||
    value === "overdue_open" ||
    value === "unowned_open" ||
    value === "on_time_completion" ||
    value === "median_completion_days" ||
    value === "repeated_deferrals"
    ? value
    : null;
}

function statusValue(value: unknown): GovernanceExceptionStatus | null {
  return value === "open" ||
    value === "mitigating" ||
    value === "accepted" ||
    value === "resolved" ||
    value === "cancelled"
    ? value
    : null;
}

function operatorValue(value: unknown): GovernanceExceptionOperator | null {
  return value === "gte" || value === "lte" ? value : null;
}

function unitValue(value: unknown): GovernanceExceptionUnit | null {
  return value === "%" || value === "days" || value === "count"
    ? value
    : null;
}

function normalizeException(
  value: unknown,
): ExecutiveGovernanceException | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const metric = metricKey(row.metric_key);
  const status = statusValue(row.status);
  const operator = operatorValue(row.target_operator);
  const unit = unitValue(row.target_unit);
  const actual = numberValue(row.actual_value);
  const target = numberValue(row.target_value);
  const targetVersion = numberValue(row.target_version);
  const version = numberValue(row.version);

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
    corrective_action: stringOrNull(row.corrective_action),
    responsible_name: stringOrNull(row.responsible_name),
    due_date: stringOrNull(row.due_date),
    status,
    actual_value: actual,
    target_value: target,
    target_operator: operator,
    target_unit: unit,
    target_version: Math.trunc(targetVersion),
    source_window_meeting_ids: Array.isArray(row.source_window_meeting_ids)
      ? row.source_window_meeting_ids.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    resolved_at: stringOrNull(row.resolved_at),
    version: Math.trunc(version),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeHistory(
  value: unknown,
): ExecutiveGovernanceExceptionHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const snapshot = normalizeException(row.snapshot);
  const version = numberValue(row.version);
  if (
    typeof row.id !== "string" ||
    typeof row.exception_id !== "string" ||
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
    exception_id: row.exception_id,
    owner_user_id: row.owner_user_id,
    version: Math.trunc(version),
    snapshot,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
  };
}

function validateText(
  value: string | null | undefined,
  min: number,
  max: number,
  label: string,
) {
  const length = value?.trim().length ?? 0;
  if (length < min || length > max) {
    throw new Error(label + " غير صالح.");
  }
}

function targetForMetric(
  metric: GovernanceExceptionMetricKey,
  profile: Awaited<ReturnType<typeof listExecutiveGovernanceTargets>>["profile"],
): {
  value: number | null;
  operator: GovernanceExceptionOperator;
  unit: GovernanceExceptionUnit;
} {
  switch (metric) {
    case "decision_resolution":
      return {
        value: profile?.decision_resolution_target_pct ?? null,
        operator: "gte",
        unit: "%",
      };
    case "deferred_rate":
      return {
        value: profile?.max_deferred_rate_pct ?? null,
        operator: "lte",
        unit: "%",
      };
    case "action_completion":
      return {
        value: profile?.action_completion_target_pct ?? null,
        operator: "gte",
        unit: "%",
      };
    case "overdue_open":
      return {
        value: profile?.max_overdue_open_rate_pct ?? null,
        operator: "lte",
        unit: "%",
      };
    case "unowned_open":
      return {
        value: profile?.max_unowned_open_rate_pct ?? null,
        operator: "lte",
        unit: "%",
      };
    case "on_time_completion":
      return {
        value: profile?.on_time_completion_target_pct ?? null,
        operator: "gte",
        unit: "%",
      };
    case "median_completion_days":
      return {
        value: profile?.max_median_completion_days ?? null,
        operator: "lte",
        unit: "days",
      };
    case "repeated_deferrals":
      return {
        value: profile?.max_repeated_deferrals ?? null,
        operator: "lte",
        unit: "count",
      };
  }
}

function targetBreached(
  actual: number,
  target: number,
  operator: GovernanceExceptionOperator,
) {
  return operator === "gte" ? actual < target : actual > target;
}

function validateCreateInput(input: CreateExecutiveGovernanceExceptionInput) {
  validateText(input.title, 1, 240, "عنوان الاستثناء");
  validateText(input.rationale, 1, 6000, "مبرر الاستثناء");
  if ((input.corrective_action?.length ?? 0) > 6000) {
    throw new Error("خطة المعالجة طويلة جدًا.");
  }
  if ((input.responsible_name?.length ?? 0) > 180) {
    throw new Error("اسم المسؤول طويل جدًا.");
  }
  if (!Number.isFinite(input.actual_value)) {
    throw new Error("Actual value غير صالح.");
  }
  const ids = [...new Set(input.source_window_meeting_ids)];
  if (ids.length < 1 || ids.length > 3) {
    throw new Error("يجب ربط الاستثناء بنافذة من 1 إلى 3 اجتماعات.");
  }
  if (ids.length !== input.source_window_meeting_ids.length) {
    throw new Error("نافذة الاجتماعات تحتوي قيمًا مكررة.");
  }
}

function validateUpdateInput(input: UpdateExecutiveGovernanceExceptionInput) {
  validateText(input.title, 1, 240, "عنوان الاستثناء");
  validateText(input.rationale, 1, 6000, "مبرر الاستثناء");
  if ((input.corrective_action?.length ?? 0) > 6000) {
    throw new Error("خطة المعالجة طويلة جدًا.");
  }
  if ((input.responsible_name?.length ?? 0) > 180) {
    throw new Error("اسم المسؤول طويل جدًا.");
  }
}

export async function listExecutiveGovernanceExceptions(): Promise<ExecutiveGovernanceExceptionsData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_executive_governance_exceptions",
      { method: "POST", body: {} },
    );
    return {
      exceptions: Array.isArray(raw.exceptions)
        ? raw.exceptions
            .map(normalizeException)
            .filter((row): row is ExecutiveGovernanceException => !!row)
        : [],
      history: Array.isArray(raw.history)
        ? raw.history
            .map(normalizeHistory)
            .filter(
              (row): row is ExecutiveGovernanceExceptionHistory => !!row,
            )
        : [],
    };
  }

  const store = readLocal();
  return {
    exceptions: [...store.exceptions],
    history: [...store.history].sort((a, b) =>
      b.changed_at.localeCompare(a.changed_at),
    ),
  };
}

export async function createExecutiveGovernanceException(
  input: CreateExecutiveGovernanceExceptionInput,
): Promise<ExecutiveGovernanceException> {
  validateCreateInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/create_executive_governance_exception",
      {
        method: "POST",
        body: {
          p_expected_target_version: input.expected_target_version,
          p_metric_key: input.metric_key,
          p_title: input.title,
          p_rationale: input.rationale,
          p_corrective_action: input.corrective_action ?? null,
          p_responsible_name: input.responsible_name ?? null,
          p_due_date: input.due_date ?? null,
          p_actual_value: input.actual_value,
          p_source_window_meeting_ids: input.source_window_meeting_ids,
        },
      },
    );
    const row = normalizeException(raw);
    if (!row) throw new Error("عاد الخادم باستثناء حوكمة غير صالح.");
    return row;
  }

  const [targets, meetings] = await Promise.all([
    listExecutiveGovernanceTargets(),
    listExecutiveStrategyMeetings(),
  ]);
  const profile = targets.profile;
  if (!profile) throw new Error("احفظ Governance Targets أولًا.");
  if (profile.version !== input.expected_target_version) {
    throw new Error("تغيرت Governance Targets. حدّث البيانات وأعد المحاولة.");
  }

  const target = targetForMetric(input.metric_key, profile);
  if (target.value == null) {
    throw new Error("لا يوجد Target مضبوط لهذا المقياس.");
  }
  if (!targetBreached(input.actual_value, target.value, target.operator)) {
    throw new Error("القيمة الحالية لا تخالف Target المسجل.");
  }

  const meetingIds = new Set(
    meetings.meetings
      .filter((meeting) => meeting.status === "completed")
      .map((meeting) => meeting.id),
  );
  if (
    input.source_window_meeting_ids.some((id) => !meetingIds.has(id))
  ) {
    throw new Error("نافذة الاجتماعات لم تعد صالحة.");
  }

  const store = readLocal();
  if (
    store.exceptions.some(
      (row) =>
        row.metric_key === input.metric_key &&
        (row.status === "open" ||
          row.status === "mitigating" ||
          row.status === "accepted"),
    )
  ) {
    throw new Error("يوجد Exception نشط بالفعل لهذا المقياس.");
  }

  const now = new Date().toISOString();
  const row: ExecutiveGovernanceException = {
    id: crypto.randomUUID(),
    owner_user_id: profile.owner_user_id,
    metric_key: input.metric_key,
    title: input.title.trim(),
    rationale: input.rationale.trim(),
    corrective_action: input.corrective_action?.trim() || null,
    responsible_name: input.responsible_name?.trim() || null,
    due_date: input.due_date ?? null,
    status: "open",
    actual_value: input.actual_value,
    target_value: target.value,
    target_operator: target.operator,
    target_unit: target.unit,
    target_version: profile.version,
    source_window_meeting_ids: [...input.source_window_meeting_ids],
    resolved_at: null,
    version: 1,
    created_by: profile.owner_user_id,
    created_at: now,
    updated_at: now,
  };
  const history: ExecutiveGovernanceExceptionHistory = {
    id: crypto.randomUUID(),
    exception_id: row.id,
    owner_user_id: row.owner_user_id,
    version: row.version,
    snapshot: { ...row },
    changed_by: row.owner_user_id,
    changed_at: now,
  };

  store.exceptions = [row, ...store.exceptions];
  store.history = [history, ...store.history].slice(0, 50);
  writeLocal(store);
  return row;
}

export async function updateExecutiveGovernanceException(
  input: UpdateExecutiveGovernanceExceptionInput,
): Promise<ExecutiveGovernanceException> {
  validateUpdateInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/update_executive_governance_exception",
      {
        method: "POST",
        body: {
          p_exception_id: input.id,
          p_expected_version: input.expected_version,
          p_title: input.title,
          p_rationale: input.rationale,
          p_corrective_action: input.corrective_action ?? null,
          p_responsible_name: input.responsible_name ?? null,
          p_due_date: input.due_date ?? null,
          p_status: input.status,
        },
      },
    );
    const row = normalizeException(raw);
    if (!row) throw new Error("عاد الخادم باستثناء حوكمة غير صالح.");
    return row;
  }

  const store = readLocal();
  const existing = store.exceptions.find((row) => row.id === input.id);
  if (!existing) throw new Error("Governance Exception غير موجود.");
  if (existing.version !== input.expected_version) {
    throw new Error("تم تعديل Exception. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const row: ExecutiveGovernanceException = {
    ...existing,
    title: input.title.trim(),
    rationale: input.rationale.trim(),
    corrective_action: input.corrective_action?.trim() || null,
    responsible_name: input.responsible_name?.trim() || null,
    due_date: input.due_date ?? null,
    status: input.status,
    resolved_at:
      input.status === "resolved"
        ? existing.resolved_at ?? now
        : null,
    version: existing.version + 1,
    updated_at: now,
  };
  const history: ExecutiveGovernanceExceptionHistory = {
    id: crypto.randomUUID(),
    exception_id: row.id,
    owner_user_id: row.owner_user_id,
    version: row.version,
    snapshot: { ...row },
    changed_by: row.owner_user_id,
    changed_at: now,
  };

  store.exceptions = store.exceptions.map((item) =>
    item.id === row.id ? row : item,
  );
  store.history = [history, ...store.history].slice(0, 50);
  writeLocal(store);
  return row;
}
