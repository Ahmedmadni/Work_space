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
