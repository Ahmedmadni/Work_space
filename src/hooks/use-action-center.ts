import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listProjectActionCenter,
  saveProjectDecision,
  saveProjectRisk,
} from "@/services/action-center.service";
import type {
  SaveProjectDecisionInput,
  SaveProjectRiskInput,
} from "@/types/action-center";

export function useProjectActionCenter(projectId: string) {
  return useQuery({
    queryKey: ["project-action-center", projectId],
    queryFn: () => listProjectActionCenter(projectId),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["project-action-center", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-execution-summary"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-audit"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-audit-summary", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-activity", projectId],
    });
  };
}

export function useSaveProjectRisk(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (input: SaveProjectRiskInput) =>
      saveProjectRisk(projectId, input),
    onSuccess: (_, input) => {
      invalidate();
      toast.success(input.id ? "تم تحديث الخطر." : "تم تسجيل الخطر.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ سجل الخطر.",
      ),
  });
}

export function useSaveProjectDecision(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (input: SaveProjectDecisionInput) =>
      saveProjectDecision(projectId, input),
    onSuccess: (_, input) => {
      invalidate();
      toast.success(input.id ? "تم تحديث القرار." : "تم تسجيل القرار.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ سجل القرار.",
      ),
  });
}
