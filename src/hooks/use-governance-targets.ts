import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listExecutiveGovernanceTargets,
  saveExecutiveGovernanceTargets,
} from "@/services/governance-targets.service";
import type { SaveExecutiveGovernanceTargetsInput } from "@/types/governance-targets";

export function useExecutiveGovernanceTargets() {
  return useQuery({
    queryKey: ["executive-governance-targets"],
    queryFn: listExecutiveGovernanceTargets,
    refetchInterval: 30_000,
  });
}

export function useSaveExecutiveGovernanceTargets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveExecutiveGovernanceTargetsInput) =>
      saveExecutiveGovernanceTargets(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["executive-governance-targets"],
      });
      toast.success("تم حفظ Governance Targets.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Governance Targets.",
      ),
  });
}
