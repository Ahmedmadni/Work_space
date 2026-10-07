import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  finalizeExecutiveStrategyMeeting,
  listExecutiveStrategyMeetings,
  saveExecutiveStrategyMeeting,
  updateExecutiveMeetingActionItem,
} from "@/services/executive-meetings.service";
import type {
  SaveExecutiveStrategyMeetingInput,
  UpdateExecutiveMeetingActionInput,
} from "@/types/executive-meetings";

export function useExecutiveStrategyMeetings() {
  return useQuery({
    queryKey: ["executive-strategy-meetings"],
    queryFn: listExecutiveStrategyMeetings,
    refetchInterval: 20_000,
  });
}

function invalidateMeetingGovernance(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({
    queryKey: ["executive-strategy-meetings"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["portfolio-action-center"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["project-action-center"],
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
}

export function useSaveExecutiveStrategyMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveExecutiveStrategyMeetingInput) =>
      saveExecutiveStrategyMeeting(input),
    onSuccess: (_, input) => {
      invalidateMeetingGovernance(queryClient);
      toast.success(input.id ? "تم تحديث مسودة الاجتماع." : "تم إنشاء الاجتماع.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ الاجتماع.",
      ),
  });
}

export function useFinalizeExecutiveStrategyMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { meetingId: string; expectedVersion: number }) =>
      finalizeExecutiveStrategyMeeting(
        input.meetingId,
        input.expectedVersion,
      ),
    onSuccess: () => {
      invalidateMeetingGovernance(queryClient);
      toast.success("تم اعتماد محضر الاجتماع وإقفاله.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر اعتماد محضر الاجتماع.",
      ),
  });
}

export function useUpdateExecutiveMeetingActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExecutiveMeetingActionInput) =>
      updateExecutiveMeetingActionItem(input),
    onSuccess: () => {
      invalidateMeetingGovernance(queryClient);
      toast.success("تم تحديث Action Item.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث Action Item.",
      ),
  });
}
