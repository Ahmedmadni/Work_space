/** الكيانات الأساسية للمشروع. تطابق تصميم الجداول المستقبلي في قاعدة البيانات. */

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";

export type BoardType =
  | "blank"
  | "mind_map"
  | "project_plan"
  | "flowchart"
  | "brainstorm"
  | "roadmap"
  | "system_architecture";

export type AccentColor = "brand" | "amber" | "sky" | "rose" | "violet" | "lime";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  initials: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: AccentColor;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  icon: string;
  color: AccentColor;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Board {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string | null;
  board_type: BoardType;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  is_favorite: boolean;
  /** آخر مرة فُتحت فيها اللوحة (محليًا). */
  last_opened_at: string | null;
}

export interface WorkspaceWithStats extends Workspace {
  projects_count: number;
  boards_count: number;
}

export interface BoardWithContext extends Board {
  project_name: string;
  workspace_name: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  board_type: BoardType;
  color: AccentColor;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  icon: string;
  color: AccentColor;
}

export interface CreateProjectInput {
  workspace_id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  icon: string;
  color: AccentColor;
}

export interface CreateBoardInput {
  workspace_id: string;
  project_id: string;
  name: string;
  description?: string;
  board_type: BoardType;
}
