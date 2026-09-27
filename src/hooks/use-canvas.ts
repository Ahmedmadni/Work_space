import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getBoardCanvas, saveBoardCanvas, searchCanvasNodes } from "@/services/canvas.service";
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
