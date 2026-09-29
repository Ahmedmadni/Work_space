import { BACKEND_CONFIG } from "@/lib/backend-config";
import { requireRemoteSession } from "@/services/auth.service";
import { supabaseRest } from "@/services/supabase-rest";
import type { ProjectDocument } from "@/types/documents";

const BUCKET = "project-documents";
export const MAX_PROJECT_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const PROJECT_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

interface ProjectDocumentRow {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  object_path: string;
  page_count: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapDocument(row: ProjectDocumentRow): ProjectDocument {
  return {
    id: row.id,
    project_id: row.project_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    page_count: row.page_count,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function encodedObjectPath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function storageRequest(path: string, init: RequestInit): Promise<Response> {
  const session = await requireRemoteSession();
  const response = await fetch(
    `${BACKEND_CONFIG.supabaseUrl}/storage/v1/object/${BUCKET}/${encodedObjectPath(path)}`,
    {
      ...init,
      headers: {
        apikey: BACKEND_CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        ...init.headers,
      },
    },
  );
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `DOCUMENT_STORAGE_HTTP_${response.status}`);
  }
  return response;
}

function safeFileName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(0, 160) || "document";
}

function validateFile(file: File) {
  if (!PROJECT_DOCUMENT_MIME_TYPES.has(file.type)) {
    throw new Error("نوع الملف غير مدعوم. استخدم PDF أو صورة PNG/JPEG/WebP/GIF.");
  }
  if (file.size > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("حجم الملف يتجاوز 50MB.");
  }
}

export async function remoteListProjectDocuments(
  projectId: string,
): Promise<ProjectDocument[]> {
  const rows = await supabaseRest<ProjectDocumentRow[]>("project_documents", {
    query: {
      select: "*",
      project_id: `eq.${projectId}`,
      order: "updated_at.desc",
    },
  });
  return rows.map(mapDocument);
}

export async function remoteGetProjectDocument(
  id: string,
): Promise<ProjectDocument | null> {
  const rows = await supabaseRest<ProjectDocumentRow[]>("project_documents", {
    query: { select: "*", id: `eq.${id}`, limit: 1 },
  });
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function remoteUploadProjectDocument(
  projectId: string,
  file: File,
): Promise<ProjectDocument> {
  validateFile(file);
  const session = await requireRemoteSession();
  const id = `doc-${crypto.randomUUID()}`;
  const objectPath = `${projectId}/${id}/${safeFileName(file.name)}`;

  await storageRequest(objectPath, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });

  try {
    const rows = await supabaseRest<ProjectDocumentRow[]>("project_documents", {
      method: "POST",
      body: {
        id,
        project_id: projectId,
        file_name: file.name.slice(0, 220),
        mime_type: file.type,
        size_bytes: file.size,
        object_path: objectPath,
        created_by: session.user.id,
      },
      prefer: "return=representation",
    });
    const row = rows[0];
    if (!row) throw new Error("DOCUMENT_METADATA_CREATE_FAILED");
    return mapDocument(row);
  } catch (error) {
    try {
      await storageRequest(objectPath, { method: "DELETE" });
    } catch {
      // Keep the original metadata error.
    }
    throw error;
  }
}

export async function remoteGetProjectDocumentBlob(id: string): Promise<Blob> {
  const rows = await supabaseRest<ProjectDocumentRow[]>("project_documents", {
    query: { select: "*", id: `eq.${id}`, limit: 1 },
  });
  const row = rows[0];
  if (!row) throw new Error("DOCUMENT_NOT_FOUND");
  const response = await storageRequest(row.object_path, { method: "GET" });
  return response.blob();
}

export async function remoteUpdateDocumentPageCount(
  id: string,
  pageCount: number,
): Promise<void> {
  if (!Number.isInteger(pageCount) || pageCount < 1) return;
  await supabaseRest("project_documents", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { page_count: pageCount },
    prefer: "return=minimal",
  });
}

export async function remoteDeleteProjectDocument(id: string): Promise<void> {
  const rows = await supabaseRest<ProjectDocumentRow[]>("project_documents", {
    query: { select: "*", id: `eq.${id}`, limit: 1 },
  });
  const row = rows[0];
  if (!row) return;
  await storageRequest(row.object_path, { method: "DELETE" });
  await supabaseRest("project_documents", {
    method: "DELETE",
    query: { id: `eq.${id}` },
    prefer: "return=minimal",
  });
}


/**
 * Idempotent cutover upload that preserves the local document id so annotation
 * foreign keys remain stable. This is intentionally separate from normal upload.
 */
export async function remoteMigrateProjectDocument(
  document: ProjectDocument,
  blob: Blob,
): Promise<ProjectDocument> {
  const file = new File([blob], document.file_name, {
    type: document.mime_type,
  });
  validateFile(file);
  const session = await requireRemoteSession();

  const existing = await supabaseRest<ProjectDocumentRow[]>(
    "project_documents",
    {
      query: {
        select: "*",
        id: `eq.${document.id}`,
        limit: 1,
      },
    },
  );

  if (existing[0] && existing[0].project_id !== document.project_id) {
    throw new Error(
      "يوجد مستند سحابي بنفس المعرّف لكنه يتبع مشروعًا مختلفًا.",
    );
  }

  const objectPath =
    `${document.project_id}/${document.id}/${safeFileName(document.file_name)}`;

  await storageRequest(objectPath, {
    method: "POST",
    headers: {
      "Content-Type": document.mime_type,
      "x-upsert": "true",
    },
    body: file,
  });

  const rows = await supabaseRest<ProjectDocumentRow[]>(
    "project_documents",
    {
      method: "POST",
      query: { on_conflict: "id" },
      body: {
        id: document.id,
        project_id: document.project_id,
        file_name: document.file_name.slice(0, 220),
        mime_type: document.mime_type,
        size_bytes: blob.size,
        object_path: objectPath,
        page_count: document.page_count,
        created_by: session.user.id,
        created_at: document.created_at,
        updated_at: document.updated_at,
      },
      prefer: "resolution=merge-duplicates,return=representation",
    },
  );

  const row = rows[0];
  if (!row) throw new Error("DOCUMENT_MIGRATION_METADATA_FAILED");
  if (
    row.project_id !== document.project_id ||
    row.size_bytes !== blob.size
  ) {
    throw new Error("DOCUMENT_MIGRATION_VERIFICATION_FAILED");
  }
  return mapDocument(row);
}
