import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ProjectAutomationDryRun,
  ProjectAutomationHealth,
  ProjectAutomationKind,
  ProjectAutomationRule,
  ProjectAutomationRun,
  ProjectAutomationRunStatus,
} from "@/types/automations";

const KIND_SET = new Set<ProjectAutomationKind>([
  "blocked_notify_managers",
  "dependency_ready_notify_assignee",
  "due_soon_notify_assignee",
  "overdue_escalate_managers",
  "dependency_ready_set_planned",
]);

const RUN_STATUS_SET = new Set<ProjectAutomationRunStatus>([
  "running",
  "success",
  "skipped",
  "failed",
]);

const LOCAL_PRESETS: Array<{
  kind: ProjectAutomationKind;
  name: string;
  config: Record<string, unknown>;
}> = [
  {
    kind: "blocked_notify_managers",
    name: "تنبيه الإدارة عند تعطل مهمة",
    config: {},
  },
  {
    kind: "dependency_ready_notify_assignee",
    name: "تنبيه المسؤول عند اكتمال المتطلبات",
    config: {},
  },
  {
    kind: "due_soon_notify_assignee",
    name: "تنبيه قبل الاستحقاق",
    config: { days_before: 2 },
  },
  {
    kind: "overdue_escalate_managers",
    name: "تصعيد المهام المتأخرة للإدارة",
    config: { days_overdue: 1 },
  },
  {
    kind: "dependency_ready_set_planned",
    name: "تحويل المهمة إلى مخطط عند اكتمال المتطلبات",
    config: {},
  },
];

function normalizeRule(row: Record<string, unknown>): ProjectAutomationRule | null {
  const kind = row.kind;
  if (
    typeof row.id !== "string" ||
    typeof kind !== "string" ||
    !KIND_SET.has(kind as ProjectAutomationKind) ||
    typeof row.name !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    kind: kind as ProjectAutomationKind,
    name: row.name,
    config:
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {},
    enabled: row.enabled === true,
    last_run_at:
      typeof row.last_run_at === "string" ? row.last_run_at : null,
    last_tested_at:
      typeof row.last_tested_at === "string" ? row.last_tested_at : null,
    last_test_summary:
      row.last_test_summary &&
      typeof row.last_test_summary === "object" &&
      !Array.isArray(row.last_test_summary)
        ? (row.last_test_summary as Record<string, unknown>)
        : null,
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

function normalizeRun(row: Record<string, unknown>): ProjectAutomationRun | null {
  const kind = row.rule_kind;
  const status = row.status;
  if (
    typeof row.id !== "string" ||
    typeof row.rule_id !== "string" ||
    typeof row.rule_name !== "string" ||
    typeof kind !== "string" ||
    !KIND_SET.has(kind as ProjectAutomationKind) ||
    typeof status !== "string" ||
    !RUN_STATUS_SET.has(status as ProjectAutomationRunStatus)
  ) {
    return null;
  }

  return {
    id: row.id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    rule_kind: kind as ProjectAutomationKind,
    board_id: typeof row.board_id === "string" ? row.board_id : null,
    board_name:
      typeof row.board_name === "string" ? row.board_name : null,
    node_id: typeof row.node_id === "string" ? row.node_id : null,
    node_title:
      typeof row.node_title === "string" ? row.node_title : null,
    event_key:
      typeof row.event_key === "string" ? row.event_key : "",
    status: status as ProjectAutomationRunStatus,
    trigger_payload:
      row.trigger_payload &&
      typeof row.trigger_payload === "object" &&
      !Array.isArray(row.trigger_payload)
        ? (row.trigger_payload as Record<string, unknown>)
        : {},
    result:
      row.result &&
      typeof row.result === "object" &&
      !Array.isArray(row.result)
        ? (row.result as Record<string, unknown>)
        : {},
    error: typeof row.error === "string" ? row.error : null,
    attempt_count:
      typeof row.attempt_count === "number" ? row.attempt_count : 1,
    max_attempts:
      typeof row.max_attempts === "number" ? row.max_attempts : 3,
    next_retry_at:
      typeof row.next_retry_at === "string" ? row.next_retry_at : null,
    last_attempt_at:
      typeof row.last_attempt_at === "string"
        ? row.last_attempt_at
        : typeof row.created_at === "string"
          ? row.created_at
          : new Date(0).toISOString(),
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
    finished_at:
      typeof row.finished_at === "string" ? row.finished_at : null,
  };
}

export function workflowAutomationsAvailable() {
  return isSupabaseBackend();
}

export async function listProjectAutomationRules(
  projectId: string,
): Promise<ProjectAutomationRule[]> {
  if (!isSupabaseBackend()) {
    return LOCAL_PRESETS.map((preset, index) => ({
      id: "local-automation-" + preset.kind,
      kind: preset.kind,
      name: preset.name,
      config: preset.config,
      enabled: false,
      last_run_at: null,
      last_tested_at: null,
      last_test_summary: null,
      created_at: new Date(index).toISOString(),
      updated_at: new Date(index).toISOString(),
    }));
  }

  const rows = await supabaseRest<Record<string, unknown>[]>(
    "rpc/list_project_automation_rules",
    {
      method: "POST",
      body: { p_project_id: projectId },
    },
  );

  return rows.flatMap((row) => {
    const normalized = normalizeRule(row);
    return normalized ? [normalized] : [];
  });
}

export async function listProjectAutomationRuns(
  projectId: string,
  limit = 40,
): Promise<ProjectAutomationRun[]> {
  if (!isSupabaseBackend()) return [];

  const rows = await supabaseRest<Record<string, unknown>[]>(
    "rpc/list_project_automation_runs",
    {
      method: "POST",
      body: {
        p_project_id: projectId,
        p_limit: limit,
      },
    },
  );

  return rows.flatMap((row) => {
    const normalized = normalizeRun(row);
    return normalized ? [normalized] : [];
  });
}

export async function setProjectAutomationEnabled(input: {
  projectId: string;
  ruleId: string;
  enabled: boolean;
}): Promise<void> {
  if (!isSupabaseBackend()) {
    throw new Error("تشغيل الأتمتة يتطلب Supabase.");
  }

  await supabaseRest<null>("rpc/set_project_automation_enabled", {
    method: "POST",
    body: {
      p_project_id: input.projectId,
      p_rule_id: input.ruleId,
      p_enabled: input.enabled,
    },
  });
}

export async function updateProjectAutomationConfig(input: {
  projectId: string;
  ruleId: string;
  config: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseBackend()) {
    throw new Error("تعديل الأتمتة يتطلب Supabase.");
  }

  await supabaseRest<null>("rpc/update_project_automation_config", {
    method: "POST",
    body: {
      p_project_id: input.projectId,
      p_rule_id: input.ruleId,
      p_config: input.config,
    },
  });
}

export async function refreshProjectAutomations(
  projectId: string,
): Promise<number> {
  if (!isSupabaseBackend()) return 0;

  return supabaseRest<number>("rpc/refresh_project_automations", {
    method: "POST",
    body: { p_project_id: projectId },
  });
}

export async function refreshMyProjectAutomations(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  return supabaseRest<number>("rpc/refresh_my_project_automations", {
    method: "POST",
    body: {},
  });
}


export async function getProjectAutomationHealth(
  projectId: string,
): Promise<ProjectAutomationHealth> {
  if (!isSupabaseBackend()) {
    return {
      scheduler_mode: "active_app_fallback",
      scheduler_available: false,
      cron_job_name: null,
      cron_job_id: null,
      last_tick_at: null,
      last_success_at: null,
      last_error_at: null,
      last_error: null,
      last_duration_ms: null,
      running_since: null,
      failed_runs: 0,
      retrying_runs: 0,
      exhausted_runs: 0,
      oldest_failed_at: null,
      enabled_rules: 0,
      scheduled_rules: 0,
      checked_at: new Date().toISOString(),
    };
  }

  const raw = await supabaseRest<Record<string, unknown>>(
    "rpc/get_project_automation_health",
    {
      method: "POST",
      body: { p_project_id: projectId },
    },
  );

  return {
    scheduler_mode:
      raw.scheduler_mode === "pg_cron"
        ? "pg_cron"
        : "active_app_fallback",
    scheduler_available: raw.scheduler_available === true,
    cron_job_name:
      typeof raw.cron_job_name === "string" ? raw.cron_job_name : null,
    cron_job_id:
      typeof raw.cron_job_id === "number" ? raw.cron_job_id : null,
    last_tick_at:
      typeof raw.last_tick_at === "string" ? raw.last_tick_at : null,
    last_success_at:
      typeof raw.last_success_at === "string" ? raw.last_success_at : null,
    last_error_at:
      typeof raw.last_error_at === "string" ? raw.last_error_at : null,
    last_error:
      typeof raw.last_error === "string" ? raw.last_error : null,
    last_duration_ms:
      typeof raw.last_duration_ms === "number" ? raw.last_duration_ms : null,
    running_since:
      typeof raw.running_since === "string" ? raw.running_since : null,
    failed_runs:
      typeof raw.failed_runs === "number" ? raw.failed_runs : 0,
    retrying_runs:
      typeof raw.retrying_runs === "number" ? raw.retrying_runs : 0,
    exhausted_runs:
      typeof raw.exhausted_runs === "number" ? raw.exhausted_runs : 0,
    oldest_failed_at:
      typeof raw.oldest_failed_at === "string" ? raw.oldest_failed_at : null,
    enabled_rules:
      typeof raw.enabled_rules === "number" ? raw.enabled_rules : 0,
    scheduled_rules:
      typeof raw.scheduled_rules === "number" ? raw.scheduled_rules : 0,
    checked_at:
      typeof raw.checked_at === "string"
        ? raw.checked_at
        : new Date().toISOString(),
  };
}

export async function testProjectAutomationRule(input: {
  projectId: string;
  ruleId: string;
  limit?: number;
}): Promise<ProjectAutomationDryRun> {
  if (!isSupabaseBackend()) {
    throw new Error("اختبار الأتمتة يتطلب Supabase.");
  }

  const raw = await supabaseRest<Record<string, unknown>>(
    "rpc/test_project_automation_rule",
    {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_rule_id: input.ruleId,
        p_limit: input.limit ?? 20,
      },
    },
  );

  if (
    typeof raw.rule_id !== "string" ||
    typeof raw.kind !== "string" ||
    !KIND_SET.has(raw.kind as ProjectAutomationKind) ||
    typeof raw.candidate_count !== "number" ||
    !Array.isArray(raw.sample) ||
    typeof raw.tested_at !== "string"
  ) {
    throw new Error("عاد الخادم بنتيجة اختبار أتمتة غير صالحة.");
  }

  return {
    rule_id: raw.rule_id,
    kind: raw.kind as ProjectAutomationKind,
    enabled: raw.enabled === true,
    candidate_count: raw.candidate_count,
    sample: raw.sample.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    ),
    dry_run: true,
    tested_at: raw.tested_at,
  };
}

export async function retryProjectAutomationRun(input: {
  projectId: string;
  runId: string;
}): Promise<boolean> {
  if (!isSupabaseBackend()) {
    throw new Error("إعادة المحاولة تتطلب Supabase.");
  }

  return supabaseRest<boolean>("rpc/retry_project_automation_run", {
    method: "POST",
    body: {
      p_project_id: input.projectId,
      p_run_id: input.runId,
    },
  });
}
