import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listGovernanceAssuranceFindings,
  saveGovernanceAssuranceFinding,
} from "@/services/governance-assurance-findings.service";
import type { SaveGovernanceAssuranceFindingInput } from "@/types/governance-assurance-findings";

export function useGovernanceAssuranceFindings() {
  return useQuery({
    queryKey: ["governance-assurance-findings"],
    queryFn: listGovernanceAssuranceFindings,
    refetchInterval: 20_000,
  });
}

export function useSaveGovernanceAssuranceFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGovernanceAssuranceFindingInput) =>
      saveGovernanceAssuranceFinding(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["governance-assurance-findings"],
      });
      toast.success("تم حفظ Assurance Finding.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Assurance Finding.",
      ),
  });
}
