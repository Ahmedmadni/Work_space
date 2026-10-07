export type NotificationKind =
  | "mention"
  | "reply"
  | "project_added"
  | "role_changed"
  | "project_removed"
  | "task_assigned"
  | "task_status"
  | "task_due"
  | "risk_escalation"
  | "strategy_schedule"
  | "executive_action";

export type NotificationFilter =
  | "all"
  | "unread"
  | "mentions"
  | "tasks"
  | "risks"
  | "strategy"
  | "executive";

export interface UserNotification {
  id: string;
  project_id: string;
  project_name: string;
  kind: NotificationKind;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string;
  comment_id: string | null;
  board_id: string | null;
  board_name: string | null;
  document_id: string | null;
  document_name: string | null;
  page_number: number | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
