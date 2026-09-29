import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  AnnotationPoint,
  AnnotationRect,
  DocumentAnnotation,
  DocumentAnnotationKind,
} from "@/types/documents";

const STORAGE_KEY = "projectflow.document.annotations.v1";

interface AnnotationStore {
  version: 1;
  documents: Record<string, Record<string, DocumentAnnotation[]>>;
}

interface RemoteAnnotationRow {
  id: string;
  document_id: string;
  page_number: number;
  kind: DocumentAnnotationKind;
  geometry: unknown;
  color: string;
  size: number;
  opacity: number;
  created_at: string;
  updated_at: string;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizePoint(value: unknown): AnnotationPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Partial<AnnotationPoint>;
  if (typeof point.x !== "number" || typeof point.y !== "number") return null;
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

function normalizeRect(value: unknown): AnnotationRect | null {
  if (!value || typeof value !== "object") return null;
  const rect = value as Partial<AnnotationRect>;
  if (
    typeof rect.x !== "number" ||
    typeof rect.y !== "number" ||
    typeof rect.width !== "number" ||
    typeof rect.height !== "number"
  ) {
    return null;
  }
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(1 - x, rect.width)),
    height: Math.max(0, Math.min(1 - y, rect.height)),
  };
}

function normalizeAnnotation(
  value: Partial<DocumentAnnotation> | RemoteAnnotationRow,
  documentId: string,
  pageNumber: number,
): DocumentAnnotation | null {
  if (typeof value.id !== "string") return null;
  const kind =
    value.kind === "pen" ||
    value.kind === "highlight" ||
    value.kind === "rectangle"
      ? value.kind
      : null;
  if (!kind) return null;

  const geometry = value.geometry as
    | { points?: unknown; rect?: unknown }
    | undefined;

  const normalizedGeometry =
    kind === "rectangle"
      ? (() => {
          const rect = normalizeRect(geometry?.rect);
          return rect ? { rect } : null;
        })()
      : (() => {
          const points = Array.isArray(geometry?.points)
            ? geometry!.points.map(normalizePoint).filter(
                (point): point is AnnotationPoint => !!point,
              )
            : [];
          return points.length ? { points } : null;
        })();

  if (!normalizedGeometry) return null;

  const createdAt =
    typeof value.created_at === "string"
      ? value.created_at
      : new Date().toISOString();
  const updatedAt =
    typeof value.updated_at === "string" ? value.updated_at : createdAt;

  return {
    id: value.id,
    document_id: documentId,
    page_number: pageNumber,
    kind,
    geometry: normalizedGeometry,
    color: typeof value.color === "string" ? value.color : "#111827",
    size:
      typeof value.size === "number"
        ? Math.max(0.1, Math.min(64, value.size))
        : 3,
    opacity:
      typeof value.opacity === "number" ? clamp01(value.opacity) : 1,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function emptyStore(): AnnotationStore {
  return { version: 1, documents: {} };
}

function readStore(): AnnotationStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<AnnotationStore>;
    if (!parsed.documents || typeof parsed.documents !== "object") {
      return emptyStore();
    }
    return { version: 1, documents: parsed.documents };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: AnnotationStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function localList(documentId: string, pageNumber: number) {
  const raw = readStore().documents[documentId]?.[String(pageNumber)] ?? [];
  return raw
    .map((annotation) =>
      normalizeAnnotation(annotation, documentId, pageNumber),
    )
    .filter((annotation): annotation is DocumentAnnotation => !!annotation);
}

function localSave(
  documentId: string,
  pageNumber: number,
  annotations: DocumentAnnotation[],
) {
  const store = readStore();
  store.documents[documentId] ??= {};
  store.documents[documentId]![String(pageNumber)] = annotations
    .map((annotation) =>
      normalizeAnnotation(annotation, documentId, pageNumber),
    )
    .filter((annotation): annotation is DocumentAnnotation => !!annotation);
  writeStore(store);
}

export async function listDocumentAnnotations(
  documentId: string,
  pageNumber: number,
): Promise<DocumentAnnotation[]> {
  if (!isSupabaseBackend()) return localList(documentId, pageNumber);

  const rows = await supabaseRest<RemoteAnnotationRow[]>(
    "document_annotations",
    {
      query: {
        select: "*",
        document_id: `eq.${documentId}`,
        page_number: `eq.${pageNumber}`,
        order: "created_at.asc",
      },
    },
  );
  return rows
    .map((row) => normalizeAnnotation(row, documentId, pageNumber))
    .filter((annotation): annotation is DocumentAnnotation => !!annotation);
}

export async function saveDocumentAnnotations(
  documentId: string,
  pageNumber: number,
  annotations: DocumentAnnotation[],
): Promise<void> {
  const normalized = annotations
    .map((annotation) =>
      normalizeAnnotation(annotation, documentId, pageNumber),
    )
    .filter((annotation): annotation is DocumentAnnotation => !!annotation);

  if (!isSupabaseBackend()) {
    localSave(documentId, pageNumber, normalized);
    return;
  }

  await supabaseRest<null>("rpc/save_document_annotations", {
    method: "POST",
    body: {
      p_document_id: documentId,
      p_page_number: pageNumber,
      p_annotations: normalized,
    },
  });
}

export function createStrokeAnnotation(
  documentId: string,
  pageNumber: number,
  kind: "pen" | "highlight",
  points: AnnotationPoint[],
  style: { color: string; size: number; opacity: number },
): DocumentAnnotation {
  const now = new Date().toISOString();
  return {
    id: `annotation-${crypto.randomUUID()}`,
    document_id: documentId,
    page_number: pageNumber,
    kind,
    geometry: { points },
    color: style.color,
    size: style.size,
    opacity: style.opacity,
    created_at: now,
    updated_at: now,
  };
}

export function createRectangleAnnotation(
  documentId: string,
  pageNumber: number,
  rect: AnnotationRect,
  style: { color: string; size: number; opacity: number },
): DocumentAnnotation {
  const now = new Date().toISOString();
  return {
    id: `annotation-${crypto.randomUUID()}`,
    document_id: documentId,
    page_number: pageNumber,
    kind: "rectangle",
    geometry: { rect },
    color: style.color,
    size: style.size,
    opacity: style.opacity,
    created_at: now,
    updated_at: now,
  };
}


export function deleteLocalDocumentAnnotations(documentId: string): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  if (!(documentId in store.documents)) return;
  delete store.documents[documentId];
  writeStore(store);
}


export interface LocalDocumentAnnotationMigrationPage {
  page_number: number;
  annotations: DocumentAnnotation[];
}

/** Read-only localStorage bridge used by the cloud cutover. */
export function listLocalDocumentAnnotationPagesForMigration(
  documentId: string,
): LocalDocumentAnnotationMigrationPage[] {
  const pages = readStore().documents[documentId] ?? {};
  return Object.entries(pages)
    .flatMap(([pageKey, annotations]) => {
      const pageNumber = Number(pageKey);
      if (!Number.isInteger(pageNumber) || pageNumber < 1) return [];
      const normalized = annotations
        .map((annotation) =>
          normalizeAnnotation(annotation, documentId, pageNumber),
        )
        .filter(
          (annotation): annotation is DocumentAnnotation => !!annotation,
        );
      return normalized.length
        ? [{ page_number: pageNumber, annotations: normalized }]
        : [];
    })
    .sort((a, b) => a.page_number - b.page_number);
}
