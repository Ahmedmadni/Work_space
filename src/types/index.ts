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

export type CanvasNodeKind =
  | "idea"
  | "task"
  | "milestone"
  | "note"
  | "sticky"
  | "text"
  | "rectangle"
  | "ellipse"
  | "image";
export type CanvasEdgeKind = "relationship" | "dependency";
export type CanvasStrokeTool = "pen" | "highlighter";
export type CanvasColor = "ink" | "brand" | "warning" | "info" | "danger" | "success";
export type CanvasTextAlign = "start" | "center" | "end";

export interface CanvasNodeStyle {
  fill: CanvasColor | "transparent";
  stroke: CanvasColor;
  font_size: number;
  text_align: CanvasTextAlign;
}

export interface CanvasPoint {
  x: number;
  y: number;
  /** Pointer Events pressure: 0..1. Mouse input falls back to 0.5. */
  pressure: number;
}

export interface CanvasStroke {
  id: string;
  board_id: string;
  tool: CanvasStrokeTool;
  points: CanvasPoint[];
  size: number;
  color: CanvasColor;
  created_at: string;
  updated_at: string;
}

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
  /** الحالة قبل الأرشفة، تُستعاد عند الاستعادة */
  previous_status?: Exclude<ProjectStatus, "archived"> | null | undefined;
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

/** عقدة مستقلة داخل مساحة اللوحة. تبقى كيانًا منفصلًا لتسهيل البحث والصلاحيات لاحقًا. */
export interface CanvasNode {
  id: string;
  board_id: string;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  description: string | null;
  /** مرجع ملف الصورة في مخزن الأصول المحلي/Storage المستقبلي. */
  asset_id: string | null;
  style: CanvasNodeStyle;
  created_at: string;
  updated_at: string;
}

/** علاقة بين عقدتين داخل نفس اللوحة. */
export interface CanvasEdge {
  id: string;
  board_id: string;
  source_node_id: string;
  target_node_id: string;
  kind: CanvasEdgeKind;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardCanvasSnapshot {
  board_id: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
  viewport: CanvasViewport;
  updated_at: string | null;
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
  /** حقل توافق قديم؛ المشاريع الجديدة تُنشأ داخل حاوية نظام مخفية إذا لم يُرسل. */
  workspace_id?: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  icon: string;
  color: AccentColor;
}

export interface CreateBoardInput {
  /** للتوافق مع البيانات القديمة؛ تُشتق من المشروع إذا لم تُرسل. */
  workspace_id?: string;
  project_id: string;
  name: string;
  description?: string;
  board_type: BoardType;
}
