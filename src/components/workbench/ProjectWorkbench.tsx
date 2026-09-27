import {
  FileImage,
  FilePlus2,
  FileText,
  Files,
  LayoutDashboard,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BoardCanvas } from "@/components/canvas/BoardCanvas";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteProjectDocument,
  useProjectDocuments,
  useUploadProjectDocument,
} from "@/hooks/use-documents";
import type { ProjectDocument } from "@/types/documents";

interface StoredWorkbenchState {
  openDocumentIds: string[];
  activeTab: string;
}

function storageKey(projectId: string) {
  return `projectflow.workbench.tabs.v1:${projectId}`;
}

function readState(projectId: string): StoredWorkbenchState {
  if (typeof window === "undefined") {
    return { openDocumentIds: [], activeTab: "board" };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return { openDocumentIds: [], activeTab: "board" };
    const parsed = JSON.parse(raw) as Partial<StoredWorkbenchState>;
    return {
      openDocumentIds: Array.isArray(parsed.openDocumentIds)
        ? parsed.openDocumentIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      activeTab:
        typeof parsed.activeTab === "string" ? parsed.activeTab : "board",
    };
  } catch {
    return { openDocumentIds: [], activeTab: "board" };
  }
}

function documentIcon(document: ProjectDocument) {
  return document.mime_type === "application/pdf" ? FileText : FileImage;
}

export function ProjectWorkbench({
  projectId,
  boardId,
  boardName,
  initialFocusNodeId,
}: {
  projectId: string;
  boardId: string;
  boardName: string;
  initialFocusNodeId?: string;
}) {
  const documentsQuery = useProjectDocuments(projectId);
  const uploadDocument = useUploadProjectDocument(projectId);
  const deleteDocument = useDeleteProjectDocument(projectId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initial = useMemo(() => readState(projectId), [projectId]);
  const [openDocumentIds, setOpenDocumentIds] = useState(
    initial.openDocumentIds,
  );
  const [activeTab, setActiveTab] = useState(initial.activeTab);
  const documents = documentsQuery.data ?? [];

  useEffect(() => {
    if (!documentsQuery.isSuccess) return;
    const validIds = new Set(
      (documentsQuery.data ?? []).map((document) => document.id),
    );
    setOpenDocumentIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length &&
        next.every((id, index) => id === current[index])
        ? current
        : next;
    });
    if (activeTab !== "board" && !validIds.has(activeTab)) {
      setActiveTab("board");
    }
  }, [documentsQuery.data, documentsQuery.isSuccess, activeTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey(projectId),
        JSON.stringify({ openDocumentIds, activeTab }),
      );
    } catch {
      // Tab persistence is convenience-only.
    }
  }, [activeTab, openDocumentIds, projectId]);

  const openDocument = (documentId: string) => {
    setOpenDocumentIds((current) =>
      current.includes(documentId) ? current : [...current, documentId],
    );
    setActiveTab(documentId);
  };

  const closeDocument = (documentId: string) => {
    setOpenDocumentIds((current) => current.filter((id) => id !== documentId));
    if (activeTab === documentId) setActiveTab("board");
  };

  const onUpload = (file: File) => {
    uploadDocument.mutate(file, {
      onSuccess: (document) => openDocument(document.id),
    });
  };

  const onDelete = (document: ProjectDocument) => {
    const confirmed = window.confirm(
      `حذف «${document.file_name}» وكل التعليقات المحفوظة عليه؟`,
    );
    if (!confirmed) return;
    deleteDocument.mutate(document.id, {
      onSuccess: () => closeDocument(document.id),
    });
  };

  const openDocuments = openDocumentIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is ProjectDocument => !!document);

  const activeDocument =
    activeTab === "board"
      ? null
      : documents.find((document) => document.id === activeTab) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hairline-b flex h-10 shrink-0 items-stretch overflow-x-auto bg-background">
        <button
          type="button"
          onClick={() => setActiveTab("board")}
          className={`flex min-w-44 max-w-64 shrink-0 items-center gap-2 border-e border-border px-3 text-xs transition ${
            activeTab === "board"
              ? "bg-muted/60 font-semibold text-foreground"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{boardName}</span>
        </button>

        {openDocuments.map((document) => {
          const Icon = documentIcon(document);
          return (
            <div
              key={document.id}
              className={`group flex min-w-44 max-w-64 shrink-0 items-center border-e border-border transition ${
                activeTab === document.id
                  ? "bg-muted/60 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab(document.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 text-xs"
                title={document.file_name}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{document.file_name}</span>
              </button>
              <button
                type="button"
                onClick={() => closeDocument(document.id)}
                className="me-1 grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-60 hover:bg-muted hover:opacity-100"
                aria-label={`إغلاق ${document.file_name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        <div className="flex shrink-0 items-center gap-1 px-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadDocument.isPending}
            title="رفع PDF أو صورة"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <FilePlus2 className="h-4 w-4" />
          </button>

          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="ملفات المشروع"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Files className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>ملفات المشروع</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {documents.length}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {documentsQuery.isLoading && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  جارٍ تحميل الملفات…
                </p>
              )}
              {!documentsQuery.isLoading && !documents.length && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  لا توجد ملفات بعد. ارفع PDF أو صورة لفتحها بجانب الـWorkspace.
                </p>
              )}
              {documents.map((document) => {
                const Icon = documentIcon(document);
                return (
                  <div
                    key={document.id}
                    className="flex items-center rounded-lg hover:bg-muted"
                  >
                    <DropdownMenuItem
                      className="min-w-0 flex-1 cursor-pointer gap-2 bg-transparent focus:bg-transparent"
                      onSelect={() => openDocument(document.id)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-xs">{document.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(document.size_bytes / 1024 / 1024).toFixed(1)} MB
                          {document.page_count
                            ? ` · ${document.page_count} صفحة`
                            : ""}
                        </p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="me-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background"
                          aria-label="خيارات الملف"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="gap-2 text-danger focus:text-danger"
                          onSelect={() => onDelete(document)}
                        >
                          <Trash2 className="h-4 w-4" />
                          حذف الملف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => fileInputRef.current?.click()}
                className="cursor-pointer gap-2"
              >
                <FilePlus2 className="h-4 w-4" />
                رفع ملف جديد
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) onUpload(file);
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={`absolute inset-0 ${
            activeTab === "board"
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          }`}
          aria-hidden={activeTab !== "board"}
        >
          <BoardCanvas
            boardId={boardId}
            initialFocusNodeId={initialFocusNodeId}
          />
        </div>

        {activeDocument && (
          <div className="absolute inset-0 z-10">
            <DocumentViewer projectId={projectId} document={activeDocument} />
          </div>
        )}
      </div>
    </div>
  );
}
