import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  ExecutiveGovernanceTargetEvaluation,
  ExecutiveGovernanceTargetHistory,
  ExecutiveGovernanceTargetProfile,
  ExecutiveGovernanceTargetsData,
  GovernanceOperatingRhythm,
  GovernanceTargetAssessment,
  GovernanceTargetOperator,
  GovernanceTargetStatus,
  SaveExecutiveGovernanceTargetsInput,
} from "@/types/governance-targets";
import type {
  ExecutiveGovernanceTrendsData,
  GovernancePeriodMetric,
} from "@/types/governance-trends";

const LOCAL_KEY = "projectflow.executive-governance-targets.v1";

interface LocalStore {
  version: 1;
  profile: ExecutiveGovernanceTargetProfile | null;
  history: ExecutiveGovernanceTargetHistory[];
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") {
    return { version: 1, profile: null, history: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalStore>;
    return {
      version: 1,
      profile: normalizeProfile(parsed.profile),
      history: Array.isArray(parsed.history)
        ? parsed.history
            .map(normalizeHistory)
            .filter(
              (row): row is ExecutiveGovernanceTargetHistory => !!row,
            )
        : [],
    };
  } catch {
    return { version: 1, profile: null, history: [] };
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
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function normalizeProfile(
  value: unknown,
): ExecutiveGovernanceTargetProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const version = intOrNull(row.version);
  if (
    typeof row.owner_user_id !== "string" ||
    version == null
  ) {
    return null;
  }
  return {
    owner_user_id: row.owner_user_id,
    decision_resolution_target_pct: numberOrNull(
      row.decision_resolution_target_pct,
    ),
    max_deferred_rate_pct: numberOrNull(row.max_deferred_rate_pct),
    action_completion_target_pct: numberOrNull(
      row.action_completion_target_pct,
    ),
    max_overdue_open_rate_pct: numberOrNull(
      row.max_overdue_open_rate_pct,
    ),
    max_unowned_open_rate_pct: numberOrNull(
      row.max_unowned_open_rate_pct,
    ),
    on_time_completion_target_pct: numberOrNull(
      row.on_time_completion_target_pct,
    ),
    max_median_completion_days: intOrNull(
      row.max_median_completion_days,
    ),
    max_repeated_deferrals: intOrNull(row.max_repeated_deferrals),
    meeting_cadence_days: intOrNull(row.meeting_cadence_days),
    cadence_warning_days_before: intOrNull(
      row.cadence_warning_days_before,
    ),
    version,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : new Date(0).toISOString(),
  };
}

function normalizeHistory(
  value: unknown,
): ExecutiveGovernanceTargetHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const targets = normalizeProfile(row.targets);
  if (
    typeof row.id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    intOrNull(row.version) == null ||
    typeof row.changed_by !== "string" ||
    typeof row.changed_at !== "string" ||
    !targets
  ) {
    return null;
  }
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    version: intOrNull(row.version)!,
    targets,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
  };
}

function validatePercent(value: number | null | undefined, label: string) {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(label + " يجب أن يكون بين 0 و100.");
  }
}

function validateInput(input: SaveExecutiveGovernanceTargetsInput) {
  validatePercent(
    input.decision_resolution_target_pct,
    "Decision Resolution Target",
  );
  validatePercent(input.max_deferred_rate_pct, "Max Deferred Rate");
  validatePercent(
    input.action_completion_target_pct,
    "Action Completion Target",
  );
  validatePercent(
    input.max_overdue_open_rate_pct,
    "Max Overdue Open Rate",
  );
  validatePercent(
    input.max_unowned_open_rate_pct,
    "Max Unowned Open Rate",
  );
  validatePercent(
    input.on_time_completion_target_pct,
    "On-time Completion Target",
  );

  const integerChecks: Array<
    [number | null | undefined, number, number, string]
  > = [
    [
      input.max_median_completion_days,
      1,
      3650,
      "Max Median Completion Days",
    ],
    [
      input.max_repeated_deferrals,
      0,
      10000,
      "Max Repeated Deferrals",
    ],
    [input.meeting_cadence_days, 1, 366, "Meeting Cadence"],
    [
      input.cadence_warning_days_before,
      0,
      90,
      "Cadence Warning Days",
    ],
  ];

  for (const [value, min, max, label] of integerChecks) {
    if (value == null) continue;
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(
        label + " يجب أن يكون عددًا صحيحًا بين " + min + " و" + max + ".",
      );
    }
  }

  if (
    input.cadence_warning_days_before != null &&
    input.meeting_cadence_days == null
  ) {
    throw new Error("حدد Meeting Cadence قبل Warning Days.");
  }
  if (
    input.cadence_warning_days_before != null &&
    input.meeting_cadence_days != null &&
    input.cadence_warning_days_before > input.meeting_cadence_days
  ) {
    throw new Error("Warning Days لا يمكن أن تتجاوز Meeting Cadence.");
  }
}

export async function listExecutiveGovernanceTargets(): Promise<ExecutiveGovernanceTargetsData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_executive_governance_targets",
      { method: "POST", body: {} },
    );
    return {
      profile: normalizeProfile(raw.profile),
      history: Array.isArray(raw.history)
        ? raw.history
            .map(normalizeHistory)
            .filter(
              (row): row is ExecutiveGovernanceTargetHistory => !!row,
            )
        : [],
    };
  }

  const store = readLocal();
  return {
    profile: store.profile,
    history: [...store.history].sort((a, b) => b.version - a.version),
  };
}

export async function saveExecutiveGovernanceTargets(
  input: SaveExecutiveGovernanceTargetsInput,
): Promise<ExecutiveGovernanceTargetProfile> {
  validateInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_executive_governance_targets",
      {
        method: "POST",
        body: {
          p_expected_version: input.expected_version ?? null,
          p_decision_resolution_target_pct:
            input.decision_resolution_target_pct ?? null,
          p_max_deferred_rate_pct:
            input.max_deferred_rate_pct ?? null,
          p_action_completion_target_pct:
            input.action_completion_target_pct ?? null,
          p_max_overdue_open_rate_pct:
            input.max_overdue_open_rate_pct ?? null,
          p_max_unowned_open_rate_pct:
            input.max_unowned_open_rate_pct ?? null,
          p_on_time_completion_target_pct:
            input.on_time_completion_target_pct ?? null,
          p_max_median_completion_days:
            input.max_median_completion_days ?? null,
          p_max_repeated_deferrals:
            input.max_repeated_deferrals ?? null,
          p_meeting_cadence_days: input.meeting_cadence_days ?? null,
          p_cadence_warning_days_before:
            input.cadence_warning_days_before ?? null,
        },
      },
    );
    const profile = normalizeProfile(raw);
    if (!profile) {
      throw new Error("عاد الخادم بإعدادات حوكمة غير صالحة.");
    }
    return profile;
  }

  const store = readLocal();
  const existing = store.profile;
  if (
    existing &&
    (input.expected_version == null ||
      input.expected_version !== existing.version)
  ) {
    throw new Error("تم تعديل Targets. حدّث البيانات وأعد المحاولة.");
  }
  if (!existing && input.expected_version != null) {
    throw new Error("تم تعديل Targets. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const profile: ExecutiveGovernanceTargetProfile = {
    owner_user_id: existing?.owner_user_id ?? "local-user",
    decision_resolution_target_pct:
      input.decision_resolution_target_pct ?? null,
    max_deferred_rate_pct: input.max_deferred_rate_pct ?? null,
    action_completion_target_pct:
      input.action_completion_target_pct ?? null,
    max_overdue_open_rate_pct:
      input.max_overdue_open_rate_pct ?? null,
    max_unowned_open_rate_pct:
      input.max_unowned_open_rate_pct ?? null,
    on_time_completion_target_pct:
      input.on_time_completion_target_pct ?? null,
    max_median_completion_days:
      input.max_median_completion_days ?? null,
    max_repeated_deferrals: input.max_repeated_deferrals ?? null,
    meeting_cadence_days: input.meeting_cadence_days ?? null,
    cadence_warning_days_before:
      input.cadence_warning_days_before ?? null,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  const history: ExecutiveGovernanceTargetHistory = {
    id: crypto.randomUUID(),
    owner_user_id: profile.owner_user_id,
    version: profile.version,
    targets: { ...profile },
    changed_by: profile.owner_user_id,
    changed_at: now,
  };

  store.profile = profile;
  store.history = [history, ...store.history].slice(0, 25);
  writeLocal(store);
  return profile;
}

function assessmentStatus(
  actual: number | null,
  target: number | null,
  operator: GovernanceTargetOperator,
): GovernanceTargetStatus {
  if (target == null) return "no_target";
  if (actual == null) return "insufficient_data";
  return operator === "gte"
    ? actual >= target
      ? "met"
      : "not_met"
    : actual <= target
      ? "met"
      : "not_met";
}

function assessment(
  key: GovernanceTargetAssessment["key"],
  label: string,
  operator: GovernanceTargetOperator,
  actual: number | null,
  target: number | null,
  unit: GovernanceTargetAssessment["unit"],
  trend: GovernancePeriodMetric,
): GovernanceTargetAssessment {
  return {
    key,
    label,
    operator,
    actual,
    target,
    unit,
    status: assessmentStatus(actual, target, operator),
    gap:
      actual == null || target == null
        ? null
        : operator === "gte"
          ? actual - target
          : target - actual,
    trend,
  };
}

function dateFromKey(value: string) {
  return new Date(value + "T12:00:00Z");
}

function keyFromDate(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return keyFromDate(date);
}

function signedDaysBetween(start: string, end: string) {
  return Math.round(
    (dateFromKey(end).getTime() - dateFromKey(start).getTime()) /
      86_400_000,
  );
}

function localTodayKey(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildRhythm(
  profile: ExecutiveGovernanceTargetProfile | null,
  meetingData: ExecutiveMeetingGovernanceData,
  today = localTodayKey(),
): GovernanceOperatingRhythm {
  const cadence = profile?.meeting_cadence_days ?? null;
  const warning = profile?.cadence_warning_days_before ?? null;
  const latest = meetingData.meetings
    .filter((meeting) => meeting.status === "completed")
    .map((meeting) => meeting.meeting_date)
    .sort()
    .at(-1) ?? null;

  if (cadence == null) {
    return {
      cadence_days: null,
      warning_days_before: warning,
      last_finalized_meeting_date: latest,
      next_due_date: null,
      warning_date: null,
      days_to_due: null,
      status: "no_target",
    };
  }

  if (!latest) {
    return {
      cadence_days: cadence,
      warning_days_before: warning,
      last_finalized_meeting_date: null,
      next_due_date: null,
      warning_date: null,
      days_to_due: null,
      status: "no_meetings",
    };
  }

  const nextDue = addDays(latest, cadence);
  const warningDate =
    warning == null ? null : addDays(nextDue, -warning);
  const daysToDue = signedDaysBetween(today, nextDue);

  return {
    cadence_days: cadence,
    warning_days_before: warning,
    last_finalized_meeting_date: latest,
    next_due_date: nextDue,
    warning_date: warningDate,
    days_to_due: daysToDue,
    status:
      today > nextDue
        ? "overdue"
        : warningDate && today >= warningDate
          ? "due_soon"
          : "on_schedule",
  };
}

export function evaluateExecutiveGovernanceTargets(
  targets: ExecutiveGovernanceTargetsData,
  trends: ExecutiveGovernanceTrendsData,
  meetings: ExecutiveMeetingGovernanceData,
  today = localTodayKey(),
): ExecutiveGovernanceTargetEvaluation {
  const profile = targets.profile;
  const summary = trends.summary;

  const assessments: GovernanceTargetAssessment[] = [
    assessment(
      "decision_resolution",
      "Decision Resolution",
      "gte",
      summary.decision_resolution_rate.current,
      profile?.decision_resolution_target_pct ?? null,
      "%",
      summary.decision_resolution_rate,
    ),
    assessment(
      "deferred_rate",
      "Deferred Rate",
      "lte",
      summary.deferred_rate.current,
      profile?.max_deferred_rate_pct ?? null,
      "%",
      summary.deferred_rate,
    ),
    assessment(
      "action_completion",
      "Action Completion",
      "gte",
      summary.action_completion_rate.current,
      profile?.action_completion_target_pct ?? null,
      "%",
      summary.action_completion_rate,
    ),
    assessment(
      "overdue_open",
      "Overdue Open Rate",
      "lte",
      summary.overdue_open_rate.current,
      profile?.max_overdue_open_rate_pct ?? null,
      "%",
      summary.overdue_open_rate,
    ),
    assessment(
      "unowned_open",
      "Unowned Open Rate",
      "lte",
      summary.unowned_open_rate.current,
      profile?.max_unowned_open_rate_pct ?? null,
      "%",
      summary.unowned_open_rate,
    ),
    assessment(
      "on_time_completion",
      "On-time Completion",
      "gte",
      summary.on_time_completion_rate.current,
      profile?.on_time_completion_target_pct ?? null,
      "%",
      summary.on_time_completion_rate,
    ),
    assessment(
      "median_completion_days",
      "Median Completion Days",
      "lte",
      summary.median_completion_days.current,
      profile?.max_median_completion_days ?? null,
      "days",
      summary.median_completion_days,
    ),
    assessment(
      "repeated_deferrals",
      "Repeated Deferrals",
      "lte",
      summary.repeated_deferrals_open.current,
      profile?.max_repeated_deferrals ?? null,
      "count",
      summary.repeated_deferrals_open,
    ),
  ];

  return {
    assessments,
    met_count: assessments.filter((row) => row.status === "met").length,
    not_met_count: assessments.filter((row) => row.status === "not_met")
      .length,
    configured_count: assessments.filter(
      (row) => row.status !== "no_target",
    ).length,
    insufficient_count: assessments.filter(
      (row) => row.status === "insufficient_data",
    ).length,
    rhythm: buildRhythm(profile, meetings, today),
  };
}
