export type ProjectDocumentKind = "pdf" | "image";

export interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DocumentAnnotationKind = "pen" | "highlight" | "rectangle";

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentAnnotation {
  id: string;
  document_id: string;
  page_number: number;
  kind: DocumentAnnotationKind;
  geometry:
    | { points: AnnotationPoint[] }
    | { rect: AnnotationRect };
  color: string;
  size: number;
  opacity: number;
  created_at: string;
  updated_at: string;
}

export function projectDocumentKind(mimeType: string): ProjectDocumentKind {
  return mimeType === "application/pdf" ? "pdf" : "image";
}
