import { isSupabaseBackend } from "@/lib/backend-config";
import { buildObjectiveForecast } from "@/services/strategy-forecast.service";
import {
  listPortfolioStrategy,
  listStrategyReviewData,
} from "@/services/strategy.service";
import { listObjectiveRecoveryPlans } from "@/services/strategy-recovery.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ObjectiveStrategyCadence,
  RecordRecoveryCheckpointInput,
  RecoveryCheckpointAssessment,
  RecoveryCheckpointCadence,
  RecoveryPlanCheckpoint,
  SaveObjectiveStrategyCadenceInput,
  SaveRecoveryCheckpointCadenceInput,
  StrategyCalendarData,
  StrategyCalendarEvent,
  StrategyCalendarEventStatus,
  StrategyCalendarEventType,
} from "@/types/strategy";

const LOCAL_KEY = "projectflow.strategy-calendar.v1";

interface LocalCalendarStore {
  version: 1;
  objective_cadences: ObjectiveStrategyCadence[];
  recovery_cadences: RecoveryCheckpointCadence[];
  recovery_checkpoints: RecoveryPlanCheckpoint[];
}

function readLocal(): LocalCalendarStore {
  if (typeof window === "undefined") {
    return {
      version: 1,
      objective_cadences: [],
      recovery_cadences: [],
      recovery_checkpoints: [],
    };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalCalendarStore>;
    return {
      version: 1,
      objective_cadences: Array.isArray(parsed.objective_cadences)
        ? parsed.objective_cadences
        : [],
      recovery_cadences: Array.isArray(parsed.recovery_cadences)
        ? parsed.recovery_cadences
        : [],
      recovery_checkpoints: Array.isArray(parsed.recovery_checkpoints)
        ? parsed.recovery_checkpoints
        : [],
    };
  } catch {
    return {
      version: 1,
      objective_cadences: [],
      recovery_cadences: [],
      recovery_checkpoints: [],
    };
  }
}

function writeLocal(store: LocalCalendarStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ? Number(value)
      : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function eventType(value: unknown): StrategyCalendarEventType {
  return value === "strategy_review" ||
    value === "kr_update" ||
    value === "benefit_review" ||
    value === "recovery_checkpoint" ||
    value === "recovery_commitment"
    ? value
    : "strategy_review";
}

function eventStatus(value: unknown): StrategyCalendarEventStatus {
  return value === "overdue" ||
    value === "due_soon" ||
    value === "upcoming"
    ? value
    : "upcoming";
}

function checkpointAssessment(value: unknown): RecoveryCheckpointAssessment {
  return value === "on_track" ||
    value === "at_risk" ||
    value === "off_track" ||
    value === "recovered"
    ? value
    : "on_track";
}

function normalizeEvent(value: unknown): StrategyCalendarEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.source_id !== "string" ||
    typeof row.objective_id !== "string" ||
    typeof row.objective_title !== "string" ||
    typeof row.title !== "string" ||
    typeof row.due_date !== "string"
  ) {
    return null;
  }
  return {
    event_type: eventType(row.event_type),
    source_id: row.source_id,
    objective_id: row.objective_id,
    objective_title: row.objective_title,
    project_id: stringOrNull(row.project_id),
    title: row.title,
    due_date: row.due_date,
    primary_owner_user_id: stringOrNull(row.primary_owner_user_id),
    reminder_days_before: numberValue(row.reminder_days_before),
    status: eventStatus(row.status),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

function normalizeObjectiveCadence(
  value: unknown,
): ObjectiveStrategyCadence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.objective_id !== "string" ||
    typeof row.review_anchor_date !== "string" ||
    typeof row.kr_anchor_date !== "string"
  ) {
    return null;
  }
  return {
    objective_id: row.objective_id,
    review_interval_days: numberValue(row.review_interval_days, 90),
    kr_update_interval_days: numberValue(row.kr_update_interval_days, 30),
    reminder_days_before: numberValue(row.reminder_days_before, 7),
    review_anchor_date: row.review_anchor_date,
    kr_anchor_date: row.kr_anchor_date,
    last_kr_checkin_date: stringOrNull(row.last_kr_checkin_date),
    is_enabled: row.is_enabled !== false,
    version: numberValue(row.version, 1),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizeRecoveryCadence(
  value: unknown,
): RecoveryCheckpointCadence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.plan_id !== "string" ||
    typeof row.objective_id !== "string" ||
    typeof row.anchor_date !== "string"
  ) {
    return null;
  }
  return {
    plan_id: row.plan_id,
    objective_id: row.objective_id,
    checkpoint_interval_days: numberValue(row.checkpoint_interval_days, 14),
    reminder_days_before: numberValue(row.reminder_days_before, 3),
    anchor_date: row.anchor_date,
    is_enabled: row.is_enabled !== false,
    version: numberValue(row.version, 1),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizeCheckpoint(value: unknown): RecoveryPlanCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.plan_id !== "string" ||
    typeof row.objective_id !== "string" ||
    typeof row.checkpoint_date !== "string" ||
    typeof row.created_by !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    plan_id: row.plan_id,
    objective_id: row.objective_id,
    checkpoint_date: row.checkpoint_date,
    assessment: checkpointAssessment(row.assessment),
    note: stringOrNull(row.note),
    objective_progress_snapshot:
      row.objective_progress_snapshot == null
        ? null
        : numberValue(row.objective_progress_snapshot),
    daily_progress_rate_snapshot:
      row.daily_progress_rate_snapshot == null
        ? null
        : numberValue(row.daily_progress_rate_snapshot),
    created_by: row.created_by,
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
  };
}

function dateFromKey(value: string) {
  return new Date(value + "T12:00:00Z");
}

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function maxDate(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => !!value).sort().at(-1)!;
}

function localEventStatus(
  dueDate: string,
  reminderDaysBefore: number,
): StrategyCalendarEventStatus {
  const today = todayKey();
  if (dueDate < today) return "overdue";
  const dueSoonBoundary = addDays(today, reminderDaysBefore);
  return dueDate <= dueSoonBoundary ? "due_soon" : "upcoming";
}

async function buildLocalData(store: LocalCalendarStore): Promise<StrategyCalendarData> {
  const [strategy, reviewData, recoveryData] = await Promise.all([
    listPortfolioStrategy(),
    listStrategyReviewData(),
    listObjectiveRecoveryPlans(),
  ]);
  const events: StrategyCalendarEvent[] = [];

  for (const cadence of store.objective_cadences) {
    const objective = strategy.objectives.find(
      (row) => row.id === cadence.objective_id,
    );
    if (!objective || !cadence.is_enabled) continue;

    const latestReview = reviewData.reviews
      .filter((row) => row.objective_id === objective.id)
      .map((row) => row.review_date)
      .sort()
      .at(-1);

    const reviewDue = addDays(
      maxDate(cadence.review_anchor_date, latestReview),
      cadence.review_interval_days,
    );
    events.push({
      event_type: "strategy_review",
      source_id: objective.id,
      objective_id: objective.id,
      objective_title: objective.title,
      project_id: objective.project_ids[0] ?? null,
      title: "مراجعة استراتيجية — " + objective.title,
      due_date: reviewDue,
      primary_owner_user_id: objective.owner_user_id,
      reminder_days_before: cadence.reminder_days_before,
      status: localEventStatus(reviewDue, cadence.reminder_days_before),
      metadata: {
        cadence_version: cadence.version,
        interval_days: cadence.review_interval_days,
      },
    });

    const krDue = addDays(
      maxDate(cadence.kr_anchor_date, cadence.last_kr_checkin_date),
      cadence.kr_update_interval_days,
    );
    events.push({
      event_type: "kr_update",
      source_id: objective.id,
      objective_id: objective.id,
      objective_title: objective.title,
      project_id: objective.project_ids[0] ?? null,
      title: "تحديث Key Results — " + objective.title,
      due_date: krDue,
      primary_owner_user_id: objective.owner_user_id,
      reminder_days_before: cadence.reminder_days_before,
      status: localEventStatus(krDue, cadence.reminder_days_before),
      metadata: {
        cadence_version: cadence.version,
        interval_days: cadence.kr_update_interval_days,
        last_checkin_date: cadence.last_kr_checkin_date,
      },
    });
  }

  for (const benefit of reviewData.benefits) {
    if (
      !benefit.target_date ||
      benefit.status === "realized" ||
      benefit.status === "not_realized"
    ) {
      continue;
    }
    const objective = strategy.objectives.find(
      (row) => row.id === benefit.objective_id,
    );
    if (!objective) continue;
    const cadence = store.objective_cadences.find(
      (row) => row.objective_id === benefit.objective_id && row.is_enabled,
    );
    const reminder = cadence?.reminder_days_before ?? 0;
    events.push({
      event_type: "benefit_review",
      source_id: benefit.id,
      objective_id: objective.id,
      objective_title: objective.title,
      project_id: objective.project_ids[0] ?? null,
      title: "مراجعة Benefit — " + benefit.title,
      due_date: benefit.target_date,
      primary_owner_user_id: benefit.owner_user_id,
      reminder_days_before: reminder,
      status: localEventStatus(benefit.target_date, reminder),
      metadata: {
        benefit_title: benefit.title,
        benefit_status: benefit.status,
      },
    });
  }

  for (const plan of recoveryData.plans) {
    const objective = strategy.objectives.find(
      (row) => row.id === plan.objective_id,
    );
    if (!objective || plan.status !== "active") continue;
    const cadence = store.recovery_cadences.find(
      (row) => row.plan_id === plan.id && row.is_enabled,
    );

    if (cadence) {
      const latestCheckpoint = store.recovery_checkpoints
        .filter((row) => row.plan_id === plan.id)
        .map((row) => row.checkpoint_date)
        .sort()
        .at(-1);
      const due = addDays(
        maxDate(cadence.anchor_date, latestCheckpoint),
        cadence.checkpoint_interval_days,
      );
      events.push({
        event_type: "recovery_checkpoint",
        source_id: plan.id,
        objective_id: objective.id,
        objective_title: objective.title,
        project_id: objective.project_ids[0] ?? null,
        title: "Recovery Checkpoint — " + plan.title,
        due_date: due,
        primary_owner_user_id: plan.owner_user_id,
        reminder_days_before: cadence.reminder_days_before,
        status: localEventStatus(due, cadence.reminder_days_before),
        metadata: {
          plan_title: plan.title,
          plan_status: plan.status,
          cadence_version: cadence.version,
          interval_days: cadence.checkpoint_interval_days,
        },
      });
    }

    for (const commitment of plan.commitments) {
      if (
        !commitment.due_date ||
        commitment.status === "done" ||
        commitment.status === "cancelled"
      ) {
        continue;
      }
      const reminder = cadence?.reminder_days_before ?? 0;
      events.push({
        event_type: "recovery_commitment",
        source_id: commitment.id,
        objective_id: objective.id,
        objective_title: objective.title,
        project_id: objective.project_ids[0] ?? null,
        title: "Recovery Commitment — " + commitment.title,
        due_date: commitment.due_date,
        primary_owner_user_id: commitment.owner_user_id,
        reminder_days_before: reminder,
        status: localEventStatus(commitment.due_date, reminder),
        metadata: {
          plan_id: plan.id,
          plan_title: plan.title,
          commitment_title: commitment.title,
          commitment_status: commitment.status,
        },
      });
    }
  }

  return {
    events: events.sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) ||
        a.event_type.localeCompare(b.event_type),
    ),
    objective_cadences: [...store.objective_cadences],
    recovery_cadences: [...store.recovery_cadences],
    recovery_checkpoints: [...store.recovery_checkpoints].sort((a, b) =>
      b.checkpoint_date.localeCompare(a.checkpoint_date),
    ),
  };
}

export async function listStrategyCalendar(): Promise<StrategyCalendarData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_strategy_calendar",
      { method: "POST", body: {} },
    );
    return {
      events: Array.isArray(raw.events)
        ? raw.events
            .map(normalizeEvent)
            .filter((item): item is StrategyCalendarEvent => !!item)
        : [],
      objective_cadences: Array.isArray(raw.objective_cadences)
        ? raw.objective_cadences
            .map(normalizeObjectiveCadence)
            .filter((item): item is ObjectiveStrategyCadence => !!item)
        : [],
      recovery_cadences: Array.isArray(raw.recovery_cadences)
        ? raw.recovery_cadences
            .map(normalizeRecoveryCadence)
            .filter((item): item is RecoveryCheckpointCadence => !!item)
        : [],
      recovery_checkpoints: Array.isArray(raw.recovery_checkpoints)
        ? raw.recovery_checkpoints
            .map(normalizeCheckpoint)
            .filter((item): item is RecoveryPlanCheckpoint => !!item)
        : [],
    };
  }
  return buildLocalData(readLocal());
}

export async function saveObjectiveStrategyCadence(
  input: SaveObjectiveStrategyCadenceInput,
): Promise<ObjectiveStrategyCadence> {
  if (
    !Number.isFinite(input.review_interval_days) ||
    !Number.isFinite(input.kr_update_interval_days) ||
    !Number.isFinite(input.reminder_days_before) ||
    input.review_interval_days < 1 ||
    input.review_interval_days > 366 ||
    input.kr_update_interval_days < 1 ||
    input.kr_update_interval_days > 366 ||
    input.reminder_days_before < 0 ||
    input.reminder_days_before > 60
  ) {
    throw new Error("إعدادات cadence غير صالحة.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_objective_strategy_cadence",
      {
        method: "POST",
        body: {
          p_objective_id: input.objective_id,
          p_expected_version: input.expected_version ?? null,
          p_review_interval_days: input.review_interval_days,
          p_kr_update_interval_days: input.kr_update_interval_days,
          p_reminder_days_before: input.reminder_days_before,
          p_review_anchor_date: input.review_anchor_date,
          p_kr_anchor_date: input.kr_anchor_date,
          p_is_enabled: input.is_enabled,
        },
      },
    );
    const row = normalizeObjectiveCadence(raw);
    if (!row) throw new Error("عاد الخادم بإعداد cadence غير صالح.");
    return row;
  }

  const store = readLocal();
  const existing = store.objective_cadences.find(
    (row) => row.objective_id === input.objective_id,
  );
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل cadence. حدّث البيانات وأعد المحاولة.");
  }
  const now = new Date().toISOString();
  const row: ObjectiveStrategyCadence = {
    objective_id: input.objective_id,
    review_interval_days: input.review_interval_days,
    kr_update_interval_days: input.kr_update_interval_days,
    reminder_days_before: input.reminder_days_before,
    review_anchor_date: input.review_anchor_date,
    kr_anchor_date: input.kr_anchor_date,
    last_kr_checkin_date: existing?.last_kr_checkin_date ?? null,
    is_enabled: input.is_enabled,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store.objective_cadences = existing
    ? store.objective_cadences.map((item) =>
        item.objective_id === row.objective_id ? row : item,
      )
    : [row, ...store.objective_cadences];
  writeLocal(store);
  return row;
}

export async function acknowledgeObjectiveKrCheckin(
  objectiveId: string,
  checkinDate = todayKey(),
): Promise<ObjectiveStrategyCadence> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/acknowledge_objective_kr_checkin",
      {
        method: "POST",
        body: {
          p_objective_id: objectiveId,
          p_checkin_date: checkinDate,
        },
      },
    );
    const row = normalizeObjectiveCadence(raw);
    if (!row) throw new Error("تعذر تسجيل تحديث Key Results.");
    return row;
  }

  const store = readLocal();
  const existing = store.objective_cadences.find(
    (row) => row.objective_id === objectiveId,
  );
  if (!existing) throw new Error("فعّل cadence أولًا.");
  const row = {
    ...existing,
    last_kr_checkin_date: checkinDate,
    version: existing.version + 1,
    updated_at: new Date().toISOString(),
  };
  store.objective_cadences = store.objective_cadences.map((item) =>
    item.objective_id === objectiveId ? row : item,
  );
  writeLocal(store);
  return row;
}

export async function saveRecoveryCheckpointCadence(
  input: SaveRecoveryCheckpointCadenceInput,
): Promise<RecoveryCheckpointCadence> {
  if (
    !Number.isFinite(input.checkpoint_interval_days) ||
    !Number.isFinite(input.reminder_days_before) ||
    input.checkpoint_interval_days < 1 ||
    input.checkpoint_interval_days > 180 ||
    input.reminder_days_before < 0 ||
    input.reminder_days_before > 60
  ) {
    throw new Error("إعداد Recovery cadence غير صالح.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_recovery_checkpoint_cadence",
      {
        method: "POST",
        body: {
          p_plan_id: input.plan_id,
          p_expected_version: input.expected_version ?? null,
          p_checkpoint_interval_days: input.checkpoint_interval_days,
          p_reminder_days_before: input.reminder_days_before,
          p_anchor_date: input.anchor_date,
          p_is_enabled: input.is_enabled,
        },
      },
    );
    const row = normalizeRecoveryCadence(raw);
    if (!row) throw new Error("عاد الخادم بإعداد Recovery cadence غير صالح.");
    return row;
  }

  const store = readLocal();
  const recoveryData = await listObjectiveRecoveryPlans();
  const plan = recoveryData.plans.find((row) => row.id === input.plan_id);
  if (!plan) throw new Error("Recovery Plan غير موجودة.");
  const existing = store.recovery_cadences.find(
    (row) => row.plan_id === input.plan_id,
  );
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل Recovery cadence. حدّث البيانات وأعد المحاولة.");
  }
  const now = new Date().toISOString();
  const row: RecoveryCheckpointCadence = {
    plan_id: input.plan_id,
    objective_id: plan.objective_id,
    checkpoint_interval_days: input.checkpoint_interval_days,
    reminder_days_before: input.reminder_days_before,
    anchor_date: input.anchor_date,
    is_enabled: input.is_enabled,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store.recovery_cadences = existing
    ? store.recovery_cadences.map((item) =>
        item.plan_id === row.plan_id ? row : item,
      )
    : [row, ...store.recovery_cadences];
  writeLocal(store);
  return row;
}

export async function recordRecoveryCheckpoint(
  input: RecordRecoveryCheckpointInput,
): Promise<RecoveryPlanCheckpoint> {
  const checkpointDate = input.checkpoint_date ?? todayKey();

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>("rpc/record_recovery_checkpoint", {
      method: "POST",
      body: {
        p_plan_id: input.plan_id,
        p_assessment: input.assessment,
        p_note: input.note ?? null,
        p_checkpoint_date: checkpointDate,
      },
    });
    const row = normalizeCheckpoint(raw);
    if (!row) throw new Error("عاد الخادم بـRecovery Checkpoint غير صالح.");
    return row;
  }

  const [strategy, reviews, recovery] = await Promise.all([
    listPortfolioStrategy(),
    listStrategyReviewData(),
    listObjectiveRecoveryPlans(),
  ]);
  const plan = recovery.plans.find((row) => row.id === input.plan_id);
  if (!plan) throw new Error("Recovery Plan غير موجودة.");
  const objective = strategy.objectives.find(
    (row) => row.id === plan.objective_id,
  );
  if (!objective) throw new Error("Objective غير موجود.");
  const forecast = buildObjectiveForecast(objective, reviews.reviews);
  const row: RecoveryPlanCheckpoint = {
    id: crypto.randomUUID(),
    plan_id: plan.id,
    objective_id: plan.objective_id,
    checkpoint_date: checkpointDate,
    assessment: input.assessment,
    note: input.note?.trim() || null,
    objective_progress_snapshot: forecast.latest_progress,
    daily_progress_rate_snapshot: forecast.daily_progress_rate,
    created_by: "local-user",
    created_at: new Date().toISOString(),
  };
  const store = readLocal();
  store.recovery_checkpoints = [row, ...store.recovery_checkpoints];
  writeLocal(store);
  return row;
}

export async function refreshStrategyScheduleNotifications(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  const raw = await supabaseRest<unknown>(
    "rpc/refresh_strategy_schedule_notifications",
    { method: "POST", body: {} },
  );
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
