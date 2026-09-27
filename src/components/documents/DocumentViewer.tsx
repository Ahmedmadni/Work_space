import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  ExternalLink,
  Highlighter,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Square,
  Undo2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  useDocumentAnnotations,
  useProjectDocumentBlob,
  useSaveDocumentAnnotations,
  useUpdateProjectDocumentPageCount,
} from "@/hooks/use-documents";
import {
  createRectangleAnnotation,
  createStrokeAnnotation,
} from "@/services/document-annotations.service";
import type {
  AnnotationPoint,
  AnnotationRect,
  DocumentAnnotation,
  ProjectDocument,
} from "@/types/documents";

const PDFJS_VERSION = "4.10.38";
const PDFJS_MODULE_URL =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

type AnnotationTool = "view" | "pen" | "highlight" | "rectangle" | "eraser";

interface PdfPageLike {
  getViewport: (input: { scale: number }) => { width: number; height: number };
  render: (input: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    transform?: number[];
  }) => { promise: Promise<void>; cancel?: () => void };
}

interface PdfDocumentLike {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
}

interface PdfJsModuleLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (input: { data: ArrayBuffer }) => {
    promise: Promise<PdfDocumentLike>;
  };
}

async function loadPdfJs(): Promise<PdfJsModuleLike> {
  const module = (await import(
    /* @vite-ignore */ PDFJS_MODULE_URL
  )) as PdfJsModuleLike;
  module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  return module;
}

function normalizedPoint(
  event: ReactPointerEvent<SVGSVGElement>,
  element: SVGSVGElement,
): AnnotationPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function rectFromPoints(a: AnnotationPoint, b: AnnotationPoint): AnnotationRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function annotationPath(
  points: AnnotationPoint[],
  width: number,
  height: number,
) {
  return points.map((point) => `${point.x * width},${point.y * height}`).join(" ");
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function DocumentViewer({
  projectId,
  document,
  readOnly = false,
  onPageChange,
}: {
  projectId: string;
  document: ProjectDocument;
  readOnly?: boolean;
  onPageChange?: (pageNumber: number) => void;
}) {
  const blobQuery = useProjectDocumentBlob(document.id);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(document.page_count ?? 1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<AnnotationTool>("view");
  const [color, setColor] = useState("#2563eb");
  const [size, setSize] = useState(3);
  const [surfaceSize, setSurfaceSize] = useState({ width: 900, height: 1200 });
  const [pdf, setPdf] = useState<PdfDocumentLike | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [imageNatural, setImageNatural] = useState({ width: 1200, height: 800 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);

  const annotationsQuery = useDocumentAnnotations(document.id, pageNumber);
  const saveAnnotations = useSaveDocumentAnnotations(document.id, pageNumber);
  const pageCountMutation = useUpdateProjectDocumentPageCount(projectId);
  const updatePageCount = pageCountMutation.mutate;
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
  const [undoStack, setUndoStack] = useState<DocumentAnnotation[][]>([]);
  const [redoStack, setRedoStack] = useState<DocumentAnnotation[][]>([]);
  const drawingRef = useRef<
    | { kind: "pen" | "highlight"; points: AnnotationPoint[] }
    | { kind: "rectangle"; start: AnnotationPoint; current: AnnotationPoint }
    | null
  >(null);
  const [, setDraftVersion] = useState(0);

  const isPdf = document.mime_type === "application/pdf";

  useEffect(() => {
    if (!readOnly) return;
    setTool("view");
    drawingRef.current = null;
    setUndoStack([]);
    setRedoStack([]);
  }, [readOnly]);

  useEffect(() => {
    setPageNumber(1);
    setZoom(1);
    setPdf(null);
    setPdfError(null);
    setUndoStack([]);
    setRedoStack([]);
  }, [document.id]);

  useEffect(() => {
    setAnnotations([]);
    setUndoStack([]);
    setRedoStack([]);
    drawingRef.current = null;
  }, [document.id, pageNumber]);

  useEffect(() => {
    if (!annotationsQuery.data) return;
    setAnnotations(annotationsQuery.data);
  }, [annotationsQuery.data]);

  useEffect(() => {
    const blob = blobQuery.data;
    if (!blob || isPdf) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blobQuery.data, isPdf]);

  useEffect(() => {
    const blob = blobQuery.data;
    if (!blob || !isPdf) {
      setFallbackUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setFallbackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blobQuery.data, isPdf]);

  useEffect(() => {
    if (!isPdf || !blobQuery.data) return;
    let cancelled = false;
    let loaded: PdfDocumentLike | null = null;
    setPdfError(null);

    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const data = await blobQuery.data.arrayBuffer();
        loaded = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          await loaded.destroy?.();
          return;
        }
        setPdf(loaded);
        setPageCount(loaded.numPages);
        if (document.page_count !== loaded.numPages) {
          updatePageCount({
            documentId: document.id,
            pageCount: loaded.numPages,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setPdfError(
            error instanceof Error
              ? error.message
              : "تعذر تحميل عارض PDF.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      void loaded?.destroy?.();
    };
  }, [
    blobQuery.data,
    document.id,
    document.page_count,
    isPdf,
    updatePageCount,
  ]);

  useEffect(() => {
    if (!isPdf || !pdf || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;

    void (async () => {
      try {
        renderTaskRef.current?.cancel?.();
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom * 1.15 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setSurfaceSize({ width: viewport.width, height: viewport.height });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable");
        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setPdfError(
            error instanceof Error ? error.message : "تعذر رسم صفحة PDF.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
    };
  }, [isPdf, pdf, pageNumber, zoom]);

  useEffect(() => {
    setPageNumber((current) => Math.min(current, Math.max(1, pageCount)));
  }, [pageCount]);

  useEffect(() => {
    onPageChange?.(pageNumber);
  }, [onPageChange, pageNumber]);

  const activeStyle = useMemo(() => {
    if (tool === "highlight") {
      return { color: "#facc15", size: Math.max(12, size * 4), opacity: 0.32 };
    }
    if (tool === "rectangle") {
      return { color, size: Math.max(2, size), opacity: 0.85 };
    }
    return { color, size, opacity: 1 };
  }, [color, size, tool]);

  const persist = (next: DocumentAnnotation[], previous = annotations) => {
    if (readOnly) return;
    setUndoStack((stack) => [...stack.slice(-29), previous]);
    setRedoStack([]);
    setAnnotations(next);
    saveAnnotations.mutate(next);
  };

  const undo = () => {
    if (readOnly) return;
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, annotations]);
    setAnnotations(previous);
    saveAnnotations.mutate(previous);
  };

  const redo = () => {
    if (readOnly) return;
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, annotations]);
    setAnnotations(next);
    saveAnnotations.mutate(next);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (readOnly || tool === "view" || tool === "eraser") return;
    const point = normalizedPoint(event, event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "rectangle") {
      drawingRef.current = { kind: "rectangle", start: point, current: point };
    } else {
      drawingRef.current = { kind: tool, points: [point] };
    }
    setDraftVersion((version) => version + 1);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drawing = drawingRef.current;
    if (!drawing) return;
    const point = normalizedPoint(event, event.currentTarget);
    if (drawing.kind === "rectangle") {
      drawing.current = point;
    } else {
      const last = drawing.points.at(-1);
      const dx = (last?.x ?? 0) - point.x;
      const dy = (last?.y ?? 0) - point.y;
      if (Math.hypot(dx, dy) > 0.0015) drawing.points.push(point);
    }
    setDraftVersion((version) => version + 1);
  };

  const finishDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drawing = drawingRef.current;
    if (!drawing) return;
    drawingRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already have been released by the browser.
    }

    if (drawing.kind === "rectangle") {
      const rect = rectFromPoints(drawing.start, drawing.current);
      if (rect.width < 0.003 || rect.height < 0.003) return;
      persist([
        ...annotations,
        createRectangleAnnotation(
          document.id,
          pageNumber,
          rect,
          activeStyle,
        ),
      ]);
      return;
    }

    if (drawing.points.length < 2) return;
    persist([
      ...annotations,
      createStrokeAnnotation(
        document.id,
        pageNumber,
        drawing.kind,
        drawing.points,
        activeStyle,
      ),
    ]);
  };

  const erase = (id: string) => {
    if (readOnly || tool !== "eraser") return;
    persist(annotations.filter((annotation) => annotation.id !== id));
  };

  const draft = drawingRef.current;
  const displayWidth = isPdf ? surfaceSize.width : imageNatural.width * zoom;
  const displayHeight = isPdf ? surfaceSize.height : imageNatural.height * zoom;

  const renderAnnotation = (annotation: DocumentAnnotation) => {
    if ("points" in annotation.geometry) {
      return (
        <polyline
          key={annotation.id}
          points={annotationPath(
            annotation.geometry.points,
            displayWidth,
            displayHeight,
          )}
          fill="none"
          stroke={annotation.color}
          strokeWidth={annotation.size * zoom}
          strokeOpacity={annotation.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={tool === "eraser" ? "cursor-crosshair" : ""}
          pointerEvents={tool === "eraser" ? "stroke" : "none"}
          onPointerDown={() => erase(annotation.id)}
        />
      );
    }

    const rect = annotation.geometry.rect;
    return (
      <rect
        key={annotation.id}
        x={rect.x * displayWidth}
        y={rect.y * displayHeight}
        width={rect.width * displayWidth}
        height={rect.height * displayHeight}
        fill={annotation.color}
        fillOpacity={0.08}
        stroke={annotation.color}
        strokeWidth={annotation.size * zoom}
        strokeOpacity={annotation.opacity}
        className={tool === "eraser" ? "cursor-crosshair" : ""}
        pointerEvents={tool === "eraser" ? "all" : "none"}
        onPointerDown={() => erase(annotation.id)}
      />
    );
  };

  const renderDraft = () => {
    if (!draft) return null;
    if (draft.kind === "rectangle") {
      const rect = rectFromPoints(draft.start, draft.current);
      return (
        <rect
          x={rect.x * displayWidth}
          y={rect.y * displayHeight}
          width={rect.width * displayWidth}
          height={rect.height * displayHeight}
          fill={activeStyle.color}
          fillOpacity={0.08}
          stroke={activeStyle.color}
          strokeWidth={activeStyle.size * zoom}
          strokeDasharray="6 4"
          pointerEvents="none"
        />
      );
    }
    return (
      <polyline
        points={annotationPath(draft.points, displayWidth, displayHeight)}
        fill="none"
        stroke={activeStyle.color}
        strokeWidth={activeStyle.size * zoom}
        strokeOpacity={activeStyle.opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  };

  if (blobQuery.isLoading) {
    return (
      <div className="grid h-full place-items-center bg-muted/30">
        <div className="text-center text-sm text-muted-foreground">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          جارٍ تحميل المستند…
        </div>
      </div>
    );
  }

  if (blobQuery.isError || !blobQuery.data) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-danger/20 bg-card p-5 text-center">
          <p className="font-semibold">تعذر فتح المستند</p>
          <p className="mt-2 text-sm text-muted-foreground">
            تحقق من الملف أو صلاحية الوصول ثم أعد المحاولة.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="frost hairline-b z-20 flex min-h-12 flex-wrap items-center gap-1 px-2 py-1.5">
        {!readOnly && (
        <div className="flex items-center gap-0.5">
          <ToolButton active={tool === "view"} label="عرض وتحريك" onClick={() => setTool("view")}>
            <MousePointer2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === "pen"} label="قلم" onClick={() => setTool("pen")}>
            <PenLine className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === "highlight"}
            label="هاي لايت"
            onClick={() => setTool("highlight")}
          >
            <Highlighter className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === "rectangle"}
            label="تحديد منطقة"
            onClick={() => setTool("rectangle")}
          >
            <Square className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === "eraser"}
            label="ممحاة"
            onClick={() => setTool("eraser")}
          >
            <Eraser className="h-4 w-4" />
          </ToolButton>
        </div>
        )}

        {!readOnly && (
        <>
        <span className="mx-1 h-6 w-px bg-border" />

        <ToolButton label="تراجع" onClick={undo}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="إعادة" onClick={redo}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>

        <span className="mx-1 h-6 w-px bg-border" />

        {tool !== "highlight" && tool !== "eraser" && tool !== "view" && (
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            aria-label="لون الرسم"
            className="h-8 w-8 cursor-pointer rounded-lg border border-border bg-transparent p-1"
          />
        )}
        {(tool === "pen" || tool === "rectangle") && (
          <input
            type="range"
            min={1}
            max={12}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
            aria-label="سُمك الرسم"
            className="w-20"
          />
        )}
        </>
        )}

        {readOnly && (
          <span className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
            عرض فقط
          </span>
        )}

        <div className="ms-auto flex items-center gap-1">
          {isPdf && (
            <>
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="min-w-20 text-center text-xs text-muted-foreground">
                {pageNumber} / {pageCount}
              </span>
              <button
                type="button"
                disabled={pageNumber >= pageCount}
                onClick={() =>
                  setPageNumber((page) => Math.min(pageCount, page + 1))
                }
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="mx-1 h-6 w-px bg-border" />
            </>
          )}

          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
            aria-label="تصغير"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(2.5, value + 0.1))}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
            aria-label="تكبير"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="m-3 flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs">
          <span>تعذر تشغيل عارض PDF المتقدم: {pdfError}</span>
          <a
            href={fallbackUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-brand"
          >
            فتح خارجي <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div
          className="relative mx-auto w-fit overflow-hidden rounded-sm bg-white shadow-lg"
          style={{
            width: displayWidth,
            height: displayHeight,
          }}
        >
          {isPdf ? (
            <canvas ref={canvasRef} className="block bg-white" />
          ) : (
            imageUrl && (
              <img
                src={imageUrl}
                alt={document.file_name}
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setImageNatural({
                    width: image.naturalWidth || 1200,
                    height: image.naturalHeight || 800,
                  });
                }}
                style={{ width: displayWidth, height: displayHeight }}
                className="block select-none object-contain"
              />
            )
          )}

          <svg
            viewBox={`0 0 ${displayWidth} ${displayHeight}`}
            className={`absolute inset-0 h-full w-full ${
              readOnly || tool === "view"
                ? "pointer-events-none"
                : tool === "eraser"
                  ? "cursor-crosshair"
                  : "cursor-crosshair touch-none"
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrawing}
            onPointerCancel={finishDrawing}
          >
            {annotations.map(renderAnnotation)}
            {renderDraft()}
          </svg>
        </div>
      </div>

      <div className="hairline-t flex h-9 shrink-0 items-center gap-3 bg-background px-3 text-[11px] text-muted-foreground">
        <span>{document.file_name}</span>
        <span>·</span>
        <span>
          {readOnly
            ? "عرض فقط"
            : saveAnnotations.isPending
              ? "جارٍ حفظ التعليقات…"
              : "التعليقات محفوظة"}
        </span>
        {annotationsQuery.isLoading && <span>· جارٍ تحميل التعليقات…</span>}
      </div>
    </div>
  );
}
