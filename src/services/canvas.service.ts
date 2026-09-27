import type {
  BoardCanvasSnapshot,
  CanvasEdge,
  CanvasColor,
  CanvasNode,
  CanvasNodeKind,
  CanvasNodeStatus,
  CanvasPriority,
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

function normalizeNode(value: unknown, boardId: string): CanvasNode | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CanvasNode>;
  if (typeof raw.id !== "string") return null;
  const now = new Date().toISOString();
  const kind = normalizeNodeKind(raw.kind);
  return {
    id: raw.id,
    board_id: boardId,
    kind,
    x: safeNumber(raw.x, 0),
    y: safeNumber(raw.y, 0),
    width: Math.max(140, safeNumber(raw.width, 220)),
    height: Math.max(72, safeNumber(raw.height, 110)),
    title: typeof raw.title === "string" ? raw.title : "فكرة جديدة",
    description: typeof raw.description === "string" ? raw.description : null,
    status: normalizeNodeStatus(raw.status, kind),
    priority: normalizePriority(raw.priority),
    progress: Math.min(100, Math.max(0, safeNumber(raw.progress, raw.status === "done" ? 100 : 0))),
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
      ? { width: 180, height: 100 }
      : kind === "sticky" || kind === "note"
        ? { width: 210, height: 170 }
        : kind === "text"
          ? { width: 260, height: 80 }
          : kind === "image"
            ? { width: 320, height: 220 }
            : kind === "rectangle" || kind === "ellipse"
              ? { width: 220, height: 140 }
            : { width: 220, height: 110 };
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
