import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listPortfolioStrategy,
  savePortfolioObjective,
} from "@/services/strategy.service";
import type { SavePortfolioObjectiveInput } from "@/types/strategy";

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
