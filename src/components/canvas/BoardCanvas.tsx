import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CalendarRange,
  CheckCircle2,
  Circle,
  Columns3,
  Copy,
  Hand,
  Link2,
  ListTree,
  Maximize,
  Milestone,
  MousePointer2,
  Pencil,
  Highlighter,
  Eraser,
  Filter,
  Image as ImageIcon,
  Plus,
  Redo2,
  Search,
  Scissors,
  StickyNote,
  Tag,
  Type,
  Square,
  Trash2,
  Undo2,
  Unlink2,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { toast } from "sonner";

import { useBoardCanvas, useSaveBoardCanvas } from "@/hooks/use-canvas";
import { createCanvasEdge, createCanvasNode } from "@/services/canvas.service";
import { getCanvasAsset, saveCanvasImage } from "@/services/canvas-assets.service";
import { cn } from "@/lib/utils";
import type {
  BoardCanvasSnapshot,
  CanvasColor,
  CanvasEdge,
  CanvasNode,
  CanvasNodeStatus,
  CanvasPriority,
  CanvasStroke,
  CanvasViewport,
} from "@/types";

type ViewMode = "canvas" | "kanban" | "outline" | "roadmap";

type Tool =
  | "select"
  | "hand"
  | "node"
  | "connector"
  | "text"
  | "rectangle"
  | "ellipse"
  | "sticky"
  | "image"
  | "pen"
  | "highlighter"
  | "eraser";

type DragState =
  | {
      type: "pan";
      pointerX: number;
      pointerY: number;
      start: CanvasViewport;
    }
  | {
      type: "nodes";
      pointerX: number;
      pointerY: number;
      origins: Record<string, { x: number; y: number }>;
      before: BoardCanvasSnapshot;
    }
  | {
      type: "resize";
      pointerX: number;
      pointerY: number;
      nodeId: string;
      width: number;
      height: number;
      before: BoardCanvasSnapshot;
    }
  | null;

type ContextMenuState =
  | { x: number; y: number; worldX: number; worldY: number; nodeId: string | null }
  | null;

const GRID_SIZE = 28;
const MIN_NODE_WIDTH = 140;
const MIN_NODE_HEIGHT = 72;

const cloneSnapshot = (value: BoardCanvasSnapshot): BoardCanvasSnapshot =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const isEditableTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el?.closest("input, textarea, select, [contenteditable='true']");
};

function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

function canvasColorVar(color: CanvasColor) {
  return `var(--${color})`;
}


const NODE_STATUS_OPTIONS: Array<{ value: CanvasNodeStatus; label: string }> = [
  { value: "idea", label: "فكرة" },
  { value: "planned", label: "مخطط" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "done", label: "مكتمل" },
  { value: "blocked", label: "معطل" },
];

const PRIORITY_OPTIONS: Array<{ value: CanvasPriority; label: string }> = [
  { value: "critical", label: "حرجة" },
  { value: "high", label: "عالية" },
  { value: "medium", label: "متوسطة" },
  { value: "low", label: "منخفضة" },
];

function isSemanticNode(node: CanvasNode) {
  return (
    node.kind === "idea" ||
    node.kind === "task" ||
    node.kind === "milestone" ||
    node.kind === "note" ||
    node.kind === "sticky"
  );
}

function statusClass(status: CanvasNodeStatus) {
  if (status === "done") return "bg-success/15 text-success";
  if (status === "blocked") return "bg-danger/15 text-danger";
  if (status === "in_progress") return "bg-brand/15 text-brand";
  if (status === "planned") return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}

function priorityClass(priority: CanvasPriority) {
  if (priority === "critical") return "bg-danger/15 text-danger";
  if (priority === "high") return "bg-warning/15 text-warning";
  if (priority === "medium") return "bg-info/15 text-info";
  return "bg-success/15 text-success";
}


function localDateToDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function formatLocalDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function wouldCreateDependencyCycle(
  snapshot: BoardCanvasSnapshot,
  sourceNodeId: string,
  targetNodeId: string,
) {
  const adjacency = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "dependency") continue;
    const list = adjacency.get(edge.source_node_id) ?? [];
    list.push(edge.target_node_id);
    adjacency.set(edge.source_node_id, list);
  }

  const stack = [targetNodeId];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === sourceNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

function matchesBoardFilters(
  node: CanvasNode,
  query: string,
  status: "all" | CanvasNodeStatus,
  priority: "all" | "none" | CanvasPriority,
  owner: string,
  tag: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  if (normalizedQuery) {
    const haystack = [
      node.title,
      node.description ?? "",
      node.owner ?? "",
      node.tags.join(" "),
    ]
      .join(" ")
      .toLocaleLowerCase("ar");
    if (!haystack.includes(normalizedQuery)) return false;
  }

  if (status !== "all" && (!isSemanticNode(node) || node.status !== status)) return false;
  if (
    priority !== "all" &&
    (!isSemanticNode(node) ||
      (priority === "none" ? node.priority !== null : node.priority !== priority))
  ) {
    return false;
  }
  if (
    owner !== "all" &&
    (!isSemanticNode(node) ||
      (owner === "unassigned" ? node.owner !== null : node.owner !== owner))
  ) {
    return false;
  }
  if (tag !== "all" && (!isSemanticNode(node) || !node.tags.includes(tag))) return false;
  return true;
}

const DRAWING_COLORS: Array<{ value: CanvasColor; label: string }> = [
  { value: "ink", label: "حبر" },
  { value: "brand", label: "الهوية" },
  { value: "warning", label: "عنبري" },
  { value: "info", label: "سماوي" },
  { value: "danger", label: "أحمر" },
  { value: "success", label: "أخضر" },
];

export function BoardCanvas({ boardId }: { boardId: string }) {
  const { data: loadedCanvas, isLoading } = useBoardCanvas(boardId);
  const saveCanvas = useSaveBoardCanvas(boardId);

  const [snapshot, setSnapshot] = useState<BoardCanvasSnapshot | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [penSize, setPenSize] = useState(3);
  const [penColor, setPenColor] = useState<CanvasColor>("ink");
  const [highlighterSize, setHighlighterSize] = useState(18);
  const [highlighterColor, setHighlighterColor] = useState<CanvasColor>("warning");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CanvasNodeStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "none" | CanvasPriority>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const drag = useRef<DragState>(null);
  const drawing = useRef<{ strokeId: string; before: BoardCanvasSnapshot } | null>(null);
  const initializedBoard = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const past = useRef<BoardCanvasSnapshot[]>([]);
  const future = useRef<BoardCanvasSnapshot[]>([]);
  const clipboard = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null);

  useEffect(() => {
    if (!loadedCanvas || initializedBoard.current === boardId) return;
    initializedBoard.current = boardId;
    setSnapshot(cloneSnapshot(loadedCanvas));
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    past.current = [];
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }, [loadedCanvas, boardId]);

  useEffect(() => {
    if (!snapshot || initializedBoard.current !== boardId) return;
    setSaveState("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveCanvas.mutate(snapshot, {
        onSuccess: () => setSaveState("saved"),
        onError: () => setSaveState("error"),
      });
    }, 450);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [snapshot, boardId]);


  useEffect(() => {
    if (viewMode !== "canvas" || !focusNodeId || !snapshot || !canvasRef.current) return;
    const node = snapshot.nodes.find((item) => item.id === focusNodeId);
    if (!node) {
      setFocusNodeId(null);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    setSnapshot((current) =>
      current
        ? {
            ...current,
            viewport: {
              ...current.viewport,
              x: rect.width / 2 - (node.x + node.width / 2) * current.viewport.zoom,
              y: rect.height / 2 - (node.y + node.height / 2) * current.viewport.zoom,
            },
          }
        : current,
    );
    setFocusNodeId(null);
  }, [viewMode, focusNodeId, snapshot?.nodes]);


  const boardOwners = useMemo(
    () =>
      [...new Set((snapshot?.nodes ?? []).map((node) => node.owner).filter((value): value is string => !!value))]
        .sort((a, b) => a.localeCompare(b, "ar")),
    [snapshot?.nodes],
  );
  const boardTags = useMemo(
    () =>
      [...new Set((snapshot?.nodes ?? []).flatMap((node) => node.tags))]
        .sort((a, b) => a.localeCompare(b, "ar")),
    [snapshot?.nodes],
  );
  const filtersActive =
    !!searchQuery.trim() ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    ownerFilter !== "all" ||
    tagFilter !== "all";

  const visibleNodes = useMemo(
    () =>
      (snapshot?.nodes ?? []).filter((node) =>
        matchesBoardFilters(
          node,
          searchQuery,
          statusFilter,
          priorityFilter,
          ownerFilter,
          tagFilter,
        ),
      ),
    [snapshot?.nodes, searchQuery, statusFilter, priorityFilter, ownerFilter, tagFilter],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );
  const filteredSnapshot = useMemo(
    () =>
      snapshot
        ? {
            ...snapshot,
            nodes: visibleNodes,
            edges: snapshot.edges.filter(
              (edge) =>
                visibleNodeIds.has(edge.source_node_id) &&
                visibleNodeIds.has(edge.target_node_id),
            ),
          }
        : null,
    [snapshot, visibleNodes, visibleNodeIds],
  );


  useEffect(() => {
    if (!filtersActive || !selectedNodeIds.length) return;
    const remaining = selectedNodeIds.filter((id) => visibleNodeIds.has(id));
    if (remaining.length === selectedNodeIds.length) return;
    setSelectedNodeIds(remaining);
    if (!remaining.length) setSelectedEdgeId(null);
  }, [filtersActive, visibleNodeIds, selectedNodeIds]);

  const selectedNodes = useMemo(
    () => snapshot?.nodes.filter((node) => selectedNodeIds.includes(node.id)) ?? [],
    [snapshot, selectedNodeIds],
  );
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedEdge =
    snapshot?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const commit = useCallback((next: BoardCanvasSnapshot, recordHistory = true) => {
    if (recordHistory && snapshot) {
      past.current.push(cloneSnapshot(snapshot));
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      setHistoryVersion((v) => v + 1);
    }
    setSnapshot(next);
  }, [snapshot]);

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<CanvasNode>, recordHistory = true) => {
      if (!snapshot) return;
      const now = new Date().toISOString();
      commit(
        {
          ...snapshot,
          nodes: snapshot.nodes.map((node) =>
            node.id === nodeId ? { ...node, ...patch, updated_at: now } : node,
          ),
        },
        recordHistory,
      );
    },
    [snapshot, commit],
  );

  const updateEdge = useCallback(
    (edgeId: string, patch: Partial<CanvasEdge>) => {
      if (!snapshot) return;
      const now = new Date().toISOString();
      commit({
        ...snapshot,
        edges: snapshot.edges.map((edge) =>
          edge.id === edgeId ? { ...edge, ...patch, updated_at: now } : edge,
        ),
      });
    },
    [snapshot, commit],
  );


  const addDependency = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      if (!snapshot || sourceNodeId === targetNodeId) return;
      const duplicate = snapshot.edges.some(
        (edge) =>
          edge.kind === "dependency" &&
          edge.source_node_id === sourceNodeId &&
          edge.target_node_id === targetNodeId,
      );
      if (duplicate) return;
      if (wouldCreateDependencyCycle(snapshot, sourceNodeId, targetNodeId)) {
        toast.error("لا يمكن إضافة هذا الاعتماد لأنه سيُنشئ دورة اعتماد مغلقة.");
        return;
      }
      const edge = createCanvasEdge(boardId, sourceNodeId, targetNodeId);
      edge.kind = "dependency";
      edge.label = "يعتمد على";
      commit({ ...snapshot, edges: [...snapshot.edges, edge] });
    },
    [snapshot, boardId, commit],
  );

  const removeDependency = useCallback(
    (edgeId: string) => {
      if (!snapshot) return;
      commit({ ...snapshot, edges: snapshot.edges.filter((edge) => edge.id !== edgeId) });
    },
    [snapshot, commit],
  );

  const addNodeAtWorld = useCallback(
    (worldX: number, worldY: number, kind: CanvasNode["kind"] = "idea") => {
      if (!snapshot) return;
      const node = createCanvasNode(
        boardId,
        {
          x: snap(worldX - 110, snapToGrid),
          y: snap(worldY - 55, snapToGrid),
        },
        kind,
      );
      commit({ ...snapshot, nodes: [...snapshot.nodes, node] });
      setSelectedNodeIds([node.id]);
      setSelectedEdgeId(null);
      setTool("select");
      setContextMenu(null);
    },
    [snapshot, boardId, snapToGrid, commit],
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!snapshot || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - snapshot.viewport.x) / snapshot.viewport.zoom,
        y: (clientY - rect.top - snapshot.viewport.y) / snapshot.viewport.zoom,
      };
    },
    [snapshot],
  );

  const addNodeAtScreen = useCallback(
    (clientX: number, clientY: number, kind: CanvasNode["kind"] = "idea") => {
      const world = screenToWorld(clientX, clientY);
      if (world) addNodeAtWorld(world.x, world.y, kind);
    },
    [screenToWorld, addNodeAtWorld],
  );

  const deleteSelection = useCallback(() => {
    if (!snapshot) return;
    if (selectedEdgeId) {
      commit({ ...snapshot, edges: snapshot.edges.filter((e) => e.id !== selectedEdgeId) });
      setSelectedEdgeId(null);
      return;
    }
    if (!selectedNodeIds.length) return;
    const selected = new Set(selectedNodeIds);
    commit({
      ...snapshot,
      nodes: snapshot.nodes.filter((node) => !selected.has(node.id)),
      edges: snapshot.edges.filter(
        (edge) =>
          !selected.has(edge.source_node_id) && !selected.has(edge.target_node_id),
      ),
    });
    setSelectedNodeIds([]);
    setConnectorSourceId(null);
  }, [snapshot, selectedNodeIds, selectedEdgeId, commit]);

  const copySelection = useCallback(() => {
    if (!snapshot || !selectedNodeIds.length) return;
    const selected = new Set(selectedNodeIds);
    clipboard.current = {
      nodes: snapshot.nodes
        .filter((node) => selected.has(node.id))
        .map((node) => cloneSnapshot({
          board_id: boardId,
          nodes: [node],
          edges: [],
          strokes: [],
          viewport: snapshot.viewport,
          updated_at: null,
        }).nodes[0]!),
      edges: snapshot.edges
        .filter(
          (edge) =>
            selected.has(edge.source_node_id) && selected.has(edge.target_node_id),
        )
        .map((edge) => ({ ...edge })),
    };
  }, [snapshot, selectedNodeIds, boardId]);

  const pasteSelection = useCallback(() => {
    if (!snapshot || !clipboard.current?.nodes.length) return;
    const idMap = new Map<string, string>();
    const now = new Date().toISOString();
    const nodes = clipboard.current.nodes.map((node) => {
      const id = `node-${crypto.randomUUID()}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        board_id: boardId,
        x: snap(node.x + GRID_SIZE, snapToGrid),
        y: snap(node.y + GRID_SIZE, snapToGrid),
        created_at: now,
        updated_at: now,
      };
    });
    const edges = clipboard.current.edges.flatMap((edge) => {
      const source = idMap.get(edge.source_node_id);
      const target = idMap.get(edge.target_node_id);
      if (!source || !target) return [];
      return [{
        ...edge,
        id: `edge-${crypto.randomUUID()}`,
        board_id: boardId,
        source_node_id: source,
        target_node_id: target,
        created_at: now,
        updated_at: now,
      }];
    });
    commit({
      ...snapshot,
      nodes: [...snapshot.nodes, ...nodes],
      edges: [...snapshot.edges, ...edges],
    });
    setSelectedNodeIds(nodes.map((node) => node.id));
    setSelectedEdgeId(null);
    clipboard.current = {
      nodes: nodes.map((node) => ({ ...node })),
      edges: edges.map((edge) => ({ ...edge })),
    };
  }, [snapshot, boardId, snapToGrid, commit]);

  const duplicateSelection = useCallback(() => {
    copySelection();
    queueMicrotask(() => pasteSelection());
  }, [copySelection, pasteSelection]);

  const undo = useCallback(() => {
    if (!snapshot || !past.current.length) return;
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(cloneSnapshot(snapshot));
    setSnapshot(previous);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setContextMenu(null);
    setHistoryVersion((v) => v + 1);
  }, [snapshot]);

  const redo = useCallback(() => {
    if (!snapshot || !future.current.length) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(cloneSnapshot(snapshot));
    setSnapshot(next);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setContextMenu(null);
    setHistoryVersion((v) => v + 1);
  }, [snapshot]);

  const setZoom = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      if (!snapshot || !canvasRef.current) return;
      const zoom = Math.min(2.5, Math.max(0.25, nextZoom));
      const rect = canvasRef.current.getBoundingClientRect();
      const point = anchor ?? { x: rect.width / 2, y: rect.height / 2 };
      const worldX = (point.x - snapshot.viewport.x) / snapshot.viewport.zoom;
      const worldY = (point.y - snapshot.viewport.y) / snapshot.viewport.zoom;
      setSnapshot({
        ...snapshot,
        viewport: {
          x: point.x - worldX * zoom,
          y: point.y - worldY * zoom,
          zoom,
        },
      });
    },
    [snapshot],
  );

  const fitView = useCallback(() => {
    if (!snapshot || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const strokePoints = snapshot.strokes.flatMap((stroke) => stroke.points);
    if (!snapshot.nodes.length && !strokePoints.length) {
      setSnapshot({ ...snapshot, viewport: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    const padding = 140;
    const nodeMinX = snapshot.nodes.length ? Math.min(...snapshot.nodes.map((n) => n.x)) : Infinity;
    const nodeMinY = snapshot.nodes.length ? Math.min(...snapshot.nodes.map((n) => n.y)) : Infinity;
    const nodeMaxX = snapshot.nodes.length ? Math.max(...snapshot.nodes.map((n) => n.x + n.width)) : -Infinity;
    const nodeMaxY = snapshot.nodes.length ? Math.max(...snapshot.nodes.map((n) => n.y + n.height)) : -Infinity;
    const strokeMinX = strokePoints.length ? Math.min(...strokePoints.map((point) => point.x)) : Infinity;
    const strokeMinY = strokePoints.length ? Math.min(...strokePoints.map((point) => point.y)) : Infinity;
    const strokeMaxX = strokePoints.length ? Math.max(...strokePoints.map((point) => point.x)) : -Infinity;
    const strokeMaxY = strokePoints.length ? Math.max(...strokePoints.map((point) => point.y)) : -Infinity;
    const minX = Math.min(nodeMinX, strokeMinX);
    const minY = Math.min(nodeMinY, strokeMinY);
    const maxX = Math.max(nodeMaxX, strokeMaxX);
    const maxY = Math.max(nodeMaxY, strokeMaxY);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zoom = Math.min(
      1.5,
      Math.max(
        0.25,
        Math.min((rect.width - padding) / width, (rect.height - padding) / height),
      ),
    );
    setSnapshot({
      ...snapshot,
      viewport: {
        zoom,
        x: (rect.width - width * zoom) / 2 - minX * zoom,
        y: (rect.height - height * zoom) / 2 - minY * zoom,
      },
    });
  }, [snapshot]);

  const handleNodeSelect = useCallback(
    (nodeId: string, additive: boolean) => {
      if (!snapshot) return;
      setSelectedEdgeId(null);
      if (tool === "connector") {
        if (!connectorSourceId) {
          setConnectorSourceId(nodeId);
          setSelectedNodeIds([nodeId]);
          return;
        }
        if (connectorSourceId === nodeId) {
          setConnectorSourceId(null);
          return;
        }
        const duplicate = snapshot.edges.some(
          (edge) =>
            edge.source_node_id === connectorSourceId &&
            edge.target_node_id === nodeId,
        );
        if (!duplicate) {
          commit({
            ...snapshot,
            edges: [
              ...snapshot.edges,
              createCanvasEdge(boardId, connectorSourceId, nodeId),
            ],
          });
        }
        setConnectorSourceId(null);
        setTool("select");
        setSelectedNodeIds([nodeId]);
        return;
      }
      setSelectedNodeIds((current) => {
        if (!additive) return [nodeId];
        return current.includes(nodeId) ? current : [...current, nodeId];
      });
    },
    [snapshot, tool, connectorSourceId, boardId, commit],
  );


  const uploadImage = useCallback(
    async (file: File) => {
      if (!snapshot || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!world) return;

      try {
        const asset = await saveCanvasImage(boardId, file);
        let width = 320;
        let height = 220;

        if (typeof createImageBitmap === "function") {
          try {
            const bitmap = await createImageBitmap(file);
            const ratio = bitmap.width / Math.max(1, bitmap.height);
            height = Math.min(320, Math.max(140, width / Math.max(0.35, ratio)));
            bitmap.close();
          } catch {
            // الأبعاد الافتراضية كافية إذا تعذر قراءة أبعاد الصورة.
          }
        }

        const node = createCanvasNode(
          boardId,
          {
            x: snap(world.x - width / 2, snapToGrid),
            y: snap(world.y - height / 2, snapToGrid),
          },
          "image",
        );
        node.asset_id = asset.id;
        node.title = file.name;
        node.width = width;
        node.height = height;

        setSnapshot((current) => {
          if (!current) return current;
          past.current.push(cloneSnapshot(current));
          if (past.current.length > 80) past.current.shift();
          future.current = [];
          setHistoryVersion((value) => value + 1);
          return { ...current, nodes: [...current.nodes, node] };
        });
        setSelectedNodeIds([node.id]);
        setSelectedEdgeId(null);
        setTool("select");
      } catch (error) {
        const message =
          error instanceof Error && error.message === "Image is too large"
            ? "حجم الصورة يتجاوز 8MB."
            : "تعذر إضافة الصورة.";
        toast.error(message);
      } finally {
        if (imageInputRef.current) imageInputRef.current.value = "";
      }
    },
    [snapshot, boardId, screenToWorld, snapToGrid],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && key === "c") {
        if (selectedNodeIds.length) {
          event.preventDefault();
          copySelection();
        }
        return;
      }
      if (mod && key === "v") {
        if (clipboard.current?.nodes.length) {
          event.preventDefault();
          pasteSelection();
        }
        return;
      }
      if (mod && key === "d") {
        if (selectedNodeIds.length) {
          event.preventDefault();
          duplicateSelection();
        }
        return;
      }
      if (mod && key === "a") {
        if (snapshot?.nodes.length) {
          event.preventDefault();
          setSelectedNodeIds(snapshot.nodes.map((node) => node.id));
          setSelectedEdgeId(null);
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodeIds.length || selectedEdgeId) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (event.key === "Escape") {
        setSelectedNodeIds([]);
        setSelectedEdgeId(null);
        setConnectorSourceId(null);
        setContextMenu(null);
        setTool("select");
        return;
      }
      if (key === "v") setTool("select");
      if (key === "h") setTool("hand");
      if (key === "n") setTool("node");
      if (key === "l") setTool("connector");
      if (key === "t") setTool("text");
      if (key === "r") setTool("rectangle");
      if (key === "o") setTool("ellipse");
      if (key === "s") setTool("sticky");
      if (key === "p") setTool("pen");
      if (key === "b") setTool("highlighter");
      if (key === "e") setTool("eraser");
      if (key === "g") setSnapToGrid((v) => !v);
      if (key === "0") fitView();
      if (key === "=" || key === "+") setZoom((snapshot?.viewport.zoom ?? 1) * 1.1);
      if (key === "-") setZoom((snapshot?.viewport.zoom ?? 1) * 0.9);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    snapshot,
    selectedNodeIds,
    selectedEdgeId,
    copySelection,
    pasteSelection,
    duplicateSelection,
    deleteSelection,
    undo,
    redo,
    fitView,
    setZoom,
  ]);

  if (isLoading || !snapshot) {
    return (
      <div className="canvas-grid flex flex-1 items-center justify-center text-sm text-muted-foreground">
        جارٍ تجهيز مساحة العمل…
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      <ViewSwitcher value={viewMode} onChange={setViewMode} />
      <BoardFilterBar
        query={searchQuery}
        status={statusFilter}
        priority={priorityFilter}
        owner={ownerFilter}
        tag={tagFilter}
        owners={boardOwners}
        tags={boardTags}
        resultCount={visibleNodes.length}
        totalCount={snapshot.nodes.length}
        active={filtersActive}
        onQuery={setSearchQuery}
        onStatus={setStatusFilter}
        onPriority={setPriorityFilter}
        onOwner={setOwnerFilter}
        onTag={setTagFilter}
        onClear={() => {
          setSearchQuery("");
          setStatusFilter("all");
          setPriorityFilter("all");
          setOwnerFilter("all");
          setTagFilter("all");
        }}
      />

      {viewMode === "canvas" && (
      <CanvasToolbar
        tool={tool}
        snapToGrid={snapToGrid}
        onTool={(next) => {
          if (next === "image") {
            imageInputRef.current?.click();
            return;
          }
          setTool(next);
          if (next !== "connector") setConnectorSourceId(null);
        }}
        onToggleSnap={() => setSnapToGrid((value) => !value)}
      />
      )}

      {viewMode === "canvas" && (tool === "pen" || tool === "highlighter") && (
        <DrawingControls
          tool={tool}
          size={tool === "highlighter" ? highlighterSize : penSize}
          color={tool === "highlighter" ? highlighterColor : penColor}
          onSize={(value) =>
            tool === "highlighter" ? setHighlighterSize(value) : setPenSize(value)
          }
          onColor={(value) =>
            tool === "highlighter" ? setHighlighterColor(value) : setPenColor(value)
          }
        />
      )}


      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadImage(file);
        }}
      />

      {viewMode === "canvas" ? (
      <div
        ref={canvasRef}
        className={cn(
          "canvas-grid relative flex flex-1 overflow-hidden touch-none",
          tool === "hand"
            ? "cursor-grab active:cursor-grabbing"
            : tool === "node" ||
                tool === "text" ||
                tool === "rectangle" ||
                tool === "ellipse" ||
                tool === "sticky" ||
                tool === "pen" ||
                tool === "highlighter" ||
                tool === "eraser"
              ? "cursor-crosshair"
              : "cursor-default",
        )}
        onContextMenu={(event) => {
          event.preventDefault();
          const world = screenToWorld(event.clientX, event.clientY);
          if (!world) return;
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            worldX: world.x,
            worldY: world.y,
            nodeId: null,
          });
        }}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          setZoom(snapshot.viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1), {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            addNodeAtScreen(event.clientX, event.clientY);
          }
        }}
        onPointerDown={(event) => {
          setContextMenu(null);
          if (
            (tool === "text" || tool === "rectangle" || tool === "ellipse" || tool === "sticky") &&
            event.target === event.currentTarget
          ) {
            const world = screenToWorld(event.clientX, event.clientY);
            if (!world) return;
            addNodeAtWorld(world.x, world.y, tool);
            return;
          }
          if ((tool === "pen" || tool === "highlighter") && event.target === event.currentTarget) {
            const world = screenToWorld(event.clientX, event.clientY);
            if (!world) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const now = new Date().toISOString();
            const pressure = event.pointerType === "mouse" ? 0.5 : Math.max(0.05, event.pressure || 0.5);
            const stroke: CanvasStroke = {
              id: `stroke-${crypto.randomUUID()}`,
              board_id: boardId,
              tool,
              points: [{ x: world.x, y: world.y, pressure }],
              size: tool === "highlighter" ? highlighterSize : penSize,
              color: tool === "highlighter" ? highlighterColor : penColor,
              created_at: now,
              updated_at: now,
            };
            drawing.current = { strokeId: stroke.id, before: cloneSnapshot(snapshot) };
            setSnapshot({ ...snapshot, strokes: [...snapshot.strokes, stroke] });
            setSelectedNodeIds([]);
            setSelectedEdgeId(null);
            return;
          }
          if (event.target !== event.currentTarget) return;
          if (tool === "node") {
            addNodeAtScreen(event.clientX, event.clientY);
            return;
          }
          if (tool === "select") {
            setSelectedNodeIds([]);
            setSelectedEdgeId(null);
            return;
          }
          if (tool === "hand") {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              type: "pan",
              pointerX: event.clientX,
              pointerY: event.clientY,
              start: snapshot.viewport,
            };
          }
        }}
        onPointerMove={(event) => {
          if (drawing.current) {
            const world = screenToWorld(event.clientX, event.clientY);
            if (!world) return;
            const pressure = event.pointerType === "mouse" ? 0.5 : Math.max(0.05, event.pressure || 0.5);
            setSnapshot((current) => current ? {
              ...current,
              strokes: current.strokes.map((stroke) =>
                stroke.id === drawing.current?.strokeId
                  ? {
                      ...stroke,
                      points: [...stroke.points, { x: world.x, y: world.y, pressure }],
                      updated_at: new Date().toISOString(),
                    }
                  : stroke,
              ),
            } : current);
            return;
          }
          if (drag.current?.type !== "pan") return;
          const d = drag.current;
          setSnapshot({
            ...snapshot,
            viewport: {
              ...d.start,
              x: d.start.x + event.clientX - d.pointerX,
              y: d.start.y + event.clientY - d.pointerY,
            },
          });
        }}
        onPointerUp={() => {
          if (drawing.current) {
            past.current.push(drawing.current.before);
            if (past.current.length > 80) past.current.shift();
            future.current = [];
            drawing.current = null;
            setHistoryVersion((v) => v + 1);
            setSnapshot((current) => (current ? { ...current } : current));
            return;
          }
          if (drag.current?.type === "pan") drag.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = null;
          if (drag.current?.type === "pan") drag.current = null;
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${snapshot.viewport.x}px, ${snapshot.viewport.y}px) scale(${snapshot.viewport.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <CanvasStrokes
            strokes={snapshot.strokes}
            erasing={tool === "eraser"}
            onErase={(strokeId) => {
              if (tool !== "eraser") return;
              commit({
                ...snapshot,
                strokes: snapshot.strokes.filter((stroke) => stroke.id !== strokeId),
              });
            }}
          />

          <CanvasEdges
            snapshot={filteredSnapshot ?? snapshot}
            selectedEdgeId={selectedEdgeId}
            onSelect={(edgeId) => {
              setSelectedEdgeId(edgeId);
              setSelectedNodeIds([]);
            }}
          />

          {visibleNodes.map((node) => (
            <CanvasNodeCard
              key={node.id}
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              connectorSource={connectorSourceId === node.id}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const world = screenToWorld(event.clientX, event.clientY);
                if (!world) return;
                if (!selectedNodeIds.includes(node.id)) {
                  setSelectedNodeIds([node.id]);
                }
                setSelectedEdgeId(null);
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  worldX: world.x,
                  worldY: world.y,
                  nodeId: node.id,
                });
              }}
              onSelect={(event) => {
                event.stopPropagation();
                handleNodeSelect(node.id, event.shiftKey || event.ctrlKey || event.metaKey);
              }}
              onDragStart={(event) => {
                if (tool !== "select") return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);

                let ids = selectedNodeIds;
                if (!ids.includes(node.id)) {
                  ids = event.shiftKey || event.ctrlKey || event.metaKey
                    ? [...ids, node.id]
                    : [node.id];
                  setSelectedNodeIds(ids);
                }
                const origins: Record<string, { x: number; y: number }> = {};
                for (const id of ids) {
                  const selected = snapshot.nodes.find((item) => item.id === id);
                  if (selected) origins[id] = { x: selected.x, y: selected.y };
                }
                drag.current = {
                  type: "nodes",
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  origins,
                  before: cloneSnapshot(snapshot),
                };
              }}
              onDragMove={(event) => {
                if (drag.current?.type !== "nodes") return;
                const d = drag.current;
                const dx = (event.clientX - d.pointerX) / snapshot.viewport.zoom;
                const dy = (event.clientY - d.pointerY) / snapshot.viewport.zoom;
                setSnapshot({
                  ...snapshot,
                  nodes: snapshot.nodes.map((item) => {
                    const origin = d.origins[item.id];
                    if (!origin) return item;
                    return {
                      ...item,
                      x: snap(origin.x + dx, snapToGrid),
                      y: snap(origin.y + dy, snapToGrid),
                      updated_at: new Date().toISOString(),
                    };
                  }),
                });
              }}
              onDragEnd={() => {
                if (drag.current?.type !== "nodes") return;
                past.current.push(drag.current.before);
                if (past.current.length > 80) past.current.shift();
                future.current = [];
                drag.current = null;
                setHistoryVersion((v) => v + 1);
                setSnapshot((current) => (current ? { ...current } : current));
              }}
              onResizeStart={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  type: "resize",
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  nodeId: node.id,
                  width: node.width,
                  height: node.height,
                  before: cloneSnapshot(snapshot),
                };
              }}
              onResizeMove={(event) => {
                if (drag.current?.type !== "resize" || drag.current.nodeId !== node.id) return;
                const d = drag.current;
                const width = Math.max(
                  MIN_NODE_WIDTH,
                  d.width + (event.clientX - d.pointerX) / snapshot.viewport.zoom,
                );
                const height = Math.max(
                  MIN_NODE_HEIGHT,
                  d.height + (event.clientY - d.pointerY) / snapshot.viewport.zoom,
                );
                updateNode(
                  node.id,
                  {
                    width: snap(width, snapToGrid),
                    height: snap(height, snapToGrid),
                  },
                  false,
                );
              }}
              onResizeEnd={() => {
                if (drag.current?.type !== "resize" || drag.current.nodeId !== node.id) return;
                past.current.push(drag.current.before);
                if (past.current.length > 80) past.current.shift();
                future.current = [];
                drag.current = null;
                setHistoryVersion((v) => v + 1);
                setSnapshot((current) => (current ? { ...current } : current));
              }}
            />
          ))}
        </div>

        {filtersActive && !visibleNodes.length ? (
          <FilteredCanvasEmpty onClear={() => {
            setSearchQuery("");
            setStatusFilter("all");
            setPriorityFilter("all");
            setOwnerFilter("all");
            setTagFilter("all");
          }} />
        ) : !snapshot.nodes.length && !snapshot.strokes.length ? (
          <EmptyCanvas
            onAdd={() => {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) addNodeAtScreen(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
          />
        ) : null}

        <ZoomControls
          zoom={snapshot.viewport.zoom}
          saveState={saveState}
          canUndo={past.current.length > 0}
          canRedo={future.current.length > 0}
          onZoomOut={() => setZoom(snapshot.viewport.zoom * 0.9)}
          onZoomIn={() => setZoom(snapshot.viewport.zoom * 1.1)}
          onFit={fitView}
          onUndo={undo}
          onRedo={redo}
        />
      </div>
      ) : viewMode === "kanban" ? (
        <KanbanView
          snapshot={filteredSnapshot ?? snapshot}
          onOpen={(nodeId) => {
            setSelectedNodeIds([nodeId]);
            setSelectedEdgeId(null);
            setFocusNodeId(nodeId);
            setViewMode("canvas");
          }}
          onStatusChange={(nodeId, status) => {
            const node = snapshot.nodes.find((item) => item.id === nodeId);
            if (!node || node.status === status) return;
            updateNode(nodeId, {
              status,
              progress: status === "done" ? 100 : node.progress === 100 ? 0 : node.progress,
            });
          }}
        />
      ) : viewMode === "outline" ? (
        <OutlineView
          snapshot={filteredSnapshot ?? snapshot}
          onOpen={(nodeId) => {
            setSelectedNodeIds([nodeId]);
            setSelectedEdgeId(null);
            setFocusNodeId(nodeId);
            setViewMode("canvas");
          }}
          onStatusChange={(nodeId, status) => {
            const node = snapshot.nodes.find((item) => item.id === nodeId);
            if (!node || node.status === status) return;
            updateNode(nodeId, {
              status,
              progress: status === "done" ? 100 : node.progress === 100 ? 0 : node.progress,
            });
          }}
        />
      ) : (
        <RoadmapView
          snapshot={filteredSnapshot ?? snapshot}
          onOpen={(nodeId) => {
            setSelectedNodeIds([nodeId]);
            setSelectedEdgeId(null);
            setFocusNodeId(nodeId);
            setViewMode("canvas");
          }}
        />
      )}

      {viewMode === "canvas" && (selectedNodeIds.length > 0 || selectedEdgeId) && (
        <div className="frost-strong absolute end-3 top-3 z-30 flex items-center gap-1 rounded-xl p-1 lg:hidden">
          {selectedNodeIds.length > 0 && (
            <button
              onClick={duplicateSelection}
              aria-label="تكرار المحدد"
              title="تكرار"
              className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={deleteSelection}
            aria-label="حذف المحدد"
            title="حذف"
            className="grid h-9 w-9 place-items-center rounded-lg text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {viewMode === "canvas" && (
      <CanvasInspector
        selectedNode={selectedNode}
        selectedNodesCount={selectedNodes.length}
        selectedEdge={selectedEdge}
        snapshot={snapshot}
        snapToGrid={snapToGrid}
        onNodeChange={(patch) => selectedNode && updateNode(selectedNode.id, patch)}
        onEdgeChange={(patch) => selectedEdge && updateEdge(selectedEdge.id, patch)}
        onDelete={deleteSelection}
        onDuplicate={duplicateSelection}
        onAddDependency={addDependency}
        onRemoveDependency={removeDependency}
      />
      )}

      {viewMode === "canvas" && contextMenu && (
        <CanvasContextMenu
          state={contextMenu}
          hasSelection={selectedNodeIds.length > 0 || !!selectedEdgeId}
          canPaste={!!clipboard.current?.nodes.length}
          onClose={() => setContextMenu(null)}
          onAdd={(kind) => addNodeAtWorld(contextMenu.worldX, contextMenu.worldY, kind)}
          onCopy={() => {
            copySelection();
            setContextMenu(null);
          }}
          onPaste={() => {
            pasteSelection();
            setContextMenu(null);
          }}
          onDuplicate={() => {
            duplicateSelection();
            setContextMenu(null);
          }}
          onDelete={() => {
            deleteSelection();
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}



function BoardFilterBar({
  query,
  status,
  priority,
  owner,
  tag,
  owners,
  tags,
  resultCount,
  totalCount,
  active,
  onQuery,
  onStatus,
  onPriority,
  onOwner,
  onTag,
  onClear,
}: {
  query: string;
  status: "all" | CanvasNodeStatus;
  priority: "all" | "none" | CanvasPriority;
  owner: string;
  tag: string;
  owners: string[];
  tags: string[];
  resultCount: number;
  totalCount: number;
  active: boolean;
  onQuery: (value: string) => void;
  onStatus: (value: "all" | CanvasNodeStatus) => void;
  onPriority: (value: "all" | "none" | CanvasPriority) => void;
  onOwner: (value: string) => void;
  onTag: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute start-3 top-3 z-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="بحث وتصفية عناصر اللوحة"
        title="بحث وتصفية"
        className={cn(
          "frost-strong relative grid h-10 w-10 place-items-center rounded-xl shadow-frost",
          active ? "text-brand" : "text-muted-foreground",
        )}
      >
        <Filter className="h-4 w-4" />
        {active && (
          <span className="absolute -end-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-primary-foreground">
            {resultCount}
          </span>
        )}
      </button>

      {open && (
        <div className="frost-strong absolute start-0 top-12 w-[min(360px,calc(100vw-1.5rem))] rounded-2xl p-3 shadow-lift">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="ابحث في العنوان، الوصف، المالك أو الوسوم…"
              className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-sm outline-none focus:border-brand"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[10px] text-muted-foreground">
              الحالة
              <select
                value={status}
                onChange={(event) => onStatus(event.target.value as "all" | CanvasNodeStatus)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
              >
                <option value="all">كل الحالات</option>
                {NODE_STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="text-[10px] text-muted-foreground">
              الأولوية
              <select
                value={priority}
                onChange={(event) =>
                  onPriority(event.target.value as "all" | "none" | CanvasPriority)
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
              >
                <option value="all">كل الأولويات</option>
                <option value="none">بدون أولوية</option>
                {PRIORITY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="text-[10px] text-muted-foreground">
              المالك
              <select
                value={owner}
                onChange={(event) => onOwner(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
              >
                <option value="all">كل المالكين</option>
                <option value="unassigned">غير معيّن</option>
                {owners.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className="text-[10px] text-muted-foreground">
              الوسم
              <select
                value={tag}
                onChange={(event) => onTag(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground"
              >
                <option value="all">كل الوسوم</option>
                {tags.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">
              {active ? `${resultCount} من ${totalCount}` : `${totalCount} عنصر`}
            </span>
            {active && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-danger hover:bg-danger/10"
              >
                <X className="h-3.5 w-3.5" /> مسح الفلاتر
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilteredCanvasEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
      <div className="frost pointer-events-auto max-w-sm rounded-3xl p-6 text-center shadow-frost">
        <Search className="mx-auto h-7 w-7 text-brand" />
        <h3 className="mt-3 font-semibold">لا توجد عناصر مطابقة</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          غيّر عبارة البحث أو الفلاتر لإظهار عناصر أخرى.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          مسح الفلاتر
        </button>
      </div>
    </div>
  );
}

function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const options: Array<{
    value: ViewMode;
    label: string;
    icon: typeof MousePointer2;
  }> = [
    { value: "canvas", label: "اللوحة", icon: MousePointer2 },
    { value: "kanban", label: "كانبان", icon: Columns3 },
    { value: "outline", label: "المخطط", icon: ListTree },
    { value: "roadmap", label: "الخط الزمني", icon: CalendarRange },
  ];

  return (
    <div
      className="frost-strong absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl p-1 shadow-frost"
      role="tablist"
      aria-label="طريقة عرض اللوحة"
    >
      {options.map(({ value: mode, label, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition sm:px-3",
            value === mode
              ? "bg-brand text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function semanticKindLabel(node: CanvasNode) {
  if (node.kind === "task") return "مهمة";
  if (node.kind === "milestone") return "معلم";
  if (node.kind === "sticky" || node.kind === "note") return "ملاحظة";
  return "فكرة";
}

function KanbanView({
  snapshot,
  onOpen,
  onStatusChange,
}: {
  snapshot: BoardCanvasSnapshot;
  onOpen: (nodeId: string) => void;
  onStatusChange: (nodeId: string, status: CanvasNodeStatus) => void;
}) {
  const nodes = snapshot.nodes.filter(isSemanticNode);

  if (!nodes.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 pt-16">
        <div className="max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Columns3 className="mx-auto h-8 w-8 text-brand" />
          <h3 className="mt-3 font-semibold">لا توجد عناصر تنفيذية بعد</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            أضف فكرة أو مهمة أو معلمًا من اللوحة، وستظهر هنا تلقائيًا حسب حالتها.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background pt-16">
      <div className="px-4 pb-3 text-xs text-muted-foreground sm:px-6">
        يعرض كانبان العناصر التنفيذية فقط؛ النصوص والأشكال والصور والرسم الحر تبقى في عرض اللوحة.
      </div>
      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-5 sm:px-6">
        {NODE_STATUS_OPTIONS.map((status) => {
          const columnNodes = nodes.filter((node) => node.status === status.value);
          return (
            <section
              key={status.value}
              className="flex w-[280px] min-w-[280px] flex-col rounded-2xl border border-border bg-card/60"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const nodeId =
                  event.dataTransfer.getData("application/x-projectflow-node") ||
                  event.dataTransfer.getData("text/plain");
                if (nodeId) onStatusChange(nodeId, status.value);
              }}
            >
              <header className="flex items-center justify-between border-b border-border px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusClass(status.value))}>
                    {status.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{columnNodes.length}</span>
                </div>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
                {columnNodes.map((node) => (
                  <article
                    key={node.id}
                    draggable
                    onDragStart={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("select, button")) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-projectflow-node", node.id);
                      event.dataTransfer.setData("text/plain", node.id);
                    }}
                    className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-frost)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          {semanticKindLabel(node)}
                        </p>
                        <h4 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                          {node.title}
                        </h4>
                      </div>
                      {node.priority && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            priorityClass(node.priority),
                          )}
                        >
                          {PRIORITY_OPTIONS.find((item) => item.value === node.priority)?.label}
                        </span>
                      )}
                    </div>

                    {node.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {node.description}
                      </p>
                    )}

                    {(node.owner || node.tags.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        {node.owner && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3 w-3" /> {node.owner}
                          </span>
                        )}
                        {node.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5">#{tag}</span>
                        ))}
                      </div>
                    )}

                    {node.due_date && (
                      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <CalendarRange className="h-3 w-3" />
                        الاستحقاق {formatLocalDate(node.due_date)}
                      </p>
                    )}

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>الإنجاز</span>
                        <span>{Math.round(node.progress)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand transition-[width]"
                          style={{ width: `${Math.max(0, Math.min(100, node.progress))}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={node.status}
                        onChange={(event) =>
                          onStatusChange(node.id, event.target.value as CanvasNodeStatus)
                        }
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                        aria-label={`تغيير حالة ${node.title}`}
                      >
                        {NODE_STATUS_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onOpen(node.id)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        فتح
                      </button>
                    </div>
                  </article>
                ))}

                {!columnNodes.length && (
                  <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                    اسحب عنصرًا إلى هنا
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OutlineView({
  snapshot,
  onOpen,
  onStatusChange,
}: {
  snapshot: BoardCanvasSnapshot;
  onOpen: (nodeId: string) => void;
  onStatusChange: (nodeId: string, status: CanvasNodeStatus) => void;
}) {
  const order = new Map(
    NODE_STATUS_OPTIONS.map((item, index) => [item.value, index] as const),
  );
  const nodes = snapshot.nodes
    .filter(isSemanticNode)
    .slice()
    .sort((a, b) => {
      const statusDiff = (order.get(a.status) ?? 0) - (order.get(b.status) ?? 0);
      if (statusDiff !== 0) return statusDiff;
      return a.title.localeCompare(b.title, "ar");
    });

  return (
    <div className="flex flex-1 overflow-y-auto bg-background px-4 pb-8 pt-16 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 rounded-2xl border border-border bg-card/70 p-4">
          <div className="flex items-center gap-2">
            <ListTree className="h-5 w-5 text-brand" />
            <div>
              <h3 className="font-semibold">المخطط التنفيذي</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                نفس عناصر اللوحة مرتبة حسب الحالة؛ أي تعديل هنا يُحفظ على العنصر نفسه.
              </p>
            </div>
          </div>
        </div>

        {!nodes.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="font-medium">لا توجد عناصر تنفيذية بعد.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              أضف فكرة أو مهمة أو معلمًا من عرض اللوحة.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {nodes.map((node, index) => (
              <div
                key={node.id}
                className={cn(
                  "grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_140px_110px_130px_auto] md:items-center",
                  index > 0 && "border-t border-border",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {semanticKindLabel(node)}
                    </span>
                    {node.priority && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          priorityClass(node.priority),
                        )}
                      >
                        {PRIORITY_OPTIONS.find((item) => item.value === node.priority)?.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">{node.title}</p>
                  {node.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {node.description}
                    </p>
                  )}
                  {(node.owner || node.tags.length > 0) && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {node.owner && <span>{node.owner}</span>}
                      {node.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                    </p>
                  )}
                  {node.due_date && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <CalendarRange className="h-3 w-3" />
                      {formatLocalDate(node.due_date)}
                    </p>
                  )}
                </div>

                <select
                  value={node.status}
                  onChange={(event) =>
                    onStatusChange(node.id, event.target.value as CanvasNodeStatus)
                  }
                  className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
                  aria-label={`تغيير حالة ${node.title}`}
                >
                  {NODE_STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <span className={cn("w-fit rounded-full px-2 py-1 text-xs font-medium", statusClass(node.status))}>
                  {NODE_STATUS_OPTIONS.find((item) => item.value === node.status)?.label}
                </span>

                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>الإنجاز</span>
                    <span>{Math.round(node.progress)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(0, Math.min(100, node.progress))}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(node.id)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  فتح في اللوحة
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function RoadmapView({
  snapshot,
  onOpen,
}: {
  snapshot: BoardCanvasSnapshot;
  onOpen: (nodeId: string) => void;
}) {
  const semanticNodes = snapshot.nodes.filter(isSemanticNode);
  const dated = semanticNodes.filter((node) => node.start_date || node.due_date);
  const undated = semanticNodes.filter((node) => !node.start_date && !node.due_date);

  const points = dated.flatMap((node) =>
    [node.start_date, node.due_date].filter((value): value is string => !!value),
  );

  if (!semanticNodes.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 pt-16">
        <div className="max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <CalendarRange className="mx-auto h-8 w-8 text-brand" />
          <h3 className="mt-3 font-semibold">لا توجد عناصر للخط الزمني بعد</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            أضف مهامًا أو معالم أو أفكارًا، ثم عيّن تاريخ البداية أو الاستحقاق من خصائص العنصر.
          </p>
        </div>
      </div>
    );
  }

  const sortedPoints = [...points].sort();
  const minDay = points.length ? Math.min(...points.map(localDateToDay)) : 0;
  const maxDay = points.length ? Math.max(...points.map(localDateToDay)) : minDay + 13;
  const totalDays = Math.max(14, maxDay - minDay + 1);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background pt-16">
      <div className="px-4 pb-3 text-xs text-muted-foreground sm:px-6">
        الخط الزمني يستخدم نفس عناصر اللوحة. حدّد تاريخ البداية والاستحقاق من Inspector ليظهر العنصر هنا.
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6 sm:px-6">
        {dated.length ? (
          <div className="min-w-[850px] overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[240px_minmax(580px,1fr)] border-b border-border bg-muted/30">
              <div className="border-e border-border px-4 py-3 text-xs font-semibold">العنصر</div>
              <div className="flex items-center justify-between px-4 py-3 text-[10px] text-muted-foreground">
                <span>{formatLocalDate(sortedPoints[0] ?? null)}</span>
                <span>{formatLocalDate(sortedPoints.at(-1) ?? null)}</span>
              </div>
            </div>

            {dated.map((node, index) => {
              const rawStart = node.start_date ?? node.due_date!;
              const rawEnd = node.due_date ?? node.start_date!;
              const startDay = Math.min(localDateToDay(rawStart), localDateToDay(rawEnd));
              const endDay = Math.max(localDateToDay(rawStart), localDateToDay(rawEnd));
              const left = ((startDay - minDay) / totalDays) * 100;
              const width = Math.max(1.5, ((endDay - startDay + 1) / totalDays) * 100);

              return (
                <div
                  key={node.id}
                  className={cn(
                    "grid min-h-16 grid-cols-[240px_minmax(580px,1fr)]",
                    index > 0 && "border-t border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(node.id)}
                    className="border-e border-border px-4 py-3 text-start hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{semanticKindLabel(node)}</span>
                      {node.priority && (
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", priorityClass(node.priority))}>
                          {PRIORITY_OPTIONS.find((item) => item.value === node.priority)?.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">{node.title}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatLocalDate(node.start_date)} ← {formatLocalDate(node.due_date)}
                    </p>
                  </button>

                  <div className="relative bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[size:7.14%_100%] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(node.id)}
                      title={node.title}
                      className={cn(
                        "absolute top-1/2 h-7 -translate-y-1/2 overflow-hidden rounded-lg px-2 text-start text-[10px] font-medium shadow-sm",
                        statusClass(node.status),
                      )}
                      style={{
                        left: `${Math.max(0, Math.min(98, left))}%`,
                        width: `${Math.min(100 - left, width)}%`,
                        minWidth: "24px",
                      }}
                    >
                      <span className="block truncate">{node.title}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد عناصر مؤرخة حتى الآن.
          </div>
        )}

        {undated.length > 0 && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">بدون تاريخ</h3>
              <span className="text-xs text-muted-foreground">{undated.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {undated.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onOpen(node.id)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-xs hover:bg-muted"
                >
                  {node.title}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function CanvasToolbar({
  tool,
  snapToGrid,
  onTool,
  onToggleSnap,
}: {
  tool: Tool;
  snapToGrid: boolean;
  onTool: (tool: Tool) => void;
  onToggleSnap: () => void;
}) {
  const tools: Array<{ id: Tool; label: string; icon: typeof MousePointer2; shortcut: string }> = [
    { id: "select", label: "تحديد", icon: MousePointer2, shortcut: "V" },
    { id: "hand", label: "تحريك", icon: Hand, shortcut: "H" },
    { id: "node", label: "عقدة", icon: Circle, shortcut: "N" },
    { id: "connector", label: "موصل", icon: Link2, shortcut: "L" },
    { id: "text", label: "نص", icon: Type, shortcut: "T" },
    { id: "rectangle", label: "مستطيل", icon: Square, shortcut: "R" },
    { id: "ellipse", label: "شكل بيضاوي", icon: Circle, shortcut: "O" },
    { id: "sticky", label: "ملاحظة لاصقة", icon: StickyNote, shortcut: "S" },
    { id: "image", label: "صورة", icon: ImageIcon, shortcut: "—" },
    { id: "pen", label: "قلم", icon: Pencil, shortcut: "P" },
    { id: "highlighter", label: "تمييز", icon: Highlighter, shortcut: "B" },
    { id: "eraser", label: "ممحاة", icon: Eraser, shortcut: "E" },
  ];
  return (
    <div className="frost-strong absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-2xl p-1.5 md:bottom-auto md:left-auto md:start-4 md:top-1/2 md:max-h-[calc(100vh-6rem)] md:max-w-none md:translate-x-0 md:-translate-y-1/2 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
      {tools.map(({ id, label, icon: Icon, shortcut }) => (
        <button
          key={id}
          title={`${label} (${shortcut})`}
          aria-label={label}
          aria-pressed={tool === id}
          onClick={() => onTool(id)}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition",
            tool === id
              ? "bg-brand text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
      <div className="mx-1 hidden h-px bg-border md:block" />
      <button
        title={`محاذاة للشبكة (G) — ${snapToGrid ? "مفعّلة" : "متوقفة"}`}
        aria-label="محاذاة للشبكة"
        aria-pressed={snapToGrid}
        onClick={onToggleSnap}
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl text-xs font-semibold transition",
          snapToGrid ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-muted",
        )}
      >
        G
      </button>
    </div>
  );
}


function DrawingControls({
  tool,
  size,
  color,
  onSize,
  onColor,
}: {
  tool: "pen" | "highlighter";
  size: number;
  color: CanvasColor;
  onSize: (value: number) => void;
  onColor: (value: CanvasColor) => void;
}) {
  const max = tool === "highlighter" ? 36 : 16;
  return (
    <div className="frost-strong absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-3 py-2 md:bottom-4 md:left-auto md:start-20 md:translate-x-0">
      <span className="text-xs font-medium text-muted-foreground">
        {tool === "highlighter" ? "تمييز" : "قلم"}
      </span>
      <input
        type="range"
        min={1}
        max={max}
        value={size}
        onChange={(event) => onSize(Number(event.target.value))}
        aria-label="سمك أداة الرسم"
        className="w-24 accent-[var(--brand)]"
      />
      <span className="min-w-8 text-center text-xs text-muted-foreground">{size}px</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="لون أداة الرسم">
        {DRAWING_COLORS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={color === item.value}
            aria-label={item.label}
            title={item.label}
            onClick={() => onColor(item.value)}
            className={cn(
              "h-6 w-6 rounded-full border-2 border-background shadow-sm transition",
              color === item.value && "ring-2 ring-brand ring-offset-1 ring-offset-background",
            )}
            style={{ backgroundColor: canvasColorVar(item.value) }}
          />
        ))}
      </div>
    </div>
  );
}

function CanvasStrokes({
  strokes,
  erasing,
  onErase,
}: {
  strokes: CanvasStroke[];
  erasing: boolean;
  onErase: (strokeId: string) => void;
}) {
  return (
    <svg className="absolute left-0 top-0 overflow-visible">
      {strokes.map((stroke) => {
        if (stroke.points.length === 1) {
          const point = stroke.points[0]!;
          return (
            <circle
              key={stroke.id}
              cx={point.x}
              cy={point.y}
              r={Math.max(1, stroke.size * point.pressure * 0.5)}
              fill={canvasColorVar(stroke.color)}
              opacity={stroke.tool === "highlighter" ? 0.32 : 0.9}
              className={erasing ? "cursor-crosshair" : "pointer-events-none"}
              onPointerDown={erasing ? (event) => {
                event.stopPropagation();
                onErase(stroke.id);
              } : undefined}
              onPointerEnter={erasing ? (event) => {
                if (event.buttons > 0) onErase(stroke.id);
              } : undefined}
            />
          );
        }
        return (
          <g key={stroke.id}>
            {stroke.points.slice(1).map((point, index) => {
              const previous = stroke.points[index]!;
              const pressure = (previous.pressure + point.pressure) / 2;
              return (
                <line
                  key={index}
                  x1={previous.x}
                  y1={previous.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={canvasColorVar(stroke.color)}
                  strokeWidth={stroke.size * (0.55 + pressure * 0.9)}
                  strokeLinecap="round"
                  opacity={stroke.tool === "highlighter" ? 0.3 : 0.92}
                  className={erasing ? "cursor-crosshair" : "pointer-events-none"}
                  onPointerDown={erasing ? (event) => {
                    event.stopPropagation();
                    onErase(stroke.id);
                  } : undefined}
                  onPointerEnter={erasing ? (event) => {
                    if (event.buttons > 0) onErase(stroke.id);
                  } : undefined}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function CanvasEdges({
  snapshot,
  selectedEdgeId,
  onSelect,
}: {
  snapshot: BoardCanvasSnapshot;
  selectedEdgeId: string | null;
  onSelect: (edgeId: string) => void;
}) {
  return (
    <svg className="absolute left-0 top-0 overflow-visible">
      <defs>
        <marker
          id="canvas-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {snapshot.edges.map((edge) => {
        const source = snapshot.nodes.find((node) => node.id === edge.source_node_id);
        const target = snapshot.nodes.find((node) => node.id === edge.target_node_id);
        if (!source || !target) return null;
        const x1 = source.x + source.width / 2;
        const y1 = source.y + source.height / 2;
        const x2 = target.x + target.width / 2;
        const y2 = target.y + target.height / 2;
        const bend = Math.max(60, Math.abs(x2 - x1) * 0.45);
        const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
        return (
          <g key={edge.id}>
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth="16"
              className="cursor-pointer"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(edge.id);
              }}
            />
            <path
              d={path}
              fill="none"
              className={cn(
                "pointer-events-none",
                selectedEdgeId === edge.id
                  ? "stroke-brand"
                  : edge.kind === "dependency"
                    ? "stroke-warning"
                    : "stroke-muted-foreground/65",
              )}
              strokeWidth={selectedEdgeId === edge.id ? 3 : edge.kind === "dependency" ? 2.5 : 2}
              strokeDasharray={edge.kind === "dependency" ? "8 6" : undefined}
              markerEnd="url(#canvas-arrow)"
            />
            {(edge.label || edge.kind === "dependency") && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 8}
                textAnchor="middle"
                className="pointer-events-none fill-muted-foreground text-[12px]"
              >
                {edge.label ?? "يعتمد على"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}


function CanvasImage({ assetId, alt }: { assetId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    void getCanvasAsset(assetId)
      .then((asset) => {
        if (!active || !asset) {
          if (active) setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(asset.blob);
        if (active) setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        تعذر تحميل الصورة
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        جارٍ تحميل الصورة…
      </div>
    );
  }

  return <img src={url} alt={alt} draggable={false} className="h-full w-full object-contain" />;
}

function CanvasNodeCard({
  node,
  selected,
  connectorSource,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  node: CanvasNode;
  selected: boolean;
  connectorSource: boolean;
  onSelect: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: () => void;
}) {
  const icon =
    node.kind === "task" ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : node.kind === "milestone" ? (
      <Milestone className="h-4 w-4" />
    ) : node.kind === "note" || node.kind === "sticky" ? (
      <StickyNote className="h-4 w-4" />
    ) : node.kind === "text" ? (
      <Type className="h-4 w-4" />
    ) : node.kind === "rectangle" ? (
      <Square className="h-4 w-4" />
    ) : node.kind === "image" ? (
      <ImageIcon className="h-4 w-4" />
    ) : (
      <Circle className="h-4 w-4" />
    );

  const isText = node.kind === "text";
  const isShape = node.kind === "rectangle" || node.kind === "ellipse";
  const isSticky = node.kind === "sticky" || node.kind === "note";
  const isImage = node.kind === "image";
  const fill =
    node.style.fill === "transparent"
      ? "transparent"
      : `color-mix(in oklab, ${canvasColorVar(node.style.fill)} ${isSticky ? "30%" : "16%"}, transparent)`;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(event) => {
        onSelect(event);
        onDragStart(event);
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        backgroundColor: fill,
        borderColor: canvasColorVar(node.style.stroke),
        borderWidth: isShape ? 2 : isSticky ? 1 : undefined,
        borderStyle: isShape || isSticky ? "solid" : undefined,
        borderRadius: node.kind === "ellipse" ? "9999px" : undefined,
        boxShadow: isText ? "none" : undefined,
        overflow: isImage ? "hidden" : undefined,
        textAlign:
          node.style.text_align === "center"
            ? "center"
            : node.style.text_align === "end"
              ? "end"
              : "start",
      }}
      className={cn(
        "group select-none p-4 transition-shadow",
        !isText && !isShape && !isSticky && !isImage && "frost-strong rounded-2xl shadow-frost",
        isImage && "rounded-2xl bg-muted p-0 shadow-frost",
        isSticky && "rounded-xl shadow-frost",
        isShape && "flex flex-col justify-center",
        isText && "rounded-lg",
        selected && "ring-2 ring-brand shadow-lift",
        connectorSource && "ring-2 ring-info",
      )}
    >
      <span className={cn("mb-3 items-center gap-2 text-xs font-medium text-muted-foreground", isText || isImage ? "hidden" : "flex")}>
        {icon}
        {node.kind === "task"
          ? "مهمة"
          : node.kind === "milestone"
            ? "معلم"
            : node.kind === "note" || node.kind === "sticky"
              ? "ملاحظة"
              : node.kind === "text"
                ? "نص"
                : node.kind === "rectangle"
                  ? "مستطيل"
                  : node.kind === "ellipse"
                    ? "بيضاوي"
                    : node.kind === "image"
                      ? "صورة"
                      : "فكرة"}
      </span>
      {isImage && node.asset_id ? (
        <CanvasImage assetId={node.asset_id} alt={node.title} />
      ) : (
        <>
          <span
            className={cn("block leading-6", isText || isShape ? "font-medium" : "font-semibold")}
            style={{ fontSize: node.style.font_size }}
          >
            {node.title}
          </span>
          {node.description && (
            <span className="mt-1.5 block line-clamp-3 text-xs leading-5 text-muted-foreground">
              {node.description}
            </span>
          )}
        </>
      )}
      {isSemanticNode(node) && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", statusClass(node.status))}>
              {NODE_STATUS_OPTIONS.find((item) => item.value === node.status)?.label}
            </span>
            {node.priority && (
              <span className={cn("rounded-full px-2 py-0.5 font-medium", priorityClass(node.priority))}>
                {PRIORITY_OPTIONS.find((item) => item.value === node.priority)?.label}
              </span>
            )}
            {(node.progress > 0 || node.status === "in_progress" || node.status === "done") && (
              <span className="ms-auto text-muted-foreground">{Math.round(node.progress)}%</span>
            )}
          </div>
          {(node.owner || node.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              {node.owner && (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3 w-3" />
                  {node.owner}
                </span>
              )}
              {node.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5">
                  #{tag}
                </span>
              ))}
              {node.tags.length > 2 && <span>+{node.tags.length - 2}</span>}
            </div>
          )}
          {node.due_date && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CalendarRange className="h-3 w-3" />
              <span>الاستحقاق {formatLocalDate(node.due_date)}</span>
            </div>
          )}
          {(node.progress > 0 || node.status === "in_progress" || node.status === "done") && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, node.progress))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {selected && (
        <button
          type="button"
          aria-label="تغيير حجم العقدة"
          title="اسحب لتغيير الحجم"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          className="absolute -bottom-1.5 -end-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-background bg-brand shadow"
        />
      )}
    </div>
  );
}

function CanvasInspector({
  selectedNode,
  selectedNodesCount,
  selectedEdge,
  snapshot,
  snapToGrid,
  onNodeChange,
  onEdgeChange,
  onDelete,
  onDuplicate,
  onAddDependency,
  onRemoveDependency,
}: {
  selectedNode: CanvasNode | null | undefined;
  selectedNodesCount: number;
  selectedEdge: CanvasEdge | null;
  snapshot: BoardCanvasSnapshot;
  snapToGrid: boolean;
  onNodeChange: (patch: Partial<CanvasNode>) => void;
  onEdgeChange: (patch: Partial<CanvasEdge>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddDependency: (sourceNodeId: string, targetNodeId: string) => void;
  onRemoveDependency: (edgeId: string) => void;
}) {
  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-s border-border bg-card p-5 lg:block">
      {selectedNode ? (
        <NodeInspector
          node={selectedNode}
          snapshot={snapshot}
          onChange={onNodeChange}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onAddDependency={onAddDependency}
          onRemoveDependency={onRemoveDependency}
        />
      ) : selectedNodesCount > 1 ? (
        <>
          <h3 className="font-semibold">{selectedNodesCount} عناصر محددة</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            اسحب أي عنصر لتحريك المجموعة كاملة، أو استخدم الاختصارات للنسخ والتكرار والحذف.
          </p>
          <button
            onClick={onDuplicate}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Copy className="h-4 w-4" /> تكرار العناصر
          </button>
          <button
            onClick={onDelete}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 px-3 py-2 text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" /> حذف العناصر
          </button>
        </>
      ) : selectedEdge ? (
        <EdgeInspector edge={selectedEdge} onChange={onEdgeChange} onDelete={onDelete} />
      ) : (
        <>
          <h3 className="font-semibold">خصائص اللوحة</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            حدد عقدة أو رابطًا لعرض خصائصه. استخدم Shift لتحديد عدة عقد.
          </p>
          <div className="mt-6 space-y-2 text-sm text-muted-foreground">
            <p>العقد: {snapshot.nodes.length}</p>
            <p>الروابط: {snapshot.edges.length}</p>
            <p>الرسم الحر: {snapshot.strokes.length}</p>
            <p>التكبير: {Math.round(snapshot.viewport.zoom * 100)}٪</p>
            <p>المحاذاة: {snapToGrid ? "مفعّلة" : "متوقفة"}</p>
          </div>
          <div className="mt-6 rounded-2xl bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
            <strong className="text-foreground">اختصارات:</strong><br />
            V تحديد · H تحريك · N عقدة · L ربط<br />
            T نص · R مستطيل · O بيضاوي · S ملاحظة<br />
            P قلم · B تمييز · E ممحاة<br />
            Ctrl/Cmd+C نسخ · Ctrl/Cmd+V لصق · Ctrl/Cmd+D تكرار<br />
            Delete حذف · G شبكة · 0 ملاءمة
          </div>
        </>
      )}
    </aside>
  );
}

function NodeInspector({
  node,
  snapshot,
  onChange,
  onDelete,
  onDuplicate,
  onAddDependency,
  onRemoveDependency,
}: {
  node: CanvasNode;
  snapshot: BoardCanvasSnapshot;
  onChange: (patch: Partial<CanvasNode>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddDependency: (sourceNodeId: string, targetNodeId: string) => void;
  onRemoveDependency: (edgeId: string) => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? "");
  const [owner, setOwner] = useState(node.owner ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [dependencyTarget, setDependencyTarget] = useState("");

  const dependencies = snapshot.edges
    .filter((edge) => edge.kind === "dependency" && edge.source_node_id === node.id)
    .flatMap((edge) => {
      const target = snapshot.nodes.find((item) => item.id === edge.target_node_id);
      return target ? [{ edge, node: target }] : [];
    });
  const dependents = snapshot.edges
    .filter((edge) => edge.kind === "dependency" && edge.target_node_id === node.id)
    .flatMap((edge) => {
      const source = snapshot.nodes.find((item) => item.id === edge.source_node_id);
      return source ? [{ edge, node: source }] : [];
    });
  const dependencyIds = new Set(dependencies.map((item) => item.node.id));
  const dependencyOptions = snapshot.nodes.filter(
    (item) => item.id !== node.id && isSemanticNode(item) && !dependencyIds.has(item.id),
  );

  useEffect(() => {
    setTitle(node.title);
    setDescription(node.description ?? "");
    setOwner(node.owner ?? "");
    setTagDraft("");
    setDependencyTarget("");
  }, [node.id, node.title, node.description, node.owner]);

  return (
    <div>
      <h3 className="font-semibold">خصائص العنصر</h3>
      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs text-muted-foreground">العنوان</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              const value = title.trim();
              if (value && value !== node.title) onChange({ title: value });
              else setTitle(node.title);
            }}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs text-muted-foreground">الوصف</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => onChange({ description: description.trim() || null })}
            rows={4}
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <div>
          <span className="mb-2 block text-xs text-muted-foreground">النوع</span>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["idea", "فكرة"],
              ["task", "مهمة"],
              ["milestone", "معلم"],
              ["sticky", "ملاحظة"],
              ["text", "نص"],
              ["rectangle", "مستطيل"],
              ["ellipse", "بيضاوي"],
            ] as const).map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => onChange({ kind })}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  node.kind === kind
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {isSemanticNode(node) && (
          <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-3">
            <div>
              <span className="mb-2 block text-xs text-muted-foreground">الحالة</span>
              <div className="flex flex-wrap gap-1.5">
                {NODE_STATUS_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      onChange({
                        status: item.value,
                        progress:
                          item.value === "done"
                            ? 100
                            : node.progress === 100
                              ? 0
                              : node.progress,
                      })
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      node.status === item.value
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs text-muted-foreground">الأولوية</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onChange({ priority: null })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    node.priority === null
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted-foreground",
                  )}
                >
                  بدون
                </button>
                {PRIORITY_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onChange({ priority: item.value })}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      node.priority === item.value
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>نسبة الإنجاز</span>
                <span>{Math.round(node.progress)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={node.progress}
                onChange={(event) => {
                  const progress = Number(event.target.value);
                  onChange({
                    progress,
                    status:
                      progress === 100
                        ? "done"
                        : node.status === "done"
                          ? "in_progress"
                          : node.status,
                  });
                }}
                className="w-full accent-[var(--brand)]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" /> المالك
              </span>
              <input
                value={owner}
                placeholder="مثال: أحمد"
                onChange={(event) => setOwner(event.target.value)}
                onBlur={() => onChange({ owner: owner.trim() || null })}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
              />
            </label>

            <div>
              <span className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Tag className="h-3.5 w-3.5" /> الوسوم
              </span>
              <div className="flex flex-wrap gap-1.5">
                {node.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-[10px] text-brand"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`حذف وسم ${tag}`}
                      onClick={() => onChange({ tags: node.tags.filter((item) => item !== tag) })}
                      className="rounded-full hover:bg-brand/15"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {!node.tags.length && (
                  <span className="text-[10px] text-muted-foreground">لا توجد وسوم</span>
                )}
              </div>
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const tag = tagDraft.trim().replace(/\s+/g, " ").slice(0, 40);
                  if (!tag || node.tags.includes(tag) || node.tags.length >= 12) return;
                  onChange({ tags: [...node.tags, tag] });
                  setTagDraft("");
                }}
              >
                <input
                  value={tagDraft}
                  placeholder="أضف وسمًا"
                  onChange={(event) => setTagDraft(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-border px-2.5 text-xs hover:bg-muted"
                >
                  إضافة
                </button>
              </form>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted-foreground">تاريخ البداية</span>
                <input
                  type="date"
                  value={node.start_date ?? ""}
                  onChange={(event) =>
                    onChange({ start_date: event.target.value || null })
                  }
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted-foreground">الاستحقاق</span>
                <input
                  type="date"
                  value={node.due_date ?? ""}
                  onChange={(event) =>
                    onChange({ due_date: event.target.value || null })
                  }
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
                />
              </label>
            </div>
          </div>
        )}

        {isSemanticNode(node) && (
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-brand" />
              <div>
                <p className="text-xs font-semibold">الاعتمادات</p>
                <p className="text-[10px] text-muted-foreground">
                  هذا العنصر لا يبدأ قبل اكتمال العناصر التي يعتمد عليها.
                </p>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[10px] text-muted-foreground">يعتمد على</span>
              <div className="space-y-1.5">
                {dependencies.map((item) => (
                  <div
                    key={item.edge.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">{item.node.title}</span>
                    <button
                      type="button"
                      title="إزالة الاعتماد"
                      aria-label={`إزالة الاعتماد على ${item.node.title}`}
                      onClick={() => onRemoveDependency(item.edge.id)}
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Unlink2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!dependencies.length && (
                  <p className="text-[10px] text-muted-foreground">لا توجد اعتمادات.</p>
                )}
              </div>

              {dependencyOptions.length > 0 && (
                <select
                  value={dependencyTarget}
                  onChange={(event) => {
                    const targetId = event.target.value;
                    setDependencyTarget("");
                    if (targetId) onAddDependency(node.id, targetId);
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
                >
                  <option value="">+ أضف اعتمادًا…</option>
                  {dependencyOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {dependents.length > 0 && (
              <div>
                <span className="mb-1.5 block text-[10px] text-muted-foreground">يعتمد عليه</span>
                <div className="flex flex-wrap gap-1.5">
                  {dependents.map((item) => (
                    <span
                      key={item.edge.id}
                      className="rounded-full bg-info/10 px-2 py-1 text-[10px] text-info"
                    >
                      {item.node.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {node.kind !== "image" && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
          <div>
            <span className="mb-2 block text-xs text-muted-foreground">لون التعبئة</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                title="شفاف"
                aria-label="تعبئة شفافة"
                onClick={() => onChange({ style: { ...node.style, fill: "transparent" } })}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full border border-border text-[10px]",
                  node.style.fill === "transparent" && "ring-2 ring-brand",
                )}
              >
                ×
              </button>
              {DRAWING_COLORS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  title={item.label}
                  aria-label={`تعبئة ${item.label}`}
                  onClick={() => onChange({ style: { ...node.style, fill: item.value } })}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 border-background",
                    node.style.fill === item.value && "ring-2 ring-brand ring-offset-1 ring-offset-background",
                  )}
                  style={{ backgroundColor: canvasColorVar(item.value) }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs text-muted-foreground">لون الحدود</span>
            <div className="flex flex-wrap gap-1.5">
              {DRAWING_COLORS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  title={item.label}
                  aria-label={`حدود ${item.label}`}
                  onClick={() => onChange({ style: { ...node.style, stroke: item.value } })}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 border-background",
                    node.style.stroke === item.value && "ring-2 ring-brand ring-offset-1 ring-offset-background",
                  )}
                  style={{ backgroundColor: canvasColorVar(item.value) }}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>حجم الخط</span>
              <span>{Math.round(node.style.font_size)}px</span>
            </span>
            <input
              type="range"
              min={10}
              max={48}
              value={node.style.font_size}
              onChange={(event) =>
                onChange({
                  style: { ...node.style, font_size: Number(event.target.value) },
                })
              }
              className="w-full accent-[var(--brand)]"
            />
          </label>

          <div>
            <span className="mb-2 block text-xs text-muted-foreground">محاذاة النص</span>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ["start", "بداية"],
                ["center", "وسط"],
                ["end", "نهاية"],
              ] as const).map(([align, label]) => (
                <button
                  key={align}
                  type="button"
                  onClick={() =>
                    onChange({ style: { ...node.style, text_align: align } })
                  }
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs",
                    node.style.text_align === align
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        )}

        <button
          onClick={onDuplicate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <Copy className="h-4 w-4" /> تكرار
        </button>
        <button
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 px-3 py-2 text-sm text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" /> حذف العقدة
        </button>
      </div>
    </div>
  );
}

function EdgeInspector({
  edge,
  onChange,
  onDelete,
}: {
  edge: CanvasEdge;
  onChange: (patch: Partial<CanvasEdge>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(edge.label ?? "");

  useEffect(() => setLabel(edge.label ?? ""), [edge.id, edge.label]);

  return (
    <div>
      <h3 className="font-semibold">خصائص الرابط</h3>
      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs text-muted-foreground">التسمية</span>
          <input
            value={label}
            placeholder="مثال: يعتمد على"
            onChange={(event) => setLabel(event.target.value)}
            onBlur={() => onChange({ label: label.trim() || null })}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <div>
          <span className="mb-2 block text-xs text-muted-foreground">نوع العلاقة</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChange({ kind: "relationship" })}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                edge.kind === "relationship"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border hover:bg-muted",
              )}
            >
              علاقة
            </button>
            <button
              onClick={() => onChange({ kind: "dependency" })}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                edge.kind === "dependency"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border hover:bg-muted",
              )}
            >
              اعتماد
            </button>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 px-3 py-2 text-sm text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" /> حذف الرابط
        </button>
      </div>
    </div>
  );
}

function EmptyCanvas({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
      <div className="frost pointer-events-auto max-w-md rounded-3xl p-7 text-center shadow-frost">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Plus className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold">ابدأ خريطتك الأولى</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          انقر مرتين في أي مكان، أو استخدم N، لإضافة أول فكرة.
        </p>
        <button
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> إضافة أول فكرة
        </button>
      </div>
    </div>
  );
}

function ZoomControls({
  zoom,
  saveState,
  canUndo,
  canRedo,
  onZoomOut,
  onZoomIn,
  onFit,
  onUndo,
  onRedo,
}: {
  zoom: number;
  saveState: "saved" | "saving" | "error";
  canUndo: boolean;
  canRedo: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="frost absolute bottom-4 end-4 z-20 hidden items-center gap-1 rounded-xl p-1 md:flex">
      <span
        className={cn(
          "me-1 rounded-lg px-2 py-1 text-[11px]",
          saveState === "saved"
            ? "text-success"
            : saveState === "error"
              ? "text-danger"
              : "text-warning",
        )}
      >
        {saveState === "saved" ? "محفوظ" : saveState === "error" ? "خطأ بالحفظ" : "يحفظ…"}
      </span>
      <button onClick={onUndo} disabled={!canUndo} aria-label="تراجع" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-35"><Undo2 className="h-4 w-4" /></button>
      <button onClick={onRedo} disabled={!canRedo} aria-label="إعادة" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-35"><Redo2 className="h-4 w-4" /></button>
      <button onClick={onZoomOut} aria-label="تصغير" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><ZoomOut className="h-4 w-4" /></button>
      <span className="min-w-14 px-2 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}٪</span>
      <button onClick={onZoomIn} aria-label="تكبير" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><ZoomIn className="h-4 w-4" /></button>
      <button onClick={onFit} aria-label="ملاءمة" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><Maximize className="h-4 w-4" /></button>
    </div>
  );
}

function CanvasContextMenu({
  state,
  hasSelection,
  canPaste,
  onClose,
  onAdd,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
}: {
  state: NonNullable<ContextMenuState>;
  hasSelection: boolean;
  canPaste: boolean;
  onClose: () => void;
  onAdd: (kind: CanvasNode["kind"]) => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      className="frost-strong fixed z-50 min-w-52 rounded-2xl p-1.5 shadow-lift"
      style={{ left: Math.min(state.x, window.innerWidth - 230), top: Math.min(state.y, window.innerHeight - 310) }}
    >
      {!state.nodeId && (
        <>
          <ContextItem icon={Circle} label="إضافة فكرة" onClick={() => onAdd("idea")} />
          <ContextItem icon={CheckCircle2} label="إضافة مهمة" onClick={() => onAdd("task")} />
          <ContextItem icon={Milestone} label="إضافة معلم" onClick={() => onAdd("milestone")} />
          <ContextItem icon={StickyNote} label="إضافة ملاحظة لاصقة" onClick={() => onAdd("sticky")} />
          <ContextItem icon={Type} label="إضافة نص" onClick={() => onAdd("text")} />
          <ContextItem icon={Square} label="إضافة مستطيل" onClick={() => onAdd("rectangle")} />
          <ContextItem icon={Circle} label="إضافة شكل بيضاوي" onClick={() => onAdd("ellipse")} />
          <div className="my-1 h-px bg-border" />
        </>
      )}
      <ContextItem icon={Copy} label="نسخ" shortcut="Ctrl+C" disabled={!hasSelection} onClick={onCopy} />
      <ContextItem icon={Scissors} label="لصق" shortcut="Ctrl+V" disabled={!canPaste} onClick={onPaste} />
      <ContextItem icon={Plus} label="تكرار" shortcut="Ctrl+D" disabled={!hasSelection} onClick={onDuplicate} />
      {hasSelection && (
        <>
          <div className="my-1 h-px bg-border" />
          <ContextItem icon={Trash2} label="حذف" shortcut="Del" danger onClick={onDelete} />
        </>
      )}
    </div>
  );
}

function ContextItem({
  icon: Icon,
  label,
  shortcut,
  disabled,
  danger,
  onClick,
}: {
  icon: typeof Circle;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-35",
        danger && "text-danger",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {shortcut && <span className="ms-auto text-[10px] text-muted-foreground">{shortcut}</span>}
    </button>
  );
}
