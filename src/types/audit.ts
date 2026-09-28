export type ProjectAuditSource =
  | "app"
  | "automation"
  | "system"
  | "auth";

export type ProjectAuditCategory =
  | "access"
  | "automation"
  | "execution"
  | "content"
  | "project";

export type ProjectAuditActorKind =
  | "human"
  | "automation"
  | "system";

export interface ProjectAuditEvent {
  id: string;
  project_id: string;
  sequence: number;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string;
  actor_kind: ProjectAuditActorKind;
  source: ProjectAuditSource;
  category: ProjectAuditCategory;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  transaction_id: number;
  occurred_at: string;
}

export interface ProjectAuditFilters {
  source?: ProjectAuditSource | null;
  category?: ProjectAuditCategory | null;
  actorUserId?: string | null;
  entityType?: string | null;
  search?: string;
  since?: string | null;
  before?: string | null;
  limit?: number;
}

export interface ProjectAuditSummary {
  events_7d: number;
  events_today: number;
  human_7d: number;
  automation_7d: number;
  access_7d: number;
  execution_7d: number;
  automation_failures_7d: number;
  last_event_at: string | null;
  last_sequence: number;
}

export interface ProjectAuditVerification {
  ok: boolean;
  checked: number;
  failed_sequence?: number;
  reason?: string;
  last_hash?: string | null;
}
