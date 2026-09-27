export type CollaborationTargetType =
  | "project"
  | "board"
  | "node"
  | "document";

export type PresenceContextType = "project" | "board" | "document";

export interface ProjectCommentMention {
  user_id: string;
  full_name: string;
  email: string;
}

export interface ProjectComment {
  id: string;
  project_id: string;
  board_id: string | null;
  target_type: CollaborationTargetType;
  target_id: string | null;
  page_number: number | null;
  parent_comment_id: string | null;
  body: string;
  created_by: string;
  author_name: string;
  author_email: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  mentions: ProjectCommentMention[];
}

export interface ProjectCommentFilters {
  boardId?: string | null;
  targetType?: CollaborationTargetType | null;
  targetId?: string | null;
  limit?: number;
}

export interface CreateProjectCommentInput {
  projectId: string;
  body: string;
  boardId?: string | null;
  originBoardId?: string | null;
  targetType?: CollaborationTargetType;
  targetId?: string | null;
  pageNumber?: number | null;
  parentCommentId?: string | null;
  mentionUserIds?: string[];
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProjectPresence {
  user_id: string;
  full_name: string;
  email: string;
  context_type: PresenceContextType;
  context_id: string | null;
  last_seen_at: string;
}

export interface RecordProjectActivityInput {
  projectId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}
