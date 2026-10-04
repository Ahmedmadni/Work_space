import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listPortfolioStrategy,
  listStrategyReviewData,
  recordObjectiveStrategyReview,
  saveObjectiveBenefit,
  savePortfolioObjective,
} from "@/services/strategy.service";
import type {
  RecordStrategyReviewInput,
  SaveObjectiveBenefitInput,
  SavePortfolioObjectiveInput,
} from "@/types/strategy";

export function usePortfolioStrategy() {
  return useQuery({
    queryKey: ["portfolio-strategy"],
    queryFn: listPortfolioStrategy,
    refetchInterval: 20_000,
  });
}

export function useSavePortfolioObjective() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SavePortfolioObjectiveInput) =>
      savePortfolioObjective(input),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: ["portfolio-strategy"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-audit"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-audit-summary"],
      });
      toast.success(input.id ? "تم تحديث الهدف الاستراتيجي." : "تم إنشاء الهدف الاستراتيجي.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ الهدف الاستراتيجي.",
      ),
  });
}


export function useStrategyReviewData() {
  return useQuery({
    queryKey: ["strategy-review-data"],
    queryFn: listStrategyReviewData,
    refetchInterval: 20_000,
  });
}

function invalidateStrategyReview(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["strategy-review-data"] });
  void queryClient.invalidateQueries({ queryKey: ["portfolio-strategy"] });
  void queryClient.invalidateQueries({ queryKey: ["project-audit"] });
  void queryClient.invalidateQueries({ queryKey: ["project-audit-summary"] });
}

export function useSaveObjectiveBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveObjectiveBenefitInput) =>
      saveObjectiveBenefit(input),
    onSuccess: (_, input) => {
      invalidateStrategyReview(queryClient);
      toast.success(input.id ? "تم تحديث المنفعة." : "تم تسجيل المنفعة.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حفظ المنفعة.",
      ),
  });
}

export function useRecordStrategyReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordStrategyReviewInput) =>
      recordObjectiveStrategyReview(input),
    onSuccess: () => {
      invalidateStrategyReview(queryClient);
      toast.success("تم تثبيت Snapshot المراجعة الاستراتيجية.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل المراجعة الاستراتيجية.",
      ),
  });
}
