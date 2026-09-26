import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  archiveBoard,
  createBoard,
  deleteBoard,
  getBoard,
  listArchivedBoards,
  listBoards,
  restoreBoard,
  toggleBoardFavorite,
  updateBoard,
} from "@/services/boards.service";
import type { CreateBoardInput } from "@/types";

type Filter = Parameters<typeof listBoards>[0];

export function useBoards(filter?: Filter) {
  return useQuery({ queryKey: ["boards", filter ?? {}], queryFn: () => listBoards(filter) });
}
export function useArchivedBoards() {
  return useQuery({ queryKey: ["boards", "archived"], queryFn: listArchivedBoards });
}
export function useBoard(id: string) {
  return useQuery({ queryKey: ["boards", "detail", id], queryFn: () => getBoard(id) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["boards"] });
    void qc.invalidateQueries({ queryKey: ["workspaces"] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
  };
}

export function useCreateBoard() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateBoardInput) => createBoard(input),
    onSuccess: (b) => {
      inv();
      toast.success(`تم إنشاء لوحة «${b.name}»`);
    },
    onError: () => toast.error("تعذر إنشاء اللوحة."),
  });
}
export function useToggleFavorite() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => toggleBoardFavorite(id), onSuccess: inv });
}
export function useArchiveBoard() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => archiveBoard(id),
    onSuccess: () => {
      inv();
      toast.success("تمت أرشفة اللوحة");
    },
  });
}
export function useRestoreBoard() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => restoreBoard(id),
    onSuccess: () => {
      inv();
      toast.success("تمت استعادة اللوحة");
    },
  });
}
export function useDeleteBoard() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteBoard(id),
    onSuccess: () => {
      inv();
      toast.success("تم حذف اللوحة نهائيًا");
    },
  });
}

export function useUpdateBoard() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; description?: string | null }) =>
      updateBoard(id, patch),
    onSuccess: () => {
      inv();
      toast.success("تم تحديث اللوحة");
    },
    onError: () => toast.error("تعذر تحديث اللوحة."),
  });
}
