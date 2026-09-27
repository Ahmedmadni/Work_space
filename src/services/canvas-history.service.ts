import { isSupabaseBackend } from "@/lib/backend-config";
import { requireRemoteSession } from "@/services/auth.service";
import { supabaseRest } from "@/services/supabase-rest";
import {
  getBoardCanvas,
  normalizeBoardCanvasSnapshot,
  saveBoardCanvas,
} from "./canvas.service";
import { exportBoardAssets, importBoardAssets } from "./canvas-assets.service";
import type {
  BoardCanvasSnapshot,
  CanvasBoardBackup,
  CanvasBoardVersion,
  CanvasVersionReason,
} from "@/types";

const HISTORY_KEY = "projectflow.canvas.history.v1";
const MAX_VERSIONS_PER_BOARD = 20;
const AUTO_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

interface HistoryStore {
  version: 1;
  boards: Record<string, CanvasBoardVersion[]>;
}


interface RemoteVersionRow {
  id: string;
  board_id: string;
  reason: CanvasVersionReason;
  label: string | null;
  snapshot: unknown;
  node_count: number;
  edge_count: number;
  stroke_count: number;
  created_at: string;
}

function mapRemoteVersion(row: RemoteVersionRow): CanvasBoardVersion {
  const snapshot = normalizeBoardCanvasSnapshot(row.board_id, row.snapshot);
  return {
    id: row.id,
    board_id: row.board_id,
    reason: row.reason,
    label: row.label,
    created_at: row.created_at,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.edges.length,
    stroke_count: snapshot.strokes.length,
    snapshot,
  };
}

async function trimRemoteVersions(boardId: string) {
  const extra = await supabaseRest<Array<{ id: string }>>("board_versions", {
    query: {
      select: "id",
      board_id: `eq.${boardId}`,
      order: "created_at.desc",
      offset: MAX_VERSIONS_PER_BOARD,
    },
  });
  for (const row of extra) {
    await supabaseRest("board_versions", {
      method: "DELETE",
      query: { id: `eq.${row.id}` },
      prefer: "return=minimal",
    });
  }
}

function emptyStore(): HistoryStore {
  return { version: 1, boards: {} };
}

function cloneSnapshot(snapshot: BoardCanvasSnapshot): BoardCanvasSnapshot {
  return typeof structuredClone === "function"
    ? structuredClone(snapshot)
    : JSON.parse(JSON.stringify(snapshot));
}

function normalizeVersion(boardId: string, value: unknown): CanvasBoardVersion | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CanvasBoardVersion>;
  if (typeof raw.id !== "string" || typeof raw.created_at !== "string") return null;
  const reason: CanvasVersionReason =
    raw.reason === "manual" ||
    raw.reason === "before_restore" ||
    raw.reason === "import" ||
    raw.reason === "auto"
      ? raw.reason
      : "auto";
  const snapshot = normalizeBoardCanvasSnapshot(boardId, raw.snapshot);
  return {
    id: raw.id,
    board_id: boardId,
    reason,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 120) : null,
    created_at: raw.created_at,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.edges.length,
    stroke_count: snapshot.strokes.length,
    snapshot,
  };
}

function readStore(): HistoryStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<HistoryStore>;
    if (!parsed || typeof parsed !== "object" || !parsed.boards || typeof parsed.boards !== "object") {
      return emptyStore();
    }
    const boards: Record<string, CanvasBoardVersion[]> = {};
    for (const [boardId, versions] of Object.entries(parsed.boards)) {
      if (!Array.isArray(versions)) continue;
      boards[boardId] = versions
        .map((version) => normalizeVersion(boardId, version))
        .filter((version): version is CanvasBoardVersion => !!version)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, MAX_VERSIONS_PER_BOARD);
    }
    return { version: 1, boards };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: HistoryStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
}

function contentSignature(snapshot: BoardCanvasSnapshot): string {
  return JSON.stringify({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    strokes: snapshot.strokes,
  });
}

export function listLocalBoardVersionsForMigration(boardId: string): CanvasBoardVersion[] {
  const store = readStore();
  return (store.boards[boardId] ?? []).map((version) => ({
    ...version,
    snapshot: cloneSnapshot(version.snapshot),
  }));
}

export async function listBoardVersions(boardId: string): Promise<CanvasBoardVersion[]> {
  if (isSupabaseBackend()) {
    const rows = await supabaseRest<RemoteVersionRow[]>("board_versions", {
      query: {
        select: "*",
        board_id: `eq.${boardId}`,
        order: "created_at.desc",
        limit: MAX_VERSIONS_PER_BOARD,
      },
    });
    return rows.map(mapRemoteVersion);
  }
  const store = readStore();
  return (store.boards[boardId] ?? []).map((version) => ({
    ...version,
    snapshot: cloneSnapshot(version.snapshot),
  }));
}

export async function createBoardVersion(
  snapshot: BoardCanvasSnapshot,
  reason: CanvasVersionReason = "manual",
  label: string | null = null,
): Promise<CanvasBoardVersion> {
  const normalized = normalizeBoardCanvasSnapshot(snapshot.board_id, snapshot);

  if (isSupabaseBackend()) {
    const session = await requireRemoteSession();
    const payload = {
      id: `version-${crypto.randomUUID()}`,
      board_id: snapshot.board_id,
      reason,
      label: label?.trim().slice(0, 120) || null,
      snapshot: normalized,
      node_count: normalized.nodes.length,
      edge_count: normalized.edges.length,
      stroke_count: normalized.strokes.length,
      created_by: session.user.id,
    };
    const rows = await supabaseRest<RemoteVersionRow[]>("board_versions", {
      method: "POST",
      body: payload,
      prefer: "return=representation",
    });
    const row = rows[0];
    if (!row) throw new Error("VERSION_CREATE_FAILED");
    await trimRemoteVersions(snapshot.board_id);
    return mapRemoteVersion(row);
  }

  const store = readStore();
  const version: CanvasBoardVersion = {
    id: `version-${crypto.randomUUID()}`,
    board_id: snapshot.board_id,
    reason,
    label: label?.trim().slice(0, 120) || null,
    created_at: new Date().toISOString(),
    node_count: normalized.nodes.length,
    edge_count: normalized.edges.length,
    stroke_count: normalized.strokes.length,
    snapshot: cloneSnapshot(normalized),
  };
  const versions = [version, ...(store.boards[snapshot.board_id] ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_VERSIONS_PER_BOARD);
  store.boards[snapshot.board_id] = versions;
  writeStore(store);
  return version;
}

export async function maybeCreateAutoCheckpoint(
  snapshot: BoardCanvasSnapshot,
): Promise<CanvasBoardVersion | null> {
  if (!snapshot.nodes.length && !snapshot.edges.length && !snapshot.strokes.length) return null;
  const versions = isSupabaseBackend()
    ? await listBoardVersions(snapshot.board_id)
    : readStore().boards[snapshot.board_id] ?? [];
  const latest = versions[0];
  const now = Date.now();
  if (
    latest &&
    Number.isFinite(Date.parse(latest.created_at)) &&
    now - Date.parse(latest.created_at) < AUTO_CHECKPOINT_INTERVAL_MS
  ) {
    return null;
  }
  if (latest && contentSignature(latest.snapshot) === contentSignature(snapshot)) return null;
  return createBoardVersion(snapshot, "auto", null);
}

export async function restoreBoardVersion(
  boardId: string,
  versionId: string,
): Promise<BoardCanvasSnapshot> {
  const versions = await listBoardVersions(boardId);
  const target = versions.find((version) => version.id === versionId);
  if (!target) throw new Error("Version not found");

  const current = await getBoardCanvas(boardId);
  if (current.nodes.length || current.edges.length || current.strokes.length) {
    await createBoardVersion(current, "before_restore", "قبل استعادة إصدار سابق");
  }

  const restored = normalizeBoardCanvasSnapshot(boardId, {
    ...target.snapshot,
    board_id: boardId,
    updated_at: new Date().toISOString(),
  });
  return saveBoardCanvas(restored);
}

export function deleteBoardHistory(boardId: string): void {
  const store = readStore();
  if (!(boardId in store.boards)) return;
  delete store.boards[boardId];
  writeStore(store);
}

export function deleteManyBoardHistories(boardIds: string[]): void {
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

export async function exportBoardBackup(boardId: string): Promise<CanvasBoardBackup> {
  const snapshot = await getBoardCanvas(boardId);
  const assets = await exportBoardAssets(boardId);
  return {
    schema: "projectflow.canvas.backup",
    version: 1,
    exported_at: new Date().toISOString(),
    board_id: boardId,
    snapshot: cloneSnapshot(snapshot),
    assets,
  };
}

function parseBackup(value: unknown): CanvasBoardBackup {
  if (!value || typeof value !== "object") throw new Error("Invalid backup");
  const raw = value as Partial<CanvasBoardBackup>;
  if (
    raw.schema !== "projectflow.canvas.backup" ||
    raw.version !== 1 ||
    !raw.snapshot ||
    !Array.isArray(raw.assets)
  ) {
    throw new Error("Unsupported backup");
  }
  return {
    schema: "projectflow.canvas.backup",
    version: 1,
    exported_at: typeof raw.exported_at === "string" ? raw.exported_at : new Date().toISOString(),
    board_id: typeof raw.board_id === "string" ? raw.board_id : "",
    snapshot: raw.snapshot,
    assets: raw.assets,
  };
}

export async function importBoardBackup(
  boardId: string,
  value: unknown,
): Promise<BoardCanvasSnapshot> {
  const backup = parseBackup(value);
  const current = await getBoardCanvas(boardId);
  if (current.nodes.length || current.edges.length || current.strokes.length) {
    await createBoardVersion(current, "before_restore", "قبل استيراد نسخة احتياطية");
  }

  const imported = normalizeBoardCanvasSnapshot(boardId, backup.snapshot);
  const assetIdMap = await importBoardAssets(boardId, backup.assets);
  const finalSnapshot = normalizeBoardCanvasSnapshot(boardId, {
    ...imported,
    nodes: imported.nodes.map((node) => ({
      ...node,
      asset_id: node.asset_id ? assetIdMap.get(node.asset_id) ?? null : null,
    })),
    updated_at: new Date().toISOString(),
  });

  const saved = await saveBoardCanvas(finalSnapshot);
  await createBoardVersion(saved, "import", "استيراد نسخة احتياطية");
  return saved;
}
