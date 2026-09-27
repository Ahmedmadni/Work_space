import { BACKEND_CONFIG } from "@/lib/backend-config";
import { requireRemoteSession } from "@/services/auth.service";
import { supabaseRest } from "@/services/supabase-rest";

const BUCKET = "canvas-assets";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface AssetRow {
  id: string;
  board_id: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

interface BoardProjectRow {
  id: string;
  project_id: string;
}

export interface RemoteCanvasAssetRecord {
  id: string;
  board_id: string;
  name: string;
  mime_type: string;
  size: number;
  blob: Blob;
  created_at: string;
}

function storageObjectUrl(path: string) {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${BACKEND_CONFIG.supabaseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`;
}

async function storageRequest(path: string, init: RequestInit): Promise<Response> {
  const session = await requireRemoteSession();
  const response = await fetch(storageObjectUrl(path), {
    ...init,
    headers: {
      apikey: BACKEND_CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `STORAGE_HTTP_${response.status}`);
  }
  return response;
}


async function storageBatchDelete(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const session = await requireRemoteSession();
  const response = await fetch(
    `${BACKEND_CONFIG.supabaseUrl}/storage/v1/object/${BUCKET}`,
    {
      method: "DELETE",
      headers: {
        apikey: BACKEND_CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
    },
  );
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `STORAGE_BATCH_DELETE_HTTP_${response.status}`);
  }
}

async function boardProjectId(boardId: string): Promise<string> {
  const rows = await supabaseRest<BoardProjectRow[]>("boards", {
    query: { select: "id,project_id", id: `eq.${boardId}`, limit: 1 },
  });
  if (!rows[0]) throw new Error("BOARD_NOT_FOUND");
  return rows[0].project_id;
}

function safeFileName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(0, 120) || "image";
}

async function putRemoteCanvasImage(
  boardId: string,
  file: File,
  options?: { assetId?: string; upsert?: boolean },
): Promise<RemoteCanvasAssetRecord> {
  if (!file.type.startsWith("image/")) throw new Error("Unsupported file type");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image is too large");

  const session = await requireRemoteSession();
  const projectId = await boardProjectId(boardId);
  const id = options?.assetId ?? `asset-${crypto.randomUUID()}`;
  const objectPath = `${projectId}/${boardId}/${id}/${safeFileName(file.name)}`;

  await storageRequest(objectPath, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-upsert": options?.upsert ? "true" : "false",
    },
    body: file,
  });

  try {
    const rows = await supabaseRest<AssetRow[]>("canvas_assets", {
      method: "POST",
      query: options?.upsert ? { on_conflict: "id" } : undefined,
      body: {
        id,
        board_id: boardId,
        object_path: objectPath,
        file_name: file.name.slice(0, 180),
        mime_type: file.type,
        size_bytes: file.size,
        created_by: session.user.id,
      },
      prefer: options?.upsert
        ? "resolution=merge-duplicates,return=representation"
        : "return=representation",
    });
    const row = rows[0];
    if (!row) throw new Error("ASSET_METADATA_CREATE_FAILED");
    return {
      id: row.id,
      board_id: row.board_id,
      name: row.file_name,
      mime_type: row.mime_type,
      size: row.size_bytes,
      blob: file,
      created_at: row.created_at,
    };
  } catch (error) {
    if (!options?.upsert) {
      try {
        await storageRequest(objectPath, { method: "DELETE" });
      } catch {
        // لا نخفي الخطأ الأصلي إذا تعذر حذف الملف المرفوع تعويضيًا.
      }
    }
    throw error;
  }
}

export async function remoteSaveCanvasImage(
  boardId: string,
  file: File,
): Promise<RemoteCanvasAssetRecord> {
  return putRemoteCanvasImage(boardId, file);
}

export async function remoteMigrateCanvasImage(
  boardId: string,
  assetId: string,
  file: File,
): Promise<RemoteCanvasAssetRecord> {
  return putRemoteCanvasImage(boardId, file, { assetId, upsert: true });
}

async function downloadAssetRow(row: AssetRow): Promise<RemoteCanvasAssetRecord> {
  const response = await storageRequest(row.object_path, { method: "GET" });
  const blob = await response.blob();
  return {
    id: row.id,
    board_id: row.board_id,
    name: row.file_name,
    mime_type: row.mime_type,
    size: row.size_bytes,
    blob,
    created_at: row.created_at,
  };
}

export async function remoteGetCanvasAsset(
  id: string,
): Promise<RemoteCanvasAssetRecord | null> {
  const rows = await supabaseRest<AssetRow[]>("canvas_assets", {
    query: { select: "*", id: `eq.${id}`, limit: 1 },
  });
  return rows[0] ? downloadAssetRow(rows[0]) : null;
}

export async function remoteListBoardAssets(
  boardId: string,
): Promise<RemoteCanvasAssetRecord[]> {
  const rows = await supabaseRest<AssetRow[]>("canvas_assets", {
    query: {
      select: "*",
      board_id: `eq.${boardId}`,
      order: "created_at.asc",
    },
  });
  return Promise.all(rows.map(downloadAssetRow));
}

export async function remoteDeleteBoardAssets(boardId: string): Promise<void> {
  const rows = await supabaseRest<AssetRow[]>("canvas_assets", {
    query: { select: "*", board_id: `eq.${boardId}` },
  });

  if (rows.length) {
    await storageBatchDelete(rows.map((row) => row.object_path));

    await supabaseRest("canvas_assets", {
      method: "DELETE",
      query: { board_id: `eq.${boardId}` },
      prefer: "return=minimal",
    });
  }
}
