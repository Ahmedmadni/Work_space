import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ProjectAuditActorKind,
  ProjectAuditCategory,
  ProjectAuditEvent,
  ProjectAuditFilters,
  ProjectAuditSource,
  ProjectAuditSummary,
  ProjectAuditVerification,
} from "@/types/audit";

const SOURCES = new Set<ProjectAuditSource>([
  "app",
  "automation",
  "system",
  "auth",
]);

const CATEGORIES = new Set<ProjectAuditCategory>([
  "access",
  "automation",
  "execution",
  "content",
  "project",
]);

const ACTOR_KINDS = new Set<ProjectAuditActorKind>([
  "human",
  "automation",
  "system",
]);

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEvent(
  row: Record<string, unknown>,
): ProjectAuditEvent | null {
  if (
    typeof row.id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.sequence !== "number" ||
    typeof row.actor_kind !== "string" ||
    !ACTOR_KINDS.has(row.actor_kind as ProjectAuditActorKind) ||
    typeof row.source !== "string" ||
    !SOURCES.has(row.source as ProjectAuditSource) ||
    typeof row.category !== "string" ||
    !CATEGORIES.has(row.category as ProjectAuditCategory) ||
    typeof row.action !== "string" ||
    typeof row.entity_type !== "string" ||
    typeof row.occurred_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    project_id: row.project_id,
    sequence: row.sequence,
    actor_user_id:
      typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actor_name:
      typeof row.actor_name === "string" ? row.actor_name : "النظام",
    actor_email:
      typeof row.actor_email === "string" ? row.actor_email : "",
    actor_kind: row.actor_kind as ProjectAuditActorKind,
    source: row.source as ProjectAuditSource,
    category: row.category as ProjectAuditCategory,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: typeof row.entity_id === "string" ? row.entity_id : null,
    before_state: objectOrNull(row.before_state),
    after_state: objectOrNull(row.after_state),
    metadata: objectOrNull(row.metadata) ?? {},
    transaction_id:
      typeof row.transaction_id === "number" ? row.transaction_id : 0,
    occurred_at: row.occurred_at,
  };
}

export function auditGovernanceAvailable() {
  return isSupabaseBackend();
}

export async function listProjectAuditEvents(
  projectId: string,
  filters: ProjectAuditFilters = {},
): Promise<ProjectAuditEvent[]> {
  if (!isSupabaseBackend()) return [];

  const rows = await supabaseRest<Record<string, unknown>[]>(
    "rpc/list_project_audit_events",
    {
      method: "POST",
      body: {
        p_project_id: projectId,
        p_source: filters.source ?? null,
        p_category: filters.category ?? null,
        p_actor_user_id: filters.actorUserId ?? null,
        p_entity_type: filters.entityType ?? null,
        p_search: filters.search?.trim() || null,
        p_since: filters.since ?? null,
        p_before: filters.before ?? null,
        p_limit: filters.limit ?? 100,
      },
    },
  );

  return rows.flatMap((row) => {
    const normalized = normalizeEvent(row);
    return normalized ? [normalized] : [];
  });
}

export async function getProjectAuditSummary(
  projectId: string,
): Promise<ProjectAuditSummary> {
  if (!isSupabaseBackend()) {
    return {
      events_7d: 0,
      events_today: 0,
      human_7d: 0,
      automation_7d: 0,
      access_7d: 0,
      execution_7d: 0,
      automation_failures_7d: 0,
      last_event_at: null,
      last_sequence: 0,
    };
  }

  const raw = await supabaseRest<Record<string, unknown>>(
    "rpc/get_project_audit_summary",
    {
      method: "POST",
      body: { p_project_id: projectId },
    },
  );

  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return {
    events_7d: number(raw.events_7d),
    events_today: number(raw.events_today),
    human_7d: number(raw.human_7d),
    automation_7d: number(raw.automation_7d),
    access_7d: number(raw.access_7d),
    execution_7d: number(raw.execution_7d),
    automation_failures_7d: number(raw.automation_failures_7d),
    last_event_at:
      typeof raw.last_event_at === "string" ? raw.last_event_at : null,
    last_sequence: number(raw.last_sequence),
  };
}

export async function verifyProjectAuditChain(
  projectId: string,
): Promise<ProjectAuditVerification> {
  if (!isSupabaseBackend()) {
    return { ok: true, checked: 0, last_hash: null };
  }

  const raw = await supabaseRest<Record<string, unknown>>(
    "rpc/verify_project_audit_chain",
    {
      method: "POST",
      body: { p_project_id: projectId },
    },
  );

  return {
    ok: raw.ok === true,
    checked:
      typeof raw.checked === "number" && Number.isFinite(raw.checked)
        ? raw.checked
        : 0,
    ...(typeof raw.failed_sequence === "number"
      ? { failed_sequence: raw.failed_sequence }
      : {}),
    ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
    last_hash:
      typeof raw.last_hash === "string" ? raw.last_hash : null,
  };
}
