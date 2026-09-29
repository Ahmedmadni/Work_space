import { isSupabaseBackend } from "@/lib/backend-config";
import { deleteLocalDocumentAnnotations } from "@/services/document-annotations.service";
import { CURRENT_USER } from "@/services/local-db";
import {
  MAX_PROJECT_DOCUMENT_BYTES,
  PROJECT_DOCUMENT_MIME_TYPES,
  remoteDeleteProjectDocument,
  remoteGetProjectDocument,
  remoteGetProjectDocumentBlob,
  remoteListProjectDocuments,
  remoteUpdateDocumentPageCount,
  remoteUploadProjectDocument,
} from "@/services/remote-project-documents.service";
import type { ProjectDocument } from "@/types/documents";

const DB_NAME = "projectflow-project-documents";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const PROJECT_INDEX = "project_id";

interface LocalProjectDocumentRecord extends ProjectDocument {
  blob: Blob;
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
      if (!store.indexNames.contains(PROJECT_INDEX)) {
        store.createIndex(PROJECT_INDEX, "project_id", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open project document store"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Document transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Document transaction aborted"));
  });
}

function publicDocument(record: LocalProjectDocumentRecord): ProjectDocument {
  return {
    id: record.id,
    project_id: record.project_id,
    file_name: record.file_name,
    mime_type: record.mime_type,
    size_bytes: record.size_bytes,
    page_count: record.page_count,
    created_by: record.created_by,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function validateFile(file: File) {
  if (!PROJECT_DOCUMENT_MIME_TYPES.has(file.type)) {
    throw new Error("نوع الملف غير مدعوم. استخدم PDF أو صورة PNG/JPEG/WebP/GIF.");
  }
  if (file.size > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("حجم الملف يتجاوز 50MB.");
  }
}

async function listLocalProjectDocuments(
  projectId: string,
): Promise<ProjectDocument[]> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const index = transaction.objectStore(STORE_NAME).index(PROJECT_INDEX);
    const rows = await new Promise<LocalProjectDocumentRecord[]>(
      (resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only(projectId));
        request.onsuccess = () =>
          resolve(
            (request.result as LocalProjectDocumentRecord[] | undefined) ?? [],
          );
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to list project documents"));
      },
    );
    return rows
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(publicDocument);
  } finally {
    db.close();
  }
}

async function getLocalRecord(
  id: string,
): Promise<LocalProjectDocumentRecord | null> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    return await new Promise<LocalProjectDocumentRecord | null>(
      (resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () =>
          resolve(
            (request.result as LocalProjectDocumentRecord | undefined) ?? null,
          );
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to get project document"));
      },
    );
  } finally {
    db.close();
  }
}

async function uploadLocalProjectDocument(
  projectId: string,
  file: File,
): Promise<ProjectDocument> {
  validateFile(file);
  const now = new Date().toISOString();
  const record: LocalProjectDocumentRecord = {
    id: `doc-${crypto.randomUUID()}`,
    project_id: projectId,
    file_name: file.name.slice(0, 220),
    mime_type: file.type,
    size_bytes: file.size,
    page_count: null,
    created_by: CURRENT_USER.id,
    created_at: now,
    updated_at: now,
    blob: file,
  };
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(record);
    await done;
  } finally {
    db.close();
  }
  return publicDocument(record);
}

async function updateLocalPageCount(id: string, pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1) return;
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const current = await new Promise<LocalProjectDocumentRecord | null>(
      (resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () =>
          resolve(
            (request.result as LocalProjectDocumentRecord | undefined) ?? null,
          );
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to update page count"));
      },
    );
    if (current) {
      current.page_count = pageCount;
      current.updated_at = new Date().toISOString();
      store.put(current);
    }
    await done;
  } finally {
    db.close();
  }
}

async function deleteLocalProjectDocument(id: string) {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await done;
  } finally {
    db.close();
  }
  deleteLocalDocumentAnnotations(id);
}

export async function listProjectDocuments(
  projectId: string,
): Promise<ProjectDocument[]> {
  return isSupabaseBackend()
    ? remoteListProjectDocuments(projectId)
    : listLocalProjectDocuments(projectId);
}

export async function getProjectDocument(
  id: string,
): Promise<ProjectDocument | null> {
  if (isSupabaseBackend()) return remoteGetProjectDocument(id);
  const record = await getLocalRecord(id);
  return record ? publicDocument(record) : null;
}

export async function uploadProjectDocument(
  projectId: string,
  file: File,
): Promise<ProjectDocument> {
  return isSupabaseBackend()
    ? remoteUploadProjectDocument(projectId, file)
    : uploadLocalProjectDocument(projectId, file);
}

export async function getProjectDocumentBlob(id: string): Promise<Blob> {
  if (isSupabaseBackend()) return remoteGetProjectDocumentBlob(id);
  const record = await getLocalRecord(id);
  if (!record) throw new Error("DOCUMENT_NOT_FOUND");
  return record.blob;
}

export async function updateProjectDocumentPageCount(
  id: string,
  pageCount: number,
): Promise<void> {
  return isSupabaseBackend()
    ? remoteUpdateDocumentPageCount(id, pageCount)
    : updateLocalPageCount(id, pageCount);
}

export async function deleteProjectDocument(id: string): Promise<void> {
  return isSupabaseBackend()
    ? remoteDeleteProjectDocument(id)
    : deleteLocalProjectDocument(id);
}


export interface LocalProjectDocumentMigrationRecord {
  document: ProjectDocument;
  blob: Blob;
}

/** Read-only IndexedDB bridge used by the cloud cutover. */
export async function listLocalProjectDocumentsForMigration(
  projectId: string,
): Promise<LocalProjectDocumentMigrationRecord[]> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const index = transaction.objectStore(STORE_NAME).index(PROJECT_INDEX);
    const rows = await new Promise<LocalProjectDocumentRecord[]>(
      (resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only(projectId));
        request.onsuccess = () =>
          resolve(
            (request.result as LocalProjectDocumentRecord[] | undefined) ?? [],
          );
        request.onerror = () =>
          reject(
            request.error ??
              new Error("Failed to read local documents for migration"),
          );
      },
    );
    return rows.map((record) => ({
      document: publicDocument(record),
      blob: record.blob,
    }));
  } finally {
    db.close();
  }
}
