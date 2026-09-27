import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Hand,
  MousePointer2,
  Circle,
  Type,
  Square,
  Spline,
  Pencil,
  Image,
  Undo2,
  Redo2,
  Share2,
  ZoomIn,
  ZoomOut,
  Maximize,
  PanelLeft,
  Trash2,
  Plus,
  CheckCircle2,
  Milestone,
  StickyNote,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useBoard, useMarkBoardOpened } from "@/hooks/use-boards";
import { useBoardCanvas, useSaveBoardCanvas } from "@/hooks/use-canvas";
import { BOARD_TYPE_LABELS } from "@/lib/labels";
import { NotFoundState } from "@/components/app/shared";
import { createCanvasEdge, createCanvasNode } from "@/services/canvas.service";
import { cn } from "@/lib/utils";
import type { BoardCanvasSnapshot, CanvasNode, CanvasViewport } from "@/types";

export const Route = createFileRoute("/workspace/$workspaceId/project/$projectId/board/$boardId")({
  head: () => ({
    meta: [
      { title: "اللوحة — ProjectFlow" },
      { name: "description", content: "مساحة التخطيط البصري للوحة." },
      { property: "og:title", content: "اللوحة — ProjectFlow" },
      { property: "og:description", content: "مساحة التخطيط البصري للوحة." },
    ],
  }),
  component: BoardPage,
});

type Tool = "select" | "hand" | "node" | "connector";
type DragState =
  | { type: "pan"; pointerX: number; pointerY: number; start: CanvasViewport }
  | { type: "node"; pointerX: number; pointerY: number; nodeId: string; startX: number; startY: number; before: BoardCanvasSnapshot }
  | null;

const cloneSnapshot = (value: BoardCanvasSnapshot): BoardCanvasSnapshot =>
  typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

function Disabled({ label, icon: Icon }: { label: string; icon: typeof Undo2 }) {
  return (
    <button
      disabled
      title={`${label} (قريبًا)`}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function BoardPage() {
  const { boardId, workspaceId, projectId } = Route.useParams();
  const { data: board, isLoading } = useBoard(boardId);
  const { data: loadedCanvas, isLoading: canvasLoading } = useBoardCanvas(boardId);
  const saveCanvas = useSaveBoardCanvas(boardId);
  const markOpened = useMarkBoardOpened();

  const [inspector, setInspector] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [snapshot, setSnapshot] = useState<BoardCanvasSnapshot | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  const marked = useRef<string | null>(null);
  const drag = useRef<DragState>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const past = useRef<BoardCanvasSnapshot[]>([]);
  const future = useRef<BoardCanvasSnapshot[]>([]);
  const initializedBoard = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const valid = !!board && board.workspace_id === workspaceId && board.project_id === projectId;

  useEffect(() => {
    if (valid && marked.current !== boardId) {
      marked.current = boardId;
      markOpened.mutate(boardId);
    }
  }, [valid, boardId, markOpened]);

  useEffect(() => {
    if (!loadedCanvas || initializedBoard.current === boardId) return;
    initializedBoard.current = boardId;
    setSnapshot(cloneSnapshot(loadedCanvas));
    past.current = [];
    future.current = [];
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

  const selectedNode = useMemo(
    () => snapshot?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [snapshot, selectedNodeId],
  );

  function commit(next: BoardCanvasSnapshot, recordHistory = true) {
    if (recordHistory && snapshot) {
      past.current.push(cloneSnapshot(snapshot));
      if (past.current.length > 60) past.current.shift();
      future.current = [];
    }
    setSnapshot(next);
  }

  function updateNode(nodeId: string, patch: Partial<CanvasNode>, recordHistory = true) {
    if (!snapshot) return;
    const now = new Date().toISOString();
    const next = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...patch, updated_at: now } : node,
      ),
    };
    commit(next, recordHistory);
  }

  function addNodeAt(clientX: number, clientY: number, kind: CanvasNode["kind"] = "idea") {
    if (!snapshot || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - snapshot.viewport.x) / snapshot.viewport.zoom;
    const y = (clientY - rect.top - snapshot.viewport.y) / snapshot.viewport.zoom;
    const node = createCanvasNode(boardId, { x: x - 110, y: y - 55 }, kind);
    commit({ ...snapshot, nodes: [...snapshot.nodes, node] });
    setSelectedNodeId(node.id);
    setTool("select");
  }

  function deleteSelected() {
    if (!snapshot || !selectedNodeId) return;
    commit({
      ...snapshot,
      nodes: snapshot.nodes.filter((node) => node.id !== selectedNodeId),
      edges: snapshot.edges.filter(
        (edge) => edge.source_node_id !== selectedNodeId && edge.target_node_id !== selectedNodeId,
      ),
    });
    setSelectedNodeId(null);
    setConnectorSourceId(null);
  }

  function undo() {
    if (!snapshot || !past.current.length) return;
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(cloneSnapshot(snapshot));
    setSnapshot(previous);
    setSelectedNodeId(null);
  }

  function redo() {
    if (!snapshot || !future.current.length) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(cloneSnapshot(snapshot));
    setSnapshot(next);
    setSelectedNodeId(null);
  }

  function setZoom(nextZoom: number, anchor?: { x: number; y: number }) {
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
  }

  function fitView() {
    if (!snapshot || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (!snapshot.nodes.length) {
      setSnapshot({ ...snapshot, viewport: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    const padding = 120;
    const minX = Math.min(...snapshot.nodes.map((n) => n.x));
    const minY = Math.min(...snapshot.nodes.map((n) => n.y));
    const maxX = Math.max(...snapshot.nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...snapshot.nodes.map((n) => n.y + n.height));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zoom = Math.min(1.5, Math.max(0.25, Math.min((rect.width - padding) / width, (rect.height - padding) / height)));
    setSnapshot({
      ...snapshot,
      viewport: {
        zoom,
        x: (rect.width - width * zoom) / 2 - minX * zoom,
        y: (rect.height - height * zoom) / 2 - minY * zoom,
      },
    });
  }

  function handleNodeClick(nodeId: string) {
    if (!snapshot) return;
    if (tool === "connector") {
      if (!connectorSourceId) {
        setConnectorSourceId(nodeId);
        setSelectedNodeId(nodeId);
        return;
      }
      if (connectorSourceId === nodeId) {
        setConnectorSourceId(null);
        return;
      }
      const duplicate = snapshot.edges.some(
        (edge) =>
          edge.source_node_id === connectorSourceId && edge.target_node_id === nodeId,
      );
      if (!duplicate) {
        commit({
          ...snapshot,
          edges: [...snapshot.edges, createCanvasEdge(boardId, connectorSourceId, nodeId)],
        });
      }
      setConnectorSourceId(null);
      setTool("select");
      setSelectedNodeId(nodeId);
      return;
    }
    setSelectedNodeId(nodeId);
  }

  if (!isLoading && !valid) {
    return <div className="p-8"><NotFoundState /></div>;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="frost hairline-b z-20 flex h-14 items-center gap-2 px-3">
        <Link
          to="/workspace/$workspaceId/project/$projectId"
          params={{ workspaceId, projectId }}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
          aria-label="رجوع"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">{board?.name ?? "…"}</p>
          {board && (
            <nav aria-label="مسار التنقل" className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">الرئيسية</Link><span>/</span>
              <Link to="/workspace/$workspaceId" params={{ workspaceId }} className="truncate hover:text-foreground">{board.workspace_name}</Link><span>/</span>
              <Link to="/workspace/$workspaceId/project/$projectId" params={{ workspaceId, projectId }} className="truncate hover:text-foreground">{board.project_name}</Link>
              <span className="hidden sm:inline">· {BOARD_TYPE_LABELS[board.board_type]}</span>
            </nav>
          )}
        </div>

        <span className={cn(
          "ms-3 hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-xs sm:flex",
          saveState === "saved"
            ? "bg-success/15 text-success"
            : saveState === "error"
              ? "bg-danger/15 text-danger"
              : "bg-warning/15 text-warning",
        )}>
          {saveState === "saved" && <CheckCircle2 className="h-3 w-3" />}
          {saveState === "saved" ? "تم الحفظ" : saveState === "error" ? "تعذر الحفظ" : "جارٍ الحفظ…"}
        </span>

        <div className="ms-auto flex items-center">
          <button onClick={undo} disabled={!past.current.length} title="تراجع" aria-label="تراجع" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-35"><Undo2 className="h-4 w-4" /></button>
          <button onClick={redo} disabled={!future.current.length} title="إعادة" aria-label="إعادة" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-35"><Redo2 className="h-4 w-4" /></button>
          <Disabled label="مشاركة" icon={Share2} />
          <button onClick={() => setInspector((v) => !v)} aria-label="لوحة الخصائص" className="hidden h-9 w-9 place-items-center rounded-lg hover:bg-muted lg:grid"><PanelLeft className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="frost-strong absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-2xl p-1.5 md:bottom-auto md:left-auto md:start-4 md:top-1/2 md:translate-x-0 md:-translate-y-1/2 md:flex-col">
          <ToolButton active={tool === "select"} label="تحديد" icon={MousePointer2} onClick={() => { setTool("select"); setConnectorSourceId(null); }} />
          <ToolButton active={tool === "hand"} label="تحريك" icon={Hand} onClick={() => { setTool("hand"); setConnectorSourceId(null); }} />
          <ToolButton active={tool === "node"} label="عقدة" icon={Circle} onClick={() => { setTool("node"); setConnectorSourceId(null); }} />
          <ToolButton active={tool === "connector"} label="موصل" icon={Spline} onClick={() => { setTool("connector"); setConnectorSourceId(null); }} />
          <Disabled label="نص" icon={Type} />
          <Disabled label="شكل" icon={Square} />
          <Disabled label="رسم" icon={Pencil} />
          <Disabled label="صورة" icon={Image} />
        </div>

        <div
          ref={canvasRef}
          className={cn(
            "canvas-grid relative flex flex-1 overflow-hidden touch-none",
            tool === "hand" ? "cursor-grab active:cursor-grabbing" : tool === "node" ? "cursor-crosshair" : "cursor-default",
          )}
          onWheel={(event) => {
            if (!snapshot) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setZoom(snapshot.viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1), {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }}
          onDoubleClick={(event) => {
            if (event.target === event.currentTarget) addNodeAt(event.clientX, event.clientY);
          }}
          onPointerDown={(event) => {
            if (!snapshot) return;
            if (event.target !== event.currentTarget) return;
            if (tool === "node") {
              addNodeAt(event.clientX, event.clientY);
              return;
            }
            if (tool === "select") {
              setSelectedNodeId(null);
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
            if (!snapshot || drag.current?.type !== "pan") return;
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
            if (drag.current?.type === "pan") drag.current = null;
          }}
        >
          {snapshot && (
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${snapshot.viewport.x}px, ${snapshot.viewport.y}px) scale(${snapshot.viewport.zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg className="pointer-events-none absolute left-0 top-0 overflow-visible">
                <defs>
                  <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
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
                  return (
                    <path
                      key={edge.id}
                      d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      className="stroke-muted-foreground/65"
                      strokeWidth="2"
                      markerEnd="url(#canvas-arrow)"
                    />
                  );
                })}
              </svg>

              {snapshot.nodes.map((node) => (
                <CanvasNodeCard
                  key={node.id}
                  node={node}
                  selected={selectedNodeId === node.id}
                  connectorSource={connectorSourceId === node.id}
                  zoom={snapshot.viewport.zoom}
                  onClick={() => handleNodeClick(node.id)}
                  onDragStart={(event) => {
                    if (tool !== "select") return;
                    event.stopPropagation();
                    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                    drag.current = {
                      type: "node",
                      pointerX: event.clientX,
                      pointerY: event.clientY,
                      nodeId: node.id,
                      startX: node.x,
                      startY: node.y,
                      before: cloneSnapshot(snapshot),
                    };
                    setSelectedNodeId(node.id);
                  }}
                  onDragMove={(event) => {
                    if (!snapshot || drag.current?.type !== "node" || drag.current.nodeId !== node.id) return;
                    const d = drag.current;
                    const dx = (event.clientX - d.pointerX) / snapshot.viewport.zoom;
                    const dy = (event.clientY - d.pointerY) / snapshot.viewport.zoom;
                    updateNode(node.id, { x: d.startX + dx, y: d.startY + dy }, false);
                  }}
                  onDragEnd={() => {
                    if (drag.current?.type !== "node" || drag.current.nodeId !== node.id) return;
                    past.current.push(drag.current.before);
                    if (past.current.length > 60) past.current.shift();
                    future.current = [];
                    drag.current = null;
                    setSnapshot((current) => current ? { ...current } : current);
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                />
              ))}
            </div>
          )}

          {!canvasLoading && snapshot && snapshot.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="frost pointer-events-auto max-w-md rounded-3xl p-7 text-center shadow-frost">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <Plus className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold">ابدأ خريطتك الأولى</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  انقر مرتين في أي مكان، أو اختر أداة «عقدة»، لإضافة أول فكرة إلى مساحة العمل.
                </p>
                <button
                  onClick={() => {
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (rect) addNodeAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> إضافة أول فكرة
                </button>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="frost absolute bottom-4 end-4 z-20 hidden items-center gap-1 rounded-xl p-1 md:flex">
              <button onClick={() => setZoom(snapshot.viewport.zoom * 0.9)} aria-label="تصغير" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><ZoomOut className="h-4 w-4" /></button>
              <span className="min-w-14 px-2 text-center text-xs text-muted-foreground">{Math.round(snapshot.viewport.zoom * 100)}٪</span>
              <button onClick={() => setZoom(snapshot.viewport.zoom * 1.1)} aria-label="تكبير" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><ZoomIn className="h-4 w-4" /></button>
              <button onClick={fitView} aria-label="ملاءمة" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><Maximize className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        {inspector && (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-s border-border bg-card p-5 lg:block">
            {selectedNode ? (
              <NodeInspector
                node={selectedNode}
                onChange={(patch) => updateNode(selectedNode.id, patch)}
                onDelete={deleteSelected}
              />
            ) : (
              <>
                <h3 className="font-semibold">خصائص اللوحة</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  حدد عقدة لعرض خصائصها وتعديل محتواها.
                </p>
                <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                  <p>العقد: {snapshot?.nodes.length ?? 0}</p>
                  <p>الروابط: {snapshot?.edges.length ?? 0}</p>
                  <p>التكبير: {Math.round((snapshot?.viewport.zoom ?? 1) * 100)}٪</p>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof MousePointer2;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-xl transition",
        active ? "bg-brand text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function CanvasNodeCard({
  node,
  selected,
  connectorSource,
  onClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPointerCancel,
}: {
  node: CanvasNode;
  selected: boolean;
  connectorSource: boolean;
  zoom: number;
  onClick: () => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onPointerCancel: () => void;
}) {
  const icon =
    node.kind === "task" ? <CheckCircle2 className="h-4 w-4" /> :
    node.kind === "milestone" ? <Milestone className="h-4 w-4" /> :
    node.kind === "note" ? <StickyNote className="h-4 w-4" /> :
    <Circle className="h-4 w-4" />;

  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onPointerCancel}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        minHeight: node.height,
      }}
      className={cn(
        "frost-strong select-none rounded-2xl p-4 text-start shadow-frost transition-shadow",
        selected && "ring-2 ring-brand shadow-lift",
        connectorSource && "ring-2 ring-info",
      )}
    >
      <span className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {node.kind === "task" ? "مهمة" : node.kind === "milestone" ? "معلم" : node.kind === "note" ? "ملاحظة" : "فكرة"}
      </span>
      <span className="block font-semibold leading-6">{node.title}</span>
      {node.description && <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{node.description}</span>}
    </button>
  );
}

function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: CanvasNode;
  onChange: (patch: Partial<CanvasNode>) => void;
  onDelete: () => void;
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
                  node.kind === kind ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
