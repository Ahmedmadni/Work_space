import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listArchivedWorkspaces,
  listWorkspaces,
  renameWorkspace,
  restoreWorkspace,
} from "@/services/workspaces.service";
import type { CreateWorkspaceInput } from "@/types";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  archived: ["workspaces", "archived"] as const,
  detail: (id: string) => ["workspaces", id] as const,
};

export function useWorkspaces() {
  return useQuery({ queryKey: workspaceKeys.all, queryFn: listWorkspaces });
}

export function useArchivedWorkspaces() {
  return useQuery({ queryKey: workspaceKeys.archived, queryFn: listArchivedWorkspaces });
}

export function useWorkspace(id: string) {
  return useQuery({ queryKey: workspaceKeys.detail(id), queryFn: () => getWorkspace(id) });
}

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["boards"] });
  };
}

export function useCreateWorkspace() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
    onSuccess: (workspace) => {
      invalidate();
      toast.success(`تم إنشاء مساحة «${workspace.name}»`);
    },
    onError: () => toast.error("تعذر إنشاء المساحة، حاول مرة أخرى."),
  });
}

export function useRenameWorkspace() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameWorkspace(id, name),
    onSuccess: () => {
      invalidate();
      toast.success("تم تحديث اسم المساحة");
    },
  });
}

export function useArchiveWorkspace() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => archiveWorkspace(id),
    onSuccess: () => {
      invalidate();
      toast.success("تم أرشفة المساحة");
    },
  });
}

export function useRestoreWorkspace() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => restoreWorkspace(id),
    onSuccess: () => {
      invalidate();
      toast.success("تمت استعادة المساحة");
    },
  });
}

export function useDeleteWorkspace() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: () => {
      invalidate();
      toast.success("تم حذف المساحة وكل ما تحتويه");
    },
  });
}
