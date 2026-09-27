import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { recordProjectActivity } from "@/services/live-collaboration.service";
import { saveCollaborativeBoardCanvas } from "@/services/canvas-collaboration.service";
import {
  getBoardCanvas,
  getProjectExecutionSummary,
  searchCanvasNodes,
} from "@/services/canvas.service";
import {
  createBoardVersion,
  importBoardBackup,
  listBoardVersions,
  maybeCreateAutoCheckpoint,
  restoreBoardVersion,
} from "@/services/canvas-history.service";
import type { BoardCanvasSnapshot, CanvasNodeSearchFilters } from "@/types";

export function useBoardCanvas(boardId: string) {
  return useQuery({
    queryKey: ["canvas", boardId],
    queryFn: () => getBoardCanvas(boardId),
  });
}

const boardActivityAt = new Map<string, number>();

export function useSaveBoardCanvas(boardId: string, projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `canvas-save:${boardId}` },
    mutationFn: async ({
      snapshot,
      baseSnapshot,
    }: {
      snapshot: BoardCanvasSnapshot;
      baseSnapshot: BoardCanvasSnapshot;
    }) => saveCollaborativeBoardCanvas(snapshot, baseSnapshot),
    onSuccess: (result) => {
      const snapshot = result.snapshot;
      qc.setQueryData(["canvas", boardId], snapshot);
      void qc.invalidateQueries({ queryKey: ["canvas-search"] });
      void qc.invalidateQueries({ queryKey: ["project-execution-summary"] });

      if (projectId && result.applied_count > 0) {
        const last = boardActivityAt.get(boardId) ?? 0;
        if (Date.now() - last >= 60_000) {
          boardActivityAt.set(boardId, Date.now());
          void recordProjectActivity({
            projectId,
            action: "board_updated",
            entityType: "board",
            entityId: boardId,
            metadata: {
              revision: result.revision,
              node_count: snapshot.nodes.length,
              edge_count: snapshot.edges.length,
              stroke_count: snapshot.strokes.length,
              conflicts: result.conflicts.length,
            },
          }).catch((error) => {
            if (import.meta.env.DEV) console.warn("[activity] تعذر تسجيل تحديث اللوحة.", error);
          });
        }
      }

      if (!result.conflicts.length && result.applied_count > 0) {
        void maybeCreateAutoCheckpoint(snapshot)
          .then((version) => {
            if (version) {
              void qc.invalidateQueries({
                queryKey: ["canvas-versions", boardId],
              });
            }
          })
          .catch((error) => {
            if (import.meta.env.DEV) console.warn("[history] تعذر إنشاء checkpoint تلقائي.", error);
          });
      }
    },
  });
}


export function useCanvasNodeSearch(
  boardIds: string[],
  filters: CanvasNodeSearchFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: ["canvas-search", boardIds, filters],
    queryFn: () => searchCanvasNodes(boardIds, filters),
    enabled: enabled && boardIds.length > 0,
  });
}


export function useProjectExecutionSummary(boardIds: string[]) {
  return useQuery({
    queryKey: ["project-execution-summary", boardIds],
    queryFn: () => getProjectExecutionSummary(boardIds),
    enabled: boardIds.length > 0,
  });
}


export function useBoardVersions(boardId: string) {
  return useQuery({
    queryKey: ["canvas-versions", boardId],
    queryFn: () => listBoardVersions(boardId),
    enabled: !!boardId,
  });
}

export function useCreateBoardVersion(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      snapshot,
      label,
    }: {
      snapshot: BoardCanvasSnapshot;
      label?: string | null;
    }) => createBoardVersion(snapshot, "manual", label ?? null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["canvas-versions", boardId] });
    },
  });
}

export function useRestoreBoardVersion(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => restoreBoardVersion(boardId, versionId),
    onSuccess: (snapshot) => {
      qc.setQueryData(["canvas", boardId], snapshot);
      void qc.invalidateQueries({ queryKey: ["canvas-versions", boardId] });
      void qc.invalidateQueries({ queryKey: ["canvas-search"] });
      void qc.invalidateQueries({ queryKey: ["project-execution-summary"] });
    },
  });
}

export function useImportBoardBackup(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (backup: unknown) => importBoardBackup(boardId, backup),
    onSuccess: (snapshot) => {
      qc.setQueryData(["canvas", boardId], snapshot);
      void qc.invalidateQueries({ queryKey: ["canvas-versions", boardId] });
      void qc.invalidateQueries({ queryKey: ["canvas-search"] });
      void qc.invalidateQueries({ queryKey: ["project-execution-summary"] });
    },
  });
}
