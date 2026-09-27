import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deleteProjectDocument,
  getProjectDocumentBlob,
  listProjectDocuments,
  updateProjectDocumentPageCount,
  uploadProjectDocument,
} from "@/services/project-documents.service";
import {
  listDocumentAnnotations,
  saveDocumentAnnotations,
} from "@/services/document-annotations.service";
import type { DocumentAnnotation, ProjectDocument } from "@/types/documents";

export function useProjectDocuments(projectId: string) {
  return useQuery({
    queryKey: ["project-documents", projectId],
    queryFn: () => listProjectDocuments(projectId),
    enabled: !!projectId,
  });
}

export function useProjectDocumentBlob(documentId: string) {
  return useQuery({
    queryKey: ["project-documents", "blob", documentId],
    queryFn: () => getProjectDocumentBlob(documentId),
    enabled: !!documentId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUploadProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadProjectDocument(projectId, file),
    onSuccess: (document) => {
      queryClient.setQueryData<ProjectDocument[]>(
        ["project-documents", projectId],
        (current) => [
          document,
          ...(current ?? []).filter((item) => item.id !== document.id),
        ],
      );
      void queryClient.invalidateQueries({
        queryKey: ["project-documents", projectId],
      });
      toast.success(`تم رفع «${document.file_name}»`);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر رفع المستند.",
      ),
  });
}

export function useDeleteProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => deleteProjectDocument(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-documents", projectId],
      });
      toast.success("تم حذف المستند.");
    },
    onError: () => toast.error("تعذر حذف المستند."),
  });
}

export function useUpdateProjectDocumentPageCount(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      pageCount,
    }: {
      documentId: string;
      pageCount: number;
    }) => updateProjectDocumentPageCount(documentId, pageCount),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["project-documents", projectId],
      }),
  });
}

export function useDocumentAnnotations(
  documentId: string,
  pageNumber: number,
) {
  return useQuery({
    queryKey: ["document-annotations", documentId, pageNumber],
    queryFn: () => listDocumentAnnotations(documentId, pageNumber),
    enabled: !!documentId && pageNumber > 0,
  });
}

export function useSaveDocumentAnnotations(
  documentId: string,
  pageNumber: number,
) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `document-annotations:${documentId}:${pageNumber}` },
    mutationFn: (annotations: DocumentAnnotation[]) =>
      saveDocumentAnnotations(documentId, pageNumber, annotations),
    onSuccess: (_, annotations) => {
      queryClient.setQueryData(
        ["document-annotations", documentId, pageNumber],
        annotations,
      );
    },
    onError: () => toast.error("تعذر حفظ التعليقات على المستند."),
  });
}
