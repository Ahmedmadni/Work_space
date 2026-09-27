import type {
  BoardCanvasSnapshot,
  CanvasEdge,
  CanvasNode,
  CanvasStroke,
} from "@/types";

export type CanvasOperation =
  | { op: "node_create"; entity: CanvasNode }
  | { op: "node_update"; entity: CanvasNode; expected_version: number }
  | { op: "node_delete"; id: string; expected_version: number }
  | { op: "edge_create"; entity: CanvasEdge }
  | { op: "edge_update"; entity: CanvasEdge; expected_version: number }
  | { op: "edge_delete"; id: string; expected_version: number }
  | { op: "stroke_create"; entity: CanvasStroke }
  | { op: "stroke_update"; entity: CanvasStroke; expected_version: number }
  | { op: "stroke_delete"; id: string; expected_version: number };

export interface CanvasConflict {
  entity_type: "node" | "edge" | "stroke";
  id: string;
  reason: "already_exists" | "missing" | "version_mismatch";
  expected_version?: number | null;
  actual_version?: number | null;
}

export interface CanvasSaveResult {
  snapshot: BoardCanvasSnapshot;
  conflicts: CanvasConflict[];
  applied_count: number;
  revision: number;
}

export interface CanvasRemoteEvent {
  board_id: string;
  revision: number;
  actor_user_id: string | null;
  client_id: string;
  operations: CanvasOperation[] | Array<{ op: "snapshot_replaced" }>;
  created_at: string;
}

export interface CanvasRemoteCursor {
  client_id: string;
  user_id: string;
  user_name: string;
  x: number | null;
  y: number | null;
  selected_node_ids: string[];
  tool: string;
  updated_at: number;
}
