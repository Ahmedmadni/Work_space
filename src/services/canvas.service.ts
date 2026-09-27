import type {
  BoardCanvasSnapshot,
  CanvasEdge,
  CanvasColor,
  CanvasNode,
  CanvasNodeKind,
  CanvasNodeStatus,
  CanvasPriority,
  CanvasNodeSearchFilters,
  CanvasNodeSearchMatch,
  ProjectExecutionItem,
  ProjectExecutionSummary,
  CanvasNodeStyle,
  CanvasStroke,
  CanvasViewport,
} from "@/types";

const STORAGE_KEY = "projectflow.canvas.v1";
const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };

interface CanvasStore {
  version: 1;
  boards: Record<string, BoardCanvasSnapshot>;
}

function emptyStore(): CanvasStore {
  return { version: 1, boards: {} };
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}


const CANVAS_COLORS: CanvasColor[] = ["ink", "brand", "warning", "info", "danger", "success"];

function normalizeColor(value: unknown, fallback: CanvasColor): CanvasColor {
  return typeof value === "string" && CANVAS_COLORS.includes(value as CanvasColor)
    ? (value as CanvasColor)
    : fallback;
}

function normalizeNodeKind(value: unknown): CanvasNodeKind {
  return value === "task" ||
    value === "milestone" ||
    value === "note" ||
    value === "sticky" ||
    value === "text" ||
    value === "rectangle" ||
    value === "ellipse" ||
    value === "image"
    ? value
    : "idea";
}

function defaultNodeStyle(kind: CanvasNodeKind): CanvasNodeStyle {
  if (kind === "text") {
    return { fill: "transparent", stroke: "ink", font_size: 22, text_align: "start" };
  }
  if (kind === "sticky" || kind === "note") {
    return { fill: "warning", stroke: "warning", font_size: 16, text_align: "start" };
  }
  if (kind === "rectangle" || kind === "ellipse" || kind === "image") {
    return { fill: "transparent", stroke: "brand", font_size: 16, text_align: "center" };
  }
  return { fill: "transparent", stroke: "brand", font_size: 16, text_align: "start" };
}

function normalizeNodeStyle(value: unknown, kind: CanvasNodeKind): CanvasNodeStyle {
  const defaults = defaultNodeStyle(kind);
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<CanvasNodeStyle>;
  const fill =
    raw.fill === "transparent"
      ? "transparent"
      : normalizeColor(raw.fill, defaults.fill === "transparent" ? "brand" : defaults.fill);
  const textAlign =
    raw.text_align === "center" || raw.text_align === "end" || raw.text_align === "start"
      ? raw.text_align
      : defaults.text_align;
  return {
    fill,
    stroke: normalizeColor(raw.stroke, defaults.stroke),
    font_size: Math.min(48, Math.max(10, safeNumber(raw.font_size, defaults.font_size))),
    text_align: textAlign,
  };
}


function normalizeNodeStatus(value: unknown, kind: CanvasNodeKind): CanvasNodeStatus {
  if (
    value === "idea" ||
    value === "planned" ||
    value === "in_progress" ||
    value === "done" ||
    value === "blocked"
  ) {
    return value;
  }
  return kind === "task" || kind === "milestone" ? "planned" : "idea";
}

function normalizePriority(value: unknown): CanvasPriority | null {
  return value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
    ? value
    : null;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    unique.add(tag.slice(0, 40));
    if (unique.size >= 12) break;
  }
  return [...unique];
}

function normalizeLocalDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function normalizeNode(value: unknown, boardId: string): CanvasNode | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CanvasNode>;
  if (typeof raw.id !== "string") return null;
  const now = new Date().toISOString();
  const kind = normalizeNodeKind(raw.kind);
  const minHeight =
    kind === "sticky" || kind === "note"
      ? 170
      : kind === "idea" || kind === "task"
        ? 140
        : kind === "milestone"
          ? 130
          : 72;
  return {
    id: raw.id,
    board_id: boardId,
    kind,
    x: safeNumber(raw.x, 0),
    y: safeNumber(raw.y, 0),
    width: Math.max(140, safeNumber(raw.width, 220)),
    height: Math.max(minHeight, safeNumber(raw.height, minHeight)),
    title: typeof raw.title === "string" ? raw.title : "فكرة جديدة",
    description: typeof raw.description === "string" ? raw.description : null,
    status: normalizeNodeStatus(raw.status, kind),
    priority: normalizePriority(raw.priority),
    progress: Math.min(100, Math.max(0, safeNumber(raw.progress, raw.status === "done" ? 100 : 0))),
    start_date: normalizeLocalDate(raw.start_date),
    due_date: normalizeLocalDate(raw.due_date),
    owner: typeof raw.owner === "string" && raw.owner.trim() ? raw.owner.trim().slice(0, 80) : null,
    tags: normalizeTags(raw.tags),
    asset_id: typeof raw.asset_id === "string" ? raw.asset_id : null,
    style: normalizeNodeStyle(raw.style, kind),
    created_at: typeof raw.created_at === "string" ? raw.created_at : now,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : now,
  };
}

function normalizeEdge(value: unknown, boardId: string, nodeIds: Set<string>): CanvasEdge | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CanvasEdge>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.source_node_id !== "string" ||
    typeof raw.target_node_id !== "string" ||
    !nodeIds.has(raw.source_node_id) ||
    !nodeIds.has(raw.target_node_id)
  ) return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    board_id: boardId,
    source_node_id: raw.source_node_id,
    target_node_id: raw.target_node_id,
    kind: raw.kind === "dependency" ? "dependency" : "relationship",
    label: typeof raw.label === "string" ? raw.label : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : now,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : now,
  };
}


function normalizeStroke(value: unknown, boardId: string): CanvasStroke | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CanvasStroke>;
  if (typeof raw.id !== "string" || !Array.isArray(raw.points)) return null;
  const points = raw.points.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const p = point as { x?: unknown; y?: unknown; pressure?: unknown };
    if (typeof p.x !== "number" || typeof p.y !== "number") return [];
    return [{
      x: p.x,
      y: p.y,
      pressure:
        typeof p.pressure === "number" && Number.isFinite(p.pressure)
          ? Math.min(1, Math.max(0, p.pressure))
          : 0.5,
    }];
  });
  if (!points.length) return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    board_id: boardId,
    tool: raw.tool === "highlighter" ? "highlighter" : "pen",
    points,
    size: Math.min(48, Math.max(1, safeNumber(raw.size, raw.tool === "highlighter" ? 18 : 3))),
    color: normalizeColor(raw.color, raw.tool === "highlighter" ? "warning" : "ink"),
    created_at: typeof raw.created_at === "string" ? raw.created_at : now,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : now,
  };
}

function normalizeSnapshot(boardId: string, value: unknown): BoardCanvasSnapshot {
  if (!value || typeof value !== "object") {
    return { board_id: boardId, nodes: [], edges: [], strokes: [], viewport: DEFAULT_VIEWPORT, updated_at: null };
  }
  const raw = value as Partial<BoardCanvasSnapshot>;
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((n) => normalizeNode(n, boardId)).filter((n): n is CanvasNode => !!n)
    : [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = Array.isArray(raw.edges)
    ? raw.edges.map((e) => normalizeEdge(e, boardId, nodeIds)).filter((e): e is CanvasEdge => !!e)
    : [];
  const strokes = Array.isArray(raw.strokes)
    ? raw.strokes.map((stroke) => normalizeStroke(stroke, boardId)).filter((stroke): stroke is CanvasStroke => !!stroke)
    : [];
  const viewportRaw = raw.viewport && typeof raw.viewport === "object" ? raw.viewport : DEFAULT_VIEWPORT;
  return {
    board_id: boardId,
    nodes,
    edges,
    strokes,
    viewport: {
      x: safeNumber((viewportRaw as CanvasViewport).x, 0),
      y: safeNumber((viewportRaw as CanvasViewport).y, 0),
      zoom: Math.min(2.5, Math.max(0.25, safeNumber((viewportRaw as CanvasViewport).zoom, 1))),
    },
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

function readStore(): CanvasStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<CanvasStore>;
    if (!parsed || typeof parsed !== "object" || !parsed.boards || typeof parsed.boards !== "object") {
      return emptyStore();
    }
    const boards: Record<string, BoardCanvasSnapshot> = {};
    for (const [boardId, snapshot] of Object.entries(parsed.boards)) {
      boards[boardId] = normalizeSnapshot(boardId, snapshot);
    }
    return { version: 1, boards };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: CanvasStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[canvas] تعذر حفظ بيانات اللوحة.", error);
    throw error;
  }
}



function isSemanticKind(kind: CanvasNodeKind) {
  return kind === "idea" || kind === "task" || kind === "milestone" || kind === "note" || kind === "sticky";
}

function nodeMatchesFilters(node: CanvasNode, filters: CanvasNodeSearchFilters): boolean {
  const query = filters.query?.trim().toLocaleLowerCase("ar") ?? "";
  if (query) {
    const haystack = [
      node.title,
      node.description ?? "",
      node.owner ?? "",
      node.tags.join(" "),
    ]
      .join(" ")
      .toLocaleLowerCase("ar");
    if (!haystack.includes(query)) return false;
  }
  if (filters.status && (!isSemanticKind(node.kind) || node.status !== filters.status)) return false;
  if (filters.priority && (!isSemanticKind(node.kind) || node.priority !== filters.priority)) return false;
  if (filters.owner && node.owner !== filters.owner) return false;
  if (filters.tag && !node.tags.includes(filters.tag)) return false;
  return true;
}


function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDaysKey(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function executionPriorityRank(priority: CanvasPriority | null) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  if (priority === "low") return 3;
  return 4;
}

export async function getProjectExecutionSummary(
  boardIds: string[],
): Promise<ProjectExecutionSummary> {
  const store = readStore();
  const today = localDateKey();
  const upcomingEnd = addLocalDaysKey(7);
  const items: ProjectExecutionItem[] = [];

  for (const boardId of boardIds) {
    const snapshot = normalizeSnapshot(boardId, store.boards[boardId]);
    const semanticNodes = snapshot.nodes.filter((node) => isSemanticKind(node.kind));
    const nodeMap = new Map(semanticNodes.map((node) => [node.id, node] as const));

    for (const node of semanticNodes) {
      const dependencies = snapshot.edges
        .filter(
          (edge) =>
            edge.kind === "dependency" &&
            edge.source_node_id === node.id &&
            nodeMap.has(edge.target_node_id),
        )
        .flatMap((edge) => {
          const target = nodeMap.get(edge.target_node_id);
          return target ? [target] : [];
        });

      const dependencyDone = dependencies.filter((target) => target.status === "done").length;
      const active = node.status !== "done";
      const waitingOn = dependencies
        .filter((target) => target.status !== "done")
        .map((target) => ({ id: target.id, title: target.title }));

      items.push({
        board_id: boardId,
        node,
        dependency_total: dependencies.length,
        dependency_done: dependencyDone,
        waiting_on: waitingOn,
        is_overdue: !!node.due_date && node.due_date < today && active,
        is_upcoming:
          !!node.due_date &&
          node.due_date >= today &&
          node.due_date <= upcomingEnd &&
          active,
        is_critical: node.priority === "critical" && active,
        is_unassigned: !node.owner && active,
        dependency_ready:
          dependencies.length > 0 &&
          dependencyDone === dependencies.length &&
          active &&
          node.status !== "blocked",
        waiting_on_dependencies: waitingOn.length > 0 && active,
      });
    }
  }

  items.sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    const priorityDiff =
      executionPriorityRank(a.node.priority) - executionPriorityRank(b.node.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const dueA = a.node.due_date ?? "9999-12-31";
    const dueB = b.node.due_date ?? "9999-12-31";
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    return b.node.updated_at.localeCompare(a.node.updated_at);
  });

  const total = items.length;
  const completed = items.filter((item) => item.node.status === "done").length;
  const progressTotal = items.reduce((sum, item) => sum + item.node.progress, 0);

  return {
    total,
    completed,
    in_progress: items.filter((item) => item.node.status === "in_progress").length,
    blocked: items.filter((item) => item.node.status === "blocked").length,
    overdue: items.filter((item) => item.is_overdue).length,
    upcoming: items.filter((item) => item.is_upcoming).length,
    critical: items.filter((item) => item.is_critical).length,
    unassigned: items.filter((item) => item.is_unassigned).length,
    dependency_ready: items.filter((item) => item.dependency_ready).length,
    waiting_on_dependencies: items.filter((item) => item.waiting_on_dependencies).length,
    average_progress: total ? Math.round(progressTotal / total) : 0,
    items,
  };
}

export async function searchCanvasNodes(
  boardIds: string[],
  filters: CanvasNodeSearchFilters,
): Promise<CanvasNodeSearchMatch[]> {
  if (!boardIds.length) return [];
  const store = readStore();
  const results: CanvasNodeSearchMatch[] = [];

  for (const boardId of boardIds) {
    const snapshot = normalizeSnapshot(boardId, store.boards[boardId]);
    for (const node of snapshot.nodes) {
      if (!nodeMatchesFilters(node, filters)) continue;
      results.push({ board_id: boardId, node });
    }
  }

  return results.sort((a, b) => b.node.updated_at.localeCompare(a.node.updated_at));
}

export async function getBoardCanvas(boardId: string): Promise<BoardCanvasSnapshot> {
  const store = readStore();
  return normalizeSnapshot(boardId, store.boards[boardId]);
}

export async function saveBoardCanvas(snapshot: BoardCanvasSnapshot): Promise<BoardCanvasSnapshot> {
  const store = readStore();
  const normalized = normalizeSnapshot(snapshot.board_id, {
    ...snapshot,
    updated_at: new Date().toISOString(),
  });
  store.boards[snapshot.board_id] = normalized;
  writeStore(store);
  return normalized;
}

export function createCanvasNode(
  boardId: string,
  position: { x: number; y: number },
  kind: CanvasNode["kind"] = "idea",
): CanvasNode {
  const now = new Date().toISOString();
  const size =
    kind === "milestone"
      ? { width: 180, height: 130 }
      : kind === "sticky" || kind === "note"
        ? { width: 210, height: 180 }
        : kind === "text"
          ? { width: 260, height: 80 }
          : kind === "image"
            ? { width: 320, height: 220 }
            : kind === "rectangle" || kind === "ellipse"
              ? { width: 220, height: 140 }
            : { width: 220, height: kind === "idea" || kind === "task" ? 140 : 110 };
  const title =
    kind === "task"
      ? "مهمة جديدة"
      : kind === "milestone"
        ? "معلم رئيسي"
        : kind === "sticky" || kind === "note"
          ? "ملاحظة"
          : kind === "text"
            ? "اكتب نصًا"
            : kind === "image"
              ? "صورة"
              : kind === "rectangle"
                ? "مستطيل"
                : kind === "ellipse"
                  ? "شكل بيضاوي"
                  : "فكرة جديدة";
  return {
    id: `node-${crypto.randomUUID()}`,
    board_id: boardId,
    kind,
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    title,
    description: null,
    status: kind === "task" || kind === "milestone" ? "planned" : "idea",
    priority: null,
    progress: 0,
    start_date: null,
    due_date: null,
    owner: null,
    tags: [],
    asset_id: null,
    style: defaultNodeStyle(kind),
    created_at: now,
    updated_at: now,
  };
}

export function createCanvasEdge(
  boardId: string,
  sourceNodeId: string,
  targetNodeId: string,
): CanvasEdge {
  const now = new Date().toISOString();
  return {
    id: `edge-${crypto.randomUUID()}`,
    board_id: boardId,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    kind: "relationship",
    label: null,
    created_at: now,
    updated_at: now,
  };
}


/** تنظيف بيانات لوحة بعد حذفها نهائيًا. */
export function deleteBoardCanvas(boardId: string): void {
  const store = readStore();
  if (!(boardId in store.boards)) return;
  delete store.boards[boardId];
  writeStore(store);
}

/** تنظيف بيانات عدة لوحات عند حذف مشروع أو مساحة نهائيًا. */
export function deleteManyBoardCanvases(boardIds: string[]): void {
  if (!boardIds.length) return;
  const store = readStore();
  let changed = false;
  for (const boardId of boardIds) {
    if (boardId in store.boards) {
      delete store.boards[boardId];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}
