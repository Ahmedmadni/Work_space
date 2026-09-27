import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getBoardCanvas,
  getProjectExecutionSummary,
  saveBoardCanvas,
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

export function useSaveBoardCanvas(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshot: BoardCanvasSnapshot) => saveBoardCanvas(snapshot),
    onSuccess: (snapshot) => {
      qc.setQueryData(["canvas", boardId], snapshot);
      void qc.invalidateQueries({ queryKey: ["canvas-search"] });
      void qc.invalidateQueries({ queryKey: ["project-execution-summary"] });
      void maybeCreateAutoCheckpoint(snapshot).then((version) => {
        if (version) void qc.invalidateQueries({ queryKey: ["canvas-versions", boardId] });
      });
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
