import type { CanvasBackupAsset } from "@/types";

const DB_NAME = "projectflow-assets";
const DB_VERSION = 1;
const STORE_NAME = "assets";
const BOARD_INDEX = "board_id";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface CanvasAssetRecord {
  id: string;
  board_id: string;
  name: string;
  mime_type: string;
  size: number;
  blob: Blob;
  created_at: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (!store.indexNames.contains(BOARD_INDEX)) {
        store.createIndex(BOARD_INDEX, "board_id", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open asset store"));
  });
}

function txDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Asset transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Asset transaction aborted"));
  });
}

export async function saveCanvasImage(
  boardId: string,
  file: File,
): Promise<CanvasAssetRecord> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Unsupported file type");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large");
  }

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const done = txDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const record: CanvasAssetRecord = {
    id: `asset-${crypto.randomUUID()}`,
    board_id: boardId,
    name: file.name,
    mime_type: file.type,
    size: file.size,
    blob: file,
    created_at: new Date().toISOString(),
  };

  store.put(record);
  await done;
  db.close();
  return record;
}

export async function listBoardAssets(boardId: string): Promise<CanvasAssetRecord[]> {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index(BOARD_INDEX);

  const rows = await new Promise<CanvasAssetRecord[]>((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.only(boardId));
    request.onsuccess = () => resolve((request.result as CanvasAssetRecord[] | undefined) ?? []);
    request.onerror = () => reject(request.error ?? new Error("Failed to list board assets"));
  });

  db.close();
  return rows;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Failed to encode asset"));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to encode asset"));
    reader.readAsDataURL(blob);
  });
}

export async function exportBoardAssets(boardId: string): Promise<CanvasBackupAsset[]> {
  const records = await listBoardAssets(boardId);
  return Promise.all(
    records.map(async (record) => ({
      id: record.id,
      name: record.name,
      mime_type: record.mime_type,
      size: record.size,
      data_url: await blobToDataUrl(record.blob),
      created_at: record.created_at,
    })),
  );
}

export async function importBoardAssets(
  boardId: string,
  assets: CanvasBackupAsset[],
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  if (!assets.length) return idMap;

  const prepared: Array<{ oldId: string; record: CanvasAssetRecord }> = [];
  for (const asset of assets) {
    if (
      !asset ||
      typeof asset.id !== "string" ||
      typeof asset.data_url !== "string" ||
      !asset.data_url.startsWith("data:image/")
    ) {
      continue;
    }
    const response = await fetch(asset.data_url);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_IMAGE_BYTES) continue;

    const newId = `asset-${crypto.randomUUID()}`;
    prepared.push({
      oldId: asset.id,
      record: {
        id: newId,
        board_id: boardId,
        name: typeof asset.name === "string" && asset.name ? asset.name.slice(0, 180) : "image",
        mime_type: blob.type,
        size: blob.size,
        blob,
        created_at:
          typeof asset.created_at === "string" ? asset.created_at : new Date().toISOString(),
      },
    });
  }

  if (!prepared.length) return idMap;

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const done = txDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  try {
    for (const item of prepared) {
      store.put(item.record);
      idMap.set(item.oldId, item.record.id);
    }
    await done;
  } finally {
    db.close();
  }

  return idMap;
}

export async function getCanvasAsset(id: string): Promise<CanvasAssetRecord | null> {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);

  const result = await new Promise<CanvasAssetRecord | null>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as CanvasAssetRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Failed to load asset"));
  });

  db.close();
  return result;
}

export async function deleteBoardAssets(boardId: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const done = txDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index(BOARD_INDEX);

  await new Promise<void>((resolve, reject) => {
    const request = index.openKeyCursor(IDBKeyRange.only(boardId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to clean board assets"));
  });

  await done;
  db.close();
}

export async function deleteManyBoardAssets(boardIds: string[]): Promise<void> {
  for (const boardId of boardIds) {
    try {
      await deleteBoardAssets(boardId);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[assets] تعذر تنظيف أصول اللوحة.", error);
      }
    }
  }
}
