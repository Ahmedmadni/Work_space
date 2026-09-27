import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getBoardCanvas, saveBoardCanvas } from "@/services/canvas.service";
import type { BoardCanvasSnapshot } from "@/types";

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
