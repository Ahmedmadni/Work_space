import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createExecutiveGovernanceReview,
  finalizeExecutiveGovernanceReview,
  acknowledgeGovernanceAssuranceDistribution,
  actOnGovernanceAssuranceAttestation,
  closeGovernanceAssuranceDistribution,
  distributeGovernanceAssurancePack,
  listExecutiveGovernanceReviews,
  listGovernanceAssuranceCadence,
  listGovernanceAssuranceDistributions,
  listGovernanceAssuranceSignoffs,
  saveGovernanceAssuranceCadence,
  saveGovernanceAssuranceDistributionPlan,
  saveGovernanceAssuranceSignoffPlan,
  updateExecutiveGovernanceReview,
} from "@/services/governance-assurance.service";
import type {
  AcknowledgeGovernanceAssuranceDistributionInput,
  ActOnGovernanceAssuranceAttestationInput,
  CreateExecutiveGovernanceReviewInput,
  SaveGovernanceAssuranceCadenceInput,
  SaveGovernanceAssuranceDistributionPlanInput,
  SaveGovernanceAssuranceSignoffPlanInput,
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
  void queryClient.invalidateQueries({
    queryKey: ["governance-assurance-cadence"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["governance-assurance-signoffs"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["governance-assurance-distributions"],
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


export function useGovernanceAssuranceCadence() {
  return useQuery({
    queryKey: ["governance-assurance-cadence"],
    queryFn: listGovernanceAssuranceCadence,
    refetchInterval: 30_000,
  });
}

export function useSaveGovernanceAssuranceCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGovernanceAssuranceCadenceInput) =>
      saveGovernanceAssuranceCadence(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم حفظ Assurance Review Cadence.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Assurance Review Cadence.",
      ),
  });
}


export function useGovernanceAssuranceSignoffs() {
  return useQuery({
    queryKey: ["governance-assurance-signoffs"],
    queryFn: listGovernanceAssuranceSignoffs,
    refetchInterval: 20_000,
  });
}

export function useSaveGovernanceAssuranceSignoffPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGovernanceAssuranceSignoffPlanInput) =>
      saveGovernanceAssuranceSignoffPlan(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم حفظ Assurance Sign-off Plan.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Assurance Sign-off Plan.",
      ),
  });
}

export function useActOnGovernanceAssuranceAttestation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActOnGovernanceAssuranceAttestationInput) =>
      actOnGovernanceAssuranceAttestation(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم تسجيل Attestation.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل Attestation.",
      ),
  });
}


export function useGovernanceAssuranceDistributions() {
  return useQuery({
    queryKey: ["governance-assurance-distributions"],
    queryFn: listGovernanceAssuranceDistributions,
    refetchInterval: 20_000,
  });
}

export function useSaveGovernanceAssuranceDistributionPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGovernanceAssuranceDistributionPlanInput) =>
      saveGovernanceAssuranceDistributionPlan(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم حفظ Distribution Register.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Distribution Register.",
      ),
  });
}

export function useDistributeGovernanceAssurancePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      distributionId,
      expectedVersion,
    }: {
      distributionId: string;
      expectedVersion: number;
    }) =>
      distributeGovernanceAssurancePack(
        distributionId,
        expectedVersion,
      ),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم توزيع Governance Assurance Pack.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر توزيع Governance Assurance Pack.",
      ),
  });
}

export function useAcknowledgeGovernanceAssuranceDistribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcknowledgeGovernanceAssuranceDistributionInput) =>
      acknowledgeGovernanceAssuranceDistribution(input),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم تسجيل Acknowledgement.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل Acknowledgement.",
      ),
  });
}

export function useCloseGovernanceAssuranceDistribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      distributionId,
      expectedVersion,
    }: {
      distributionId: string;
      expectedVersion: number;
    }) =>
      closeGovernanceAssuranceDistribution(
        distributionId,
        expectedVersion,
      ),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم إغلاق Distribution Register.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إغلاق Distribution Register.",
      ),
  });
}
