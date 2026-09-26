import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listArchivedProjects,
  listProjects,
  restoreProject,
  updateProject,
} from "@/services/projects.service";
import type { CreateProjectInput, ProjectStatus } from "@/types";

export const projectKeys = {
  list: (workspaceId?: string) => ["projects", workspaceId ?? "all"] as const,
  archived: ["projects", "archived"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export function useProjects(workspaceId?: string) {
  return useQuery({
    queryKey: projectKeys.list(workspaceId),
    queryFn: () => listProjects(workspaceId),
  });
}

export function useArchivedProjects() {
  return useQuery({ queryKey: projectKeys.archived, queryFn: listArchivedProjects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) });
}

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    void queryClient.invalidateQueries({ queryKey: ["boards"] });
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: (project) => {
      invalidate();
      toast.success(`تم إنشاء مشروع «${project.name}»`);
    },
    onError: () => toast.error("تعذر إنشاء المشروع، حاول مرة أخرى."),
  });
}

export function useUpdateProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      description?: string | null;
      status?: ProjectStatus;
    }) => updateProject(id, patch),
    onSuccess: () => {
      invalidate();
      toast.success("تم تحديث المشروع");
    },
  });
}

export function useArchiveProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => archiveProject(id),
    onSuccess: () => {
      invalidate();
      toast.success("تم أرشفة المشروع");
    },
  });
}

export function useRestoreProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => restoreProject(id),
    onSuccess: () => {
      invalidate();
      toast.success("تمت استعادة المشروع");
    },
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      invalidate();
      toast.success("تم حذف المشروع ولوحاته");
    },
  });
}
