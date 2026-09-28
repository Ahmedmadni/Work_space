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
export type CanvasNodeStatus = "idea" | "planned" | "in_progress" | "done" | "blocked";
export type CanvasPriority = "critical" | "high" | "medium" | "low";

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
  /** Server-side optimistic concurrency version. Older backups may omit it. */
  version?: number;
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
  /** Server-side optimistic concurrency version. Older backups may omit it. */
  version?: number;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  description: string | null;
  status: CanvasNodeStatus;
  priority: CanvasPriority | null;
  /** نسبة الإنجاز من 0 إلى 100. */
  progress: number;
  /** تواريخ محلية بصيغة YYYY-MM-DD لعرض Roadmap دون مشاكل مناطق زمنية. */
  start_date: string | null;
  due_date: string | null;
  /** تقدير الجهد بالساعات. null يعني أن المهمة لم تُقدّر بعد. */
  effort_hours: number | null;
  /** اسم العرض للمالك. يبقى متوافقًا مع البيانات القديمة، ويُشتق من المستخدم عند وجود Assignee حقيقي. */
  owner: string | null;
  /** المكلّف الحقيقي من أعضاء المشروع. */
  assignee_user_id: string | null;
  /** اسم عرض المكلّف الحقيقي، إن وجد. */
  assignee_name: string | null;
  /** وسوم نصية قصيرة للبحث والتصفية عبر اللوحات. */
  tags: string[];
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
  /** Server-side optimistic concurrency version. Older backups may omit it. */
  version?: number;
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
  /** Monotonic board revision used to order collaboration events. */
  revision?: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
  viewport: CanvasViewport;
  updated_at: string | null;
}

export type CanvasVersionReason = "auto" | "manual" | "before_restore" | "import";

export interface CanvasBoardVersion {
  id: string;
  board_id: string;
  reason: CanvasVersionReason;
  label: string | null;
  created_at: string;
  node_count: number;
  edge_count: number;
  stroke_count: number;
  snapshot: BoardCanvasSnapshot;
}

export interface CanvasBackupAsset {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  data_url: string;
  created_at: string;
}

export interface CanvasBoardBackup {
  schema: "projectflow.canvas.backup";
  version: 1;
  exported_at: string;
  board_id: string;
  snapshot: BoardCanvasSnapshot;
  assets: CanvasBackupAsset[];
}

export interface CanvasNodeSearchFilters {
  query?: string;
  status?: CanvasNodeStatus | null;
  priority?: CanvasPriority | null;
  owner?: string | null;
  tag?: string | null;
}

export interface CanvasNodeSearchMatch {
  board_id: string;
  node: CanvasNode;
}

export interface ProjectExecutionItem {
  board_id: string;
  node: CanvasNode;
  dependency_total: number;
  dependency_done: number;
  waiting_on: Array<{ id: string; title: string }>;
  is_overdue: boolean;
  is_upcoming: boolean;
  is_critical: boolean;
  is_unassigned: boolean;
  dependency_ready: boolean;
  waiting_on_dependencies: boolean;
}

export interface CanvasNodeWatcher {
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface CanvasNodeAssignment {
  assignee_user_id: string | null;
  assignee_name: string | null;
}

export interface CanvasNodeExecutionUpdate {
  node_id: string;
  version: number;
  status: CanvasNodeStatus;
  priority: CanvasPriority | null;
  progress: number;
  updated_at: string;
  revision?: number;
}

export interface ProjectExecutionSummary {
  total: number;
  completed: number;
  in_progress: number;
  blocked: number;
  overdue: number;
  upcoming: number;
  critical: number;
  unassigned: number;
  dependency_ready: number;
  waiting_on_dependencies: number;
  average_progress: number;
  items: ProjectExecutionItem[];
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
