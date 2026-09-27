import { isSupabaseBackend } from "@/lib/backend-config";
import { getStoredRemoteSession } from "@/services/auth.service";
import { CURRENT_USER } from "@/services/local-db";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  CollaborationTargetType,
  CreateProjectCommentInput,
  PresenceContextType,
  ProjectActivity,
  ProjectComment,
  ProjectCommentFilters,
  ProjectCommentMention,
  ProjectPresence,
  RecordProjectActivityInput,
} from "@/types/live-collaboration";

const STORAGE_KEY = "projectflow.live-collaboration.v1";
const PRESENCE_KEY = "projectflow.live-presence.v1";

interface LocalProjectCollaboration {
  comments: ProjectComment[];
  activity: ProjectActivity[];
}

interface LocalCollaborationStore {
  version: 1;
  projects: Record<string, LocalProjectCollaboration>;
}

interface LocalPresenceRecord extends ProjectPresence {
  project_id: string;
  session_id: string;
}

interface LocalPresenceStore {
  version: 1;
  records: LocalPresenceRecord[];
}

function emptyStore(): LocalCollaborationStore {
  return { version: 1, projects: {} };
}

function emptyPresenceStore(): LocalPresenceStore {
  return { version: 1, records: [] };
}

function readStore(): LocalCollaborationStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<LocalCollaborationStore>;
    if (!parsed.projects || typeof parsed.projects !== "object") return emptyStore();
    return { version: 1, projects: parsed.projects };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: LocalCollaborationStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function projectBucket(store: LocalCollaborationStore, projectId: string) {
  store.projects[projectId] ??= { comments: [], activity: [] };
  return store.projects[projectId]!;
}

function readPresenceStore(): LocalPresenceStore {
  if (typeof window === "undefined") return emptyPresenceStore();
  try {
    const raw = window.localStorage.getItem(PRESENCE_KEY);
    if (!raw) return emptyPresenceStore();
    const parsed = JSON.parse(raw) as Partial<LocalPresenceStore>;
    return Array.isArray(parsed.records)
      ? { version: 1, records: parsed.records }
      : emptyPresenceStore();
  } catch {
    return emptyPresenceStore();
  }
}

function writePresenceStore(store: LocalPresenceStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESENCE_KEY, JSON.stringify(store));
}

function currentLocalMention(userId: string): ProjectCommentMention {
  return {
    user_id: userId,
    full_name: userId === CURRENT_USER.id ? CURRENT_USER.full_name : "عضو",
    email: userId === CURRENT_USER.id ? CURRENT_USER.email : "",
  };
}

function normalizeMentions(value: unknown): ProjectCommentMention[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<ProjectCommentMention>;
    if (typeof raw.user_id !== "string") return [];
    return [{
      user_id: raw.user_id,
      full_name:
        typeof raw.full_name === "string" && raw.full_name.trim()
          ? raw.full_name
          : "عضو",
      email: typeof raw.email === "string" ? raw.email : "",
    }];
  });
}

function mapRemoteComment(row: Record<string, unknown>): ProjectComment {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    board_id: typeof row.board_id === "string" ? row.board_id : null,
    target_type: (
      row.target_type === "board" ||
      row.target_type === "node" ||
      row.target_type === "document"
        ? row.target_type
        : "project"
    ) as CollaborationTargetType,
    target_id: typeof row.target_id === "string" ? row.target_id : null,
    page_number: typeof row.page_number === "number" ? row.page_number : null,
    parent_comment_id:
      typeof row.parent_comment_id === "string" ? row.parent_comment_id : null,
    body: typeof row.body === "string" ? row.body : "",
    created_by: String(row.created_by),
    author_name:
      typeof row.author_name === "string" && row.author_name.trim()
        ? row.author_name
        : "مستخدم",
    author_email: typeof row.author_email === "string" ? row.author_email : "",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
    resolved_by: typeof row.resolved_by === "string" ? row.resolved_by : null,
    mentions: normalizeMentions(row.mentions),
  };
}

function addLocalActivity(
  projectId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const store = readStore();
  const bucket = projectBucket(store, projectId);
  bucket.activity.unshift({
    id: crypto.randomUUID(),
    project_id: projectId,
    actor_user_id: CURRENT_USER.id,
    actor_name: CURRENT_USER.full_name,
    actor_email: CURRENT_USER.email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    created_at: new Date().toISOString(),
  });
  bucket.activity = bucket.activity.slice(0, 300);
  writeStore(store);
}

export async function listProjectComments(
  projectId: string,
  filters: ProjectCommentFilters = {},
): Promise<ProjectComment[]> {
  if (isSupabaseBackend()) {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      "rpc/list_project_comments",
      {
        method: "POST",
        body: {
          p_project_id: projectId,
          p_board_id: filters.boardId ?? null,
          p_target_type: filters.targetType ?? null,
          p_target_id: filters.targetId ?? null,
          p_limit: filters.limit ?? 100,
        },
      },
    );
    return rows.map(mapRemoteComment);
  }

  const store = readStore();
  let comments = [...(store.projects[projectId]?.comments ?? [])];
  if (filters.boardId) comments = comments.filter((c) => c.board_id === filters.boardId);
  if (filters.targetType) {
    comments = comments.filter((c) => c.target_type === filters.targetType);
  }
  if (filters.targetId) comments = comments.filter((c) => c.target_id === filters.targetId);
  return comments
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, filters.limit ?? 100);
}

export async function createProjectComment(
  input: CreateProjectCommentInput,
): Promise<string> {
  const body = input.body.trim();
  if (!body || body.length > 4000) throw new Error("التعليق يجب أن يكون بين 1 و4000 حرف.");

  if (isSupabaseBackend()) {
    return supabaseRest<string>("rpc/create_project_comment", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_body: body,
        p_board_id: input.boardId ?? null,
        p_target_type: input.targetType ?? "project",
        p_target_id: input.targetId ?? null,
        p_page_number: input.pageNumber ?? null,
        p_parent_comment_id: input.parentCommentId ?? null,
        p_mention_user_ids: input.mentionUserIds ?? [],
        p_origin_board_id: input.originBoardId ?? input.boardId ?? null,
      },
    });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const targetType = input.targetType ?? "project";
  const targetId = input.targetId ?? null;
  const store = readStore();
  const bucket = projectBucket(store, input.projectId);
  bucket.comments.unshift({
    id,
    project_id: input.projectId,
    board_id: input.boardId ?? null,
    target_type: targetType,
    target_id: targetId,
    page_number: input.pageNumber ?? null,
    parent_comment_id: input.parentCommentId ?? null,
    body,
    created_by: CURRENT_USER.id,
    author_name: CURRENT_USER.full_name,
    author_email: CURRENT_USER.email,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    resolved_by: null,
    mentions: (input.mentionUserIds ?? []).map(currentLocalMention),
  });
  writeStore(store);
  addLocalActivity(
    input.projectId,
    "comment_created",
    targetType,
    targetId ?? input.projectId,
    { comment_id: id, board_id: input.boardId ?? null },
  );
  return id;
}

export async function updateProjectComment(input: {
  projectId: string;
  commentId: string;
  body: string;
  mentionUserIds?: string[];
}): Promise<void> {
  const body = input.body.trim();
  if (!body || body.length > 4000) throw new Error("التعليق يجب أن يكون بين 1 و4000 حرف.");

  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/update_project_comment", {
      method: "POST",
      body: {
        p_comment_id: input.commentId,
        p_body: body,
        p_mention_user_ids: input.mentionUserIds ?? [],
      },
    });
    return;
  }

  const store = readStore();
  const bucket = projectBucket(store, input.projectId);
  const comment = bucket.comments.find((item) => item.id === input.commentId);
  if (!comment) return;
  comment.body = body;
  comment.updated_at = new Date().toISOString();
  comment.mentions = (input.mentionUserIds ?? []).map(currentLocalMention);
  writeStore(store);
  addLocalActivity(input.projectId, "comment_updated", "comment", input.commentId);
}

export async function setProjectCommentResolved(input: {
  projectId: string;
  commentId: string;
  resolved: boolean;
}): Promise<void> {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/set_project_comment_resolved", {
      method: "POST",
      body: {
        p_comment_id: input.commentId,
        p_resolved: input.resolved,
      },
    });
    return;
  }

  const store = readStore();
  const bucket = projectBucket(store, input.projectId);
  const comment = bucket.comments.find((item) => item.id === input.commentId);
  if (!comment) return;
  comment.resolved_at = input.resolved ? new Date().toISOString() : null;
  comment.resolved_by = input.resolved ? CURRENT_USER.id : null;
  comment.updated_at = new Date().toISOString();
  writeStore(store);
  addLocalActivity(
    input.projectId,
    input.resolved ? "comment_resolved" : "comment_reopened",
    "comment",
    input.commentId,
  );
}

export async function deleteProjectComment(input: {
  projectId: string;
  commentId: string;
}): Promise<void> {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/delete_project_comment", {
      method: "POST",
      body: { p_comment_id: input.commentId },
    });
    return;
  }

  const store = readStore();
  const bucket = projectBucket(store, input.projectId);
  bucket.comments = bucket.comments.filter((item) => item.id !== input.commentId);
  writeStore(store);
  addLocalActivity(input.projectId, "comment_deleted", "comment", input.commentId);
}

export async function listProjectActivity(
  projectId: string,
  limit = 80,
): Promise<ProjectActivity[]> {
  if (isSupabaseBackend()) {
    return supabaseRest<ProjectActivity[]>("rpc/list_project_activity", {
      method: "POST",
      body: { p_project_id: projectId, p_limit: limit },
    });
  }
  return [...(readStore().projects[projectId]?.activity ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function recordProjectActivity(
  input: RecordProjectActivityInput,
): Promise<void> {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/record_project_activity", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_action: input.action,
        p_entity_type: input.entityType,
        p_entity_id: input.entityId ?? null,
        p_metadata: input.metadata ?? {},
      },
    });
    return;
  }
  addLocalActivity(
    input.projectId,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.metadata ?? {},
  );
}

export async function heartbeatProjectPresence(input: {
  projectId: string;
  sessionId: string;
  contextType: PresenceContextType;
  contextId?: string | null;
}): Promise<void> {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/heartbeat_project_presence", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_session_id: input.sessionId,
        p_context_type: input.contextType,
        p_context_id: input.contextId ?? null,
      },
    });
    return;
  }

  const store = readPresenceStore();
  const now = Date.now();
  store.records = store.records.filter(
    (record) => new Date(record.last_seen_at).getTime() >= now - 180_000,
  );
  const existing = store.records.find(
    (record) =>
      record.project_id === input.projectId &&
      record.user_id === CURRENT_USER.id &&
      record.session_id === input.sessionId,
  );
  const next: LocalPresenceRecord = {
    project_id: input.projectId,
    session_id: input.sessionId,
    user_id: CURRENT_USER.id,
    full_name: CURRENT_USER.full_name,
    email: CURRENT_USER.email,
    context_type: input.contextType,
    context_id: input.contextId ?? null,
    last_seen_at: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, next);
  else store.records.push(next);
  writePresenceStore(store);
}

export async function endProjectPresence(input: {
  projectId: string;
  sessionId: string;
}): Promise<void> {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/end_project_presence", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_session_id: input.sessionId,
      },
    });
    return;
  }
  const store = readPresenceStore();
  store.records = store.records.filter(
    (record) =>
      !(
        record.project_id === input.projectId &&
        record.user_id === CURRENT_USER.id &&
        record.session_id === input.sessionId
      ),
  );
  writePresenceStore(store);
}

export async function listProjectPresence(
  projectId: string,
): Promise<ProjectPresence[]> {
  if (isSupabaseBackend()) {
    return supabaseRest<ProjectPresence[]>("rpc/list_project_presence", {
      method: "POST",
      body: { p_project_id: projectId },
    });
  }

  const now = Date.now();
  const records = readPresenceStore().records
    .filter(
      (record) =>
        record.project_id === projectId &&
        new Date(record.last_seen_at).getTime() >= now - 45_000,
    )
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));

  const byUser = new Map<string, ProjectPresence>();
  for (const record of records) {
    if (!byUser.has(record.user_id)) {
      byUser.set(record.user_id, {
        user_id: record.user_id,
        full_name: record.full_name,
        email: record.email,
        context_type: record.context_type,
        context_id: record.context_id,
        last_seen_at: record.last_seen_at,
      });
    }
  }
  return [...byUser.values()];
}

export function getCurrentCollaborationUserId(): string | null {
  return isSupabaseBackend()
    ? getStoredRemoteSession()?.user.id ?? null
    : CURRENT_USER.id;
}
