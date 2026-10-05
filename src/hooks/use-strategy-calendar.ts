import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  acknowledgeObjectiveKrCheckin,
  listStrategyCalendar,
  recordRecoveryCheckpoint,
  saveObjectiveStrategyCadence,
  saveRecoveryCheckpointCadence,
} from "@/services/strategy-calendar.service";
import type {
  RecordRecoveryCheckpointInput,
  SaveObjectiveStrategyCadenceInput,
  SaveRecoveryCheckpointCadenceInput,
} from "@/types/strategy";

export function useStrategyCalendar() {
  return useQuery({
    queryKey: ["strategy-calendar"],
    queryFn: listStrategyCalendar,
    refetchInterval: 20_000,
  });
}

function invalidateStrategyCalendar(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({ queryKey: ["strategy-calendar"] });
  void queryClient.invalidateQueries({ queryKey: ["strategy-review-data"] });
  void queryClient.invalidateQueries({ queryKey: ["strategy-recovery-plans"] });
  void queryClient.invalidateQueries({ queryKey: ["project-audit"] });
  void queryClient.invalidateQueries({ queryKey: ["project-audit-summary"] });
  void queryClient.invalidateQueries({ queryKey: ["project-activity"] });
}

export function useSaveObjectiveStrategyCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveObjectiveStrategyCadenceInput) =>
      saveObjectiveStrategyCadence(input),
    onSuccess: () => {
      invalidateStrategyCalendar(queryClient);
      toast.success("تم تحديث cadence الاستراتيجية.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ cadence.",
      ),
  });
}

export function useAcknowledgeObjectiveKrCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { objectiveId: string; checkinDate?: string }) =>
      acknowledgeObjectiveKrCheckin(input.objectiveId, input.checkinDate),
    onSuccess: () => {
      invalidateStrategyCalendar(queryClient);
      toast.success("تم تسجيل تحديث Key Results.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل تحديث Key Results.",
      ),
  });
}

export function useSaveRecoveryCheckpointCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveRecoveryCheckpointCadenceInput) =>
      saveRecoveryCheckpointCadence(input),
    onSuccess: () => {
      invalidateStrategyCalendar(queryClient);
      toast.success("تم تحديث Recovery Checkpoint cadence.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حفظ Recovery cadence.",
      ),
  });
}

export function useRecordRecoveryCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordRecoveryCheckpointInput) =>
      recordRecoveryCheckpoint(input),
    onSuccess: () => {
      invalidateStrategyCalendar(queryClient);
      toast.success("تم تسجيل Recovery Checkpoint.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل Recovery Checkpoint.",
      ),
  });
}
