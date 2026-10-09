import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  actOnGovernanceAssuranceFindingAction,
  actOnGovernanceAssuranceFindingVerification,
  addGovernanceAssuranceFindingEvidence,
  classifyGovernanceAssuranceFinding,
  listGovernanceAssuranceFindings,
  requestGovernanceAssuranceFindingVerification,
  saveGovernanceAssuranceFinding,
  saveGovernanceAssuranceFindingAction,
} from "@/services/governance-assurance-findings.service";
import type {
  ActOnGovernanceAssuranceFindingActionInput,
  ActOnGovernanceAssuranceFindingVerificationInput,
  AddGovernanceAssuranceFindingEvidenceInput,
  ClassifyGovernanceAssuranceFindingInput,
  RequestGovernanceAssuranceFindingVerificationInput,
  SaveGovernanceAssuranceFindingActionInput,
  SaveGovernanceAssuranceFindingInput,
} from "@/types/governance-assurance-findings";

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


function invalidateFindings(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    queryKey: ["governance-assurance-findings"],
  });
}

export function useAddGovernanceAssuranceFindingEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddGovernanceAssuranceFindingEvidenceInput) =>
      addGovernanceAssuranceFindingEvidence(input),
    onSuccess: () => {
      invalidateFindings(queryClient);
      toast.success("تمت إضافة Closure Evidence.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إضافة Closure Evidence.",
      ),
  });
}

export function useRequestGovernanceAssuranceFindingVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: RequestGovernanceAssuranceFindingVerificationInput,
    ) => requestGovernanceAssuranceFindingVerification(input),
    onSuccess: () => {
      invalidateFindings(queryClient);
      toast.success("تم إرسال Effectiveness Review إلى Verifier.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر طلب Effectiveness Review.",
      ),
  });
}

export function useActOnGovernanceAssuranceFindingVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: ActOnGovernanceAssuranceFindingVerificationInput,
    ) => actOnGovernanceAssuranceFindingVerification(input),
    onSuccess: (finding) => {
      invalidateFindings(queryClient);
      toast.success(
        finding.verification_status === "effective"
          ? "تم اعتماد فعالية المعالجة."
          : "تم تسجيل نتيجة التحقق وإعادة فتح Finding.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل Effectiveness Review.",
      ),
  });
}


export function useClassifyGovernanceAssuranceFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClassifyGovernanceAssuranceFindingInput) =>
      classifyGovernanceAssuranceFinding(input),
    onSuccess: () => {
      invalidateFindings(queryClient);
      toast.success("تم حفظ Taxonomy وRoot Cause وRecurrence.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Finding Taxonomy.",
      ),
  });
}


export function useSaveGovernanceAssuranceFindingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGovernanceAssuranceFindingActionInput) =>
      saveGovernanceAssuranceFindingAction(input),
    onSuccess: () => {
      invalidateFindings(queryClient);
      toast.success("تم حفظ CAPA Action.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ CAPA Action.",
      ),
  });
}


export function useActOnGovernanceAssuranceFindingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActOnGovernanceAssuranceFindingActionInput) =>
      actOnGovernanceAssuranceFindingAction(input),
    onSuccess: (action) => {
      invalidateFindings(queryClient);
      toast.success(
        action.status === "completed"
          ? "تم إكمال CAPA Action."
          : "تم بدء CAPA Action.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث CAPA Action.",
      ),
  });
}
