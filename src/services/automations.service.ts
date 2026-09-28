import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import type {
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
