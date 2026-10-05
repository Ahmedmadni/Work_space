import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listObjectiveRecoveryPlans,
  saveObjectiveRecoveryPlan,
} from "@/services/strategy-recovery.service";
import type { SaveObjectiveRecoveryPlanInput } from "@/types/strategy";

export function useStrategyRecoveryPlans() {
  return useQuery({
    queryKey: ["strategy-recovery-plans"],
    queryFn: listObjectiveRecoveryPlans,
    refetchInterval: 20_000,
  });
}

export function useSaveObjectiveRecoveryPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveObjectiveRecoveryPlanInput) =>
      saveObjectiveRecoveryPlan(input),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: ["strategy-recovery-plans"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-audit"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-audit-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-activity"],
      });
      toast.success(input.id ? "تم تحديث خطة التعافي." : "تم إنشاء خطة التعافي.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ خطة التعافي.",
      ),
  });
}
