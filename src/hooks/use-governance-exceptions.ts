import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createExecutiveGovernanceException,
  listExecutiveGovernanceExceptions,
  updateExecutiveGovernanceException,
} from "@/services/governance-exceptions.service";
import type {
  CreateExecutiveGovernanceExceptionInput,
  UpdateExecutiveGovernanceExceptionInput,
} from "@/types/governance-exceptions";

export function useExecutiveGovernanceExceptions() {
  return useQuery({
    queryKey: ["executive-governance-exceptions"],
    queryFn: listExecutiveGovernanceExceptions,
    refetchInterval: 30_000,
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({
    queryKey: ["executive-governance-exceptions"],
  });
}

export function useCreateExecutiveGovernanceException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExecutiveGovernanceExceptionInput) =>
      createExecutiveGovernanceException(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم تسجيل Governance Exception.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل Governance Exception.",
      ),
  });
}

export function useUpdateExecutiveGovernanceException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExecutiveGovernanceExceptionInput) =>
      updateExecutiveGovernanceException(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم تحديث Governance Exception.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث Governance Exception.",
      ),
  });
}
