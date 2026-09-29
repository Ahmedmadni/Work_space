import { isSupabaseBackend } from "@/lib/backend-config";
import {
  getBoardCanvas,
  normalizeBoardCanvasSnapshot,
  saveBoardCanvas as saveLegacyBoardCanvas,
} from "@/services/canvas.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  BoardCanvasSnapshot,
  CanvasEdge,
  CanvasNode,
  CanvasStroke,
  CanvasViewport,
} from "@/types";
import type {
  CanvasConflict,
  CanvasOperation,
  CanvasSaveResult,
} from "@/types/realtime-canvas";

const CLIENT_ID_KEY = "projectflow.canvas.client-id.v1";

function uuidFallback() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function getCanvasClientId() {
  if (typeof window === "undefined") return uuidFallback();
  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : uuidFallback();
    window.sessionStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : uuidFallback();
  }
}

function entityVersion(value: { version?: number }) {
  return typeof value.version === "number" && Number.isFinite(value.version)
    ? Math.max(1, Math.floor(value.version))
    : 1;
}

function comparableNode(node: CanvasNode) {
  const { updated_at: _updatedAt, version: _version, ...rest } = node;
  return rest;
}

function comparableEdge(edge: CanvasEdge) {
  const { updated_at: _updatedAt, version: _version, ...rest } = edge;
  return rest;
}

function comparableStroke(stroke: CanvasStroke) {
  const { updated_at: _updatedAt, version: _version, ...rest } = stroke;
  return rest;
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffCollection<T extends { id: string; version?: number }>(
  baseItems: T[],
  nextItems: T[],
  type: "node" | "edge" | "stroke",
  comparable: (item: T) => unknown,
): CanvasOperation[] {
  const base = new Map(baseItems.map((item) => [item.id, item] as const));
  const next = new Map(nextItems.map((item) => [item.id, item] as const));
  const operations: CanvasOperation[] = [];

  for (const item of nextItems) {
    const previous = base.get(item.id);
    if (!previous) {
      operations.push({
        op: `${type}_create` as
          | "node_create"
          | "edge_create"
          | "stroke_create",
        entity: item,
      } as unknown as CanvasOperation);
      continue;
    }
    if (!sameJson(comparable(previous), comparable(item))) {
      operations.push({
        op: `${type}_update` as
          | "node_update"
          | "edge_update"
          | "stroke_update",
        entity: item,
        expected_version: entityVersion(previous),
      } as unknown as CanvasOperation);
    }
  }

  for (const item of baseItems) {
    if (next.has(item.id)) continue;
    operations.push({
      op: `${type}_delete` as
        | "node_delete"
        | "edge_delete"
        | "stroke_delete",
      id: item.id,
      expected_version: entityVersion(item),
    } as unknown as CanvasOperation);
  }

  return operations;
}

export function diffBoardCanvas(
  base: BoardCanvasSnapshot,
  next: BoardCanvasSnapshot,
): CanvasOperation[] {
  return [
    ...diffCollection(
      base.nodes,
      next.nodes,
      "node",
      comparableNode,
    ),
    ...diffCollection(
      base.edges,
      next.edges,
      "edge",
      comparableEdge,
    ),
    ...diffCollection(
      base.strokes,
      next.strokes,
      "stroke",
      comparableStroke,
    ),
  ];
}

function sameViewport(a: CanvasViewport, b: CanvasViewport) {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

export async function saveBoardViewport(
  boardId: string,
  viewport: CanvasViewport,
): Promise<void> {
  if (!isSupabaseBackend()) return;
  await supabaseRest<null>("rpc/save_board_viewport", {
    method: "POST",
    body: {
      p_board_id: boardId,
      p_viewport: viewport,
    },
  });
}

function normalizeConflicts(value: unknown): CanvasConflict[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const entityType =
      raw.entity_type === "node" ||
      raw.entity_type === "edge" ||
      raw.entity_type === "stroke"
        ? raw.entity_type
        : null;
    const reason =
      raw.reason === "already_exists" ||
      raw.reason === "missing" ||
      raw.reason === "version_mismatch"
        ? raw.reason
        : null;
    if (!entityType || !reason || typeof raw.id !== "string") return [];
    return [{
      entity_type: entityType,
      id: raw.id,
      reason,
      expected_version:
        typeof raw.expected_version === "number"
          ? raw.expected_version
          : null,
      actual_version:
        typeof raw.actual_version === "number"
          ? raw.actual_version
          : null,
    }];
  });
}

export async function saveCollaborativeBoardCanvas(
  next: BoardCanvasSnapshot,
  baseSnapshot?: BoardCanvasSnapshot | null,
  clientId = getCanvasClientId(),
): Promise<CanvasSaveResult> {
  if (!isSupabaseBackend()) {
    const snapshot = await saveLegacyBoardCanvas(next);
    return {
      snapshot,
      conflicts: [],
      applied_count: 1,
      revision: snapshot.revision ?? 0,
    };
  }

  const base = baseSnapshot ?? (await getBoardCanvas(next.board_id));
  const operations = diffBoardCanvas(base, next);
  const viewportChanged = !sameViewport(base.viewport, next.viewport);

  if (viewportChanged) {
    await saveBoardViewport(next.board_id, next.viewport);
  }

  if (!operations.length) {
    return {
      snapshot: {
        ...base,
        viewport: next.viewport,
      },
      conflicts: [],
      applied_count: 0,
      revision: base.revision ?? 0,
    };
  }

  const raw = await supabaseRest<Record<string, unknown>>(
    "rpc/apply_board_canvas_operations",
    {
      method: "POST",
      body: {
        p_board_id: next.board_id,
        p_client_id: clientId,
        p_base_revision: base.revision ?? 0,
        p_operations: operations,
      },
    },
  );

  const snapshot = normalizeBoardCanvasSnapshot(
    next.board_id,
    raw.snapshot,
  );
  snapshot.viewport = next.viewport;

  return {
    snapshot,
    conflicts: normalizeConflicts(raw.conflicts),
    applied_count:
      typeof raw.applied_count === "number" ? raw.applied_count : 0,
    revision:
      typeof raw.revision === "number"
        ? raw.revision
        : snapshot.revision ?? 0,
  };
}


function findEntityVersion(
  snapshot: BoardCanvasSnapshot,
  type: "node" | "edge" | "stroke",
  id: string,
) {
  const items =
    type === "node"
      ? snapshot.nodes
      : type === "edge"
        ? snapshot.edges
        : snapshot.strokes;
  return entityVersion(items.find((item) => item.id === id) ?? { version: 1 });
}

export function rebaseLocalCanvasChanges(
  authoritative: BoardCanvasSnapshot,
  sentSnapshot: BoardCanvasSnapshot,
  currentLocal: BoardCanvasSnapshot,
): { snapshot: BoardCanvasSnapshot; conflicts: CanvasConflict[] } {
  const operations = diffBoardCanvas(sentSnapshot, currentLocal);
  const conflicts: CanvasConflict[] = [];
  const rebased = normalizeBoardCanvasSnapshot(
    authoritative.board_id,
    authoritative,
  );
  rebased.viewport = currentLocal.viewport;

  const nodeMap = new Map(rebased.nodes.map((item) => [item.id, item] as const));
  const edgeMap = new Map(rebased.edges.map((item) => [item.id, item] as const));
  const strokeMap = new Map(
    rebased.strokes.map((item) => [item.id, item] as const),
  );

  for (const operation of operations) {
    const type = operation.op.startsWith("node_")
      ? "node"
      : operation.op.startsWith("edge_")
        ? "edge"
        : "stroke";
    const id =
      "entity" in operation ? operation.entity.id : operation.id;
    const previousVersion = findEntityVersion(sentSnapshot, type, id);
    const remoteVersion = findEntityVersion(authoritative, type, id);

    if (
      operation.op.endsWith("_update") ||
      operation.op.endsWith("_delete")
    ) {
      const remoteExists =
        type === "node"
          ? authoritative.nodes.some((item) => item.id === id)
          : type === "edge"
            ? authoritative.edges.some((item) => item.id === id)
            : authoritative.strokes.some((item) => item.id === id);

      if (!remoteExists || remoteVersion !== previousVersion) {
        conflicts.push({
          entity_type: type,
          id,
          reason: remoteExists ? "version_mismatch" : "missing",
          expected_version: previousVersion,
          actual_version: remoteExists ? remoteVersion : null,
        });
        continue;
      }
    }

    if (operation.op === "node_create") {
      if (!nodeMap.has(operation.entity.id)) {
        nodeMap.set(operation.entity.id, operation.entity);
      }
    } else if (operation.op === "node_update") {
      const remote = nodeMap.get(operation.entity.id);
      if (remote) {
        nodeMap.set(operation.entity.id, {
          ...operation.entity,
          version: remote.version,
        });
      }
    } else if (operation.op === "node_delete") {
      nodeMap.delete(operation.id);
      for (const [edgeId, edge] of edgeMap) {
        if (
          edge.source_node_id === operation.id ||
          edge.target_node_id === operation.id
        ) {
          edgeMap.delete(edgeId);
        }
      }
    } else if (operation.op === "edge_create") {
      if (!edgeMap.has(operation.entity.id)) {
        edgeMap.set(operation.entity.id, operation.entity);
      }
    } else if (operation.op === "edge_update") {
      const remote = edgeMap.get(operation.entity.id);
      if (remote) {
        edgeMap.set(operation.entity.id, {
          ...operation.entity,
          version: remote.version,
        });
      }
    } else if (operation.op === "edge_delete") {
      edgeMap.delete(operation.id);
    } else if (operation.op === "stroke_create") {
      if (!strokeMap.has(operation.entity.id)) {
        strokeMap.set(operation.entity.id, operation.entity);
      }
    } else if (operation.op === "stroke_update") {
      const remote = strokeMap.get(operation.entity.id);
      if (remote) {
        strokeMap.set(operation.entity.id, {
          ...operation.entity,
          version: remote.version,
        });
      }
    } else if (operation.op === "stroke_delete") {
      strokeMap.delete(operation.id);
    }
  }

  rebased.nodes = [...nodeMap.values()];
  rebased.edges = [...edgeMap.values()].filter(
    (edge) =>
      nodeMap.has(edge.source_node_id) &&
      nodeMap.has(edge.target_node_id),
  );
  rebased.strokes = [...strokeMap.values()];

  return { snapshot: rebased, conflicts };
}
