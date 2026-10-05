import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { recordProjectActivity } from "@/services/live-collaboration.service";

import {
  getProjectAccess,
  inviteProjectMember,
  listProjectCollaborators,
  listProjectInvitations,
  removeProjectMember,
  revokeProjectInvitation,
  updateProjectMemberRole,
} from "@/services/project-collaboration.service";
import type { ProjectRole } from "@/types/collaboration";

export function useProjectAccess(projectId: string) {
  return useQuery({
    queryKey: ["project-access", projectId],
    queryFn: () => getProjectAccess(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useProjectCollaborators(projectId: string) {
  return useQuery({
    queryKey: ["project-collaborators", projectId],
    queryFn: () => listProjectCollaborators(projectId),
    enabled: !!projectId,
  });
}

export function usePortfolioCollaborators(projectIds: string[]) {
  const normalizedIds = [...new Set(projectIds)].sort();

  return useQuery({
    queryKey: ["portfolio-collaborators", normalizedIds],
    queryFn: async () => {
      const entries = await Promise.all(
        normalizedIds.map(async (projectId) => [
          projectId,
          await listProjectCollaborators(projectId),
        ] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: normalizedIds.length > 0,
    staleTime: 30_000,
  });
}

export function useProjectInvitations(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project-invitations", projectId],
    queryFn: () => listProjectInvitations(projectId),
    enabled: !!projectId && enabled,
  });
}

function useInvalidateCollaboration(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["project-collaborators", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-invitations", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-access", projectId],
    });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
}

export function useInviteProjectMember(projectId: string) {
  const invalidate = useInvalidateCollaboration(projectId);
  return useMutation({
    mutationFn: (input: {
      email: string;
      role: Exclude<ProjectRole, "owner">;
    }) => inviteProjectMember({ projectId, ...input }),
    onSuccess: (result) => {
      invalidate();
      void recordProjectActivity({
        projectId,
        action: "member_invited",
        entityType: "member",
        entityId: result.user_id ?? result.invitation_id ?? result.email,
        metadata: {
          email: result.email,
          role: result.role,
          status: result.status,
        },
      }).catch(() => {});
      toast.success(
        result.status === "added"
          ? "تمت إضافة العضو إلى المشروع."
          : "تم حفظ الدعوة وستُفعّل عند تسجيل البريد في النظام.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الدعوة."),
  });
}

export function useUpdateProjectMemberRole(projectId: string) {
  const invalidate = useInvalidateCollaboration(projectId);
  return useMutation({
    mutationFn: (input: {
      userId: string;
      role: Exclude<ProjectRole, "owner">;
    }) => updateProjectMemberRole({ projectId, ...input }),
    onSuccess: (_, input) => {
      invalidate();
      void recordProjectActivity({
        projectId,
        action: "member_role_updated",
        entityType: "member",
        entityId: input.userId,
        metadata: { role: input.role },
      }).catch(() => {});
      toast.success("تم تحديث صلاحية العضو.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذر تحديث الصلاحية."),
  });
}

export function useRemoveProjectMember(projectId: string) {
  const invalidate = useInvalidateCollaboration(projectId);
  return useMutation({
    mutationFn: (userId: string) =>
      removeProjectMember({ projectId, userId }),
    onSuccess: (_, userId) => {
      invalidate();
      void recordProjectActivity({
        projectId,
        action: "member_removed",
        entityType: "member",
        entityId: userId,
      }).catch(() => {});
      toast.success("تمت إزالة العضو من المشروع.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذر إزالة العضو."),
  });
}

export function useRevokeProjectInvitation(projectId: string) {
  const invalidate = useInvalidateCollaboration(projectId);
  return useMutation({
    mutationFn: revokeProjectInvitation,
    onSuccess: () => {
      invalidate();
      toast.success("تم إلغاء الدعوة.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذر إلغاء الدعوة."),
  });
}
