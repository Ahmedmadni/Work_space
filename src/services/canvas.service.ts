import type {
  BoardCanvasSnapshot,
  CanvasEdge,
  CanvasNode,
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

function normalizeNode(value: unknown, boardId: string): CanvasNode | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CanvasNode>;
  if (typeof raw.id !== "string") return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    board_id: boardId,
    kind: raw.kind === "task" || raw.kind === "milestone" || raw.kind === "note" ? raw.kind : "idea",
    x: safeNumber(raw.x, 0),
    y: safeNumber(raw.y, 0),
    width: Math.max(140, safeNumber(raw.width, 220)),
    height: Math.max(72, safeNumber(raw.height, 110)),
    title: typeof raw.title === "string" ? raw.title : "فكرة جديدة",
    description: typeof raw.description === "string" ? raw.description : null,
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

function normalizeSnapshot(boardId: string, value: unknown): BoardCanvasSnapshot {
  if (!value || typeof value !== "object") {
    return { board_id: boardId, nodes: [], edges: [], viewport: DEFAULT_VIEWPORT, updated_at: null };
  }
  const raw = value as Partial<BoardCanvasSnapshot>;
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((n) => normalizeNode(n, boardId)).filter((n): n is CanvasNode => !!n)
    : [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = Array.isArray(raw.edges)
    ? raw.edges.map((e) => normalizeEdge(e, boardId, nodeIds)).filter((e): e is CanvasEdge => !!e)
    : [];
  const viewportRaw = raw.viewport && typeof raw.viewport === "object" ? raw.viewport : DEFAULT_VIEWPORT;
  return {
    board_id: boardId,
    nodes,
    edges,
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
  return {
    id: `node-${crypto.randomUUID()}`,
    board_id: boardId,
    kind,
    x: position.x,
    y: position.y,
    width: kind === "milestone" ? 180 : 220,
    height: kind === "note" ? 140 : 110,
    title: kind === "task" ? "مهمة جديدة" : kind === "milestone" ? "معلم رئيسي" : kind === "note" ? "ملاحظة" : "فكرة جديدة",
    description: null,
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
