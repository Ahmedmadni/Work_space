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
  CheckCircle2,
  Circle,
  Copy,
  Hand,
  Link2,
  Maximize,
  Milestone,
  MousePointer2,
  Pencil,
  Highlighter,
  Eraser,
  Plus,
  Redo2,
  Scissors,
  StickyNote,
  Type,
  Square,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useBoardCanvas, useSaveBoardCanvas } from "@/hooks/use-canvas";
import { createCanvasEdge, createCanvasNode } from "@/services/canvas.service";
import { cn } from "@/lib/utils";
import type {
  BoardCanvasSnapshot,
  CanvasColor,
  CanvasEdge,
  CanvasNode,
  CanvasStroke,
  CanvasViewport,
} from "@/types";

type Tool =
  | "select"
  | "hand"
  | "node"
  | "connector"
  | "text"
  | "rectangle"
  | "ellipse"
  | "sticky"
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

  const canvasRef = useRef<HTMLDivElement | null>(null);
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
    if (!snapshot.nodes.length) {
      setSnapshot({ ...snapshot, viewport: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    const padding = 140;
    const minX = Math.min(...snapshot.nodes.map((n) => n.x));
    const minY = Math.min(...snapshot.nodes.map((n) => n.y));
    const maxX = Math.max(...snapshot.nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...snapshot.nodes.map((n) => n.y + n.height));
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
      <CanvasToolbar
        tool={tool}
        snapToGrid={snapToGrid}
        onTool={(next) => {
          setTool(next);
          if (next !== "connector") setConnectorSourceId(null);
        }}
        onToggleSnap={() => setSnapToGrid((value) => !value)}
      />

      {(tool === "pen" || tool === "highlighter") && (
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
            snapshot={snapshot}
            selectedEdgeId={selectedEdgeId}
            onSelect={(edgeId) => {
              setSelectedEdgeId(edgeId);
              setSelectedNodeIds([]);
            }}
          />

          {snapshot.nodes.map((node) => (
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

        {!snapshot.nodes.length && !snapshot.strokes.length && (
          <EmptyCanvas
            onAdd={() => {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) addNodeAtScreen(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
          />
        )}

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

      {(selectedNodeIds.length > 0 || selectedEdgeId) && (
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
      />

      {contextMenu && (
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
    { id: "pen", label: "قلم", icon: Pencil, shortcut: "P" },
    { id: "highlighter", label: "تمييز", icon: Highlighter, shortcut: "B" },
    { id: "eraser", label: "ممحاة", icon: Eraser, shortcut: "E" },
  ];
  return (
    <div className="frost-strong absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-2xl p-1.5 md:bottom-auto md:left-auto md:start-4 md:top-1/2 md:translate-x-0 md:-translate-y-1/2 md:flex-col">
      {tools.map(({ id, label, icon: Icon, shortcut }) => (
        <button
          key={id}
          title={`${label} (${shortcut})`}
          aria-label={label}
          aria-pressed={tool === id}
          onClick={() => onTool(id)}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl transition",
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
                selectedEdgeId === edge.id ? "stroke-brand" : "stroke-muted-foreground/65",
              )}
              strokeWidth={selectedEdgeId === edge.id ? 3 : 2}
              markerEnd="url(#canvas-arrow)"
            />
            {edge.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 8}
                textAnchor="middle"
                className="pointer-events-none fill-muted-foreground text-[12px]"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
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
    ) : node.kind === "note" ? (
      <StickyNote className="h-4 w-4" />
    ) : (
      <Circle className="h-4 w-4" />
    );

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
      }}
      className={cn(
        "frost-strong group select-none rounded-2xl p-4 text-start shadow-frost transition-shadow",
        selected && "ring-2 ring-brand shadow-lift",
        connectorSource && "ring-2 ring-info",
      )}
    >
      <span className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {node.kind === "task"
          ? "مهمة"
          : node.kind === "milestone"
            ? "معلم"
            : node.kind === "note"
              ? "ملاحظة"
              : "فكرة"}
      </span>
      <span className="block font-semibold leading-6">{node.title}</span>
      {node.description && (
        <span className="mt-1.5 block line-clamp-3 text-xs leading-5 text-muted-foreground">
          {node.description}
        </span>
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
}) {
  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-s border-border bg-card p-5 lg:block">
      {selectedNode ? (
        <NodeInspector
          node={selectedNode}
          onChange={onNodeChange}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
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
  onChange,
  onDelete,
  onDuplicate,
}: {
  node: CanvasNode;
  onChange: (patch: Partial<CanvasNode>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? "");

  useEffect(() => {
    setTitle(node.title);
    setDescription(node.description ?? "");
  }, [node.id, node.title, node.description]);

  return (
    <div>
      <h3 className="font-semibold">خصائص العقدة</h3>
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
              ["note", "ملاحظة"],
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
          <ContextItem icon={StickyNote} label="إضافة ملاحظة" onClick={() => onAdd("note")} />
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
