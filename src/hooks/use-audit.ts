import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getProjectAuditSummary,
  listProjectAuditEvents,
  verifyProjectAuditChain,
} from "@/services/audit.service";
import type { ProjectAuditFilters } from "@/types/audit";

export function useProjectAuditEvents(
  projectId: string,
  filters: ProjectAuditFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: ["project-audit", projectId, filters],
    queryFn: () => listProjectAuditEvents(projectId, filters),
    enabled: enabled && !!projectId,
    refetchInterval: enabled ? 20_000 : false,
  });
}

export function useProjectAuditSummary(
  projectId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["project-audit-summary", projectId],
    queryFn: () => getProjectAuditSummary(projectId),
    enabled: enabled && !!projectId,
    refetchInterval: enabled ? 20_000 : false,
  });
}

export function useVerifyProjectAuditChain(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => verifyProjectAuditChain(projectId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["project-audit-summary", projectId],
      });
      if (result.ok) {
        toast.success(
          `تم التحقق من سلامة ${result.checked} سجلًا في سلسلة التدقيق.`,
        );
      } else {
        toast.error(
          `فشل التحقق عند التسلسل #${result.failed_sequence ?? "?"}.`,
        );
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر التحقق من سجل التدقيق.",
      ),
  });
}
