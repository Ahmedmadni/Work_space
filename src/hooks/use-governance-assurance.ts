import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createExecutiveGovernanceReview,
  finalizeExecutiveGovernanceReview,
  listExecutiveGovernanceReviews,
  updateExecutiveGovernanceReview,
} from "@/services/governance-assurance.service";
import type {
  CreateExecutiveGovernanceReviewInput,
  UpdateExecutiveGovernanceReviewInput,
} from "@/types/governance-assurance";

export function useExecutiveGovernanceReviews() {
  return useQuery({
    queryKey: ["executive-governance-reviews"],
    queryFn: listExecutiveGovernanceReviews,
    refetchInterval: 30_000,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    queryKey: ["executive-governance-reviews"],
  });
}

export function useCreateExecutiveGovernanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExecutiveGovernanceReviewInput) =>
      createExecutiveGovernanceReview(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم إنشاء Governance Assurance Review.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إنشاء Governance Assurance Review.",
      ),
  });
}

export function useUpdateExecutiveGovernanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExecutiveGovernanceReviewInput) =>
      updateExecutiveGovernanceReview(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم تحديث Governance Assurance Review.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث Governance Assurance Review.",
      ),
  });
}

export function useFinalizeExecutiveGovernanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) => finalizeExecutiveGovernanceReview(id, expectedVersion),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم Finalize للمراجعة وقفل Snapshot.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر Finalize للمراجعة.",
      ),
  });
}
