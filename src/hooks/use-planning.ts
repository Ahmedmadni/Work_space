import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createProjectScheduleBaseline,
  listProjectPlanningData,
  setProjectMemberCapacity,
  updateCanvasNodeSchedule,
} from "@/services/planning.service";
import type {
  BoardCanvasSnapshot,
  ProjectExecutionSummary,
} from "@/types";
import type {
  CanvasNodeScheduleUpdate,
  ProjectScheduleBaselineItem,
  UpdateCanvasNodeScheduleInput,
} from "@/types/planning";

export function useProjectPlanningData(projectId: string) {
  return useQuery({
    queryKey: ["project-planning", projectId],
    queryFn: () => listProjectPlanningData(projectId),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
}

export function usePortfolioPlanningData(projectIds: string[]) {
  const normalizedIds = [...new Set(projectIds)].sort();

  return useQuery({
    queryKey: ["portfolio-planning", normalizedIds],
    queryFn: async () => {
      const entries = await Promise.all(
        normalizedIds.map(async (projectId) => [
          projectId,
          await listProjectPlanningData(projectId),
        ] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: normalizedIds.length > 0,
    refetchInterval: 20_000,
  });
}

export function useUpdateCanvasNodeSchedule(
  projectId: string,
  boardId: string,
  nodeId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: Omit<
        UpdateCanvasNodeScheduleInput,
        "projectId" | "boardId" | "nodeId"
      >,
    ) =>
      updateCanvasNodeSchedule({
        projectId,
        boardId,
        nodeId,
        ...input,
      }),
    onSuccess: (update: CanvasNodeScheduleUpdate) => {
      queryClient.setQueryData<BoardCanvasSnapshot>(
        ["canvas", boardId],
        (current) =>
          current
            ? {
                ...current,
                ...(update.revision !== undefined
                  ? {
                      revision: Math.max(
                        current.revision ?? 0,
                        update.revision,
                      ),
                    }
                  : {}),
                nodes: current.nodes.map((node) =>
                  node.id === nodeId
                    ? {
                        ...node,
                        version: update.version,
                        start_date: update.start_date,
                        due_date: update.due_date,
                        effort_hours: update.effort_hours,
                        updated_at: update.updated_at,
                      }
                    : node,
                ),
              }
            : current,
      );

      queryClient.setQueriesData<ProjectExecutionSummary>(
        { queryKey: ["project-execution-summary"] },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.board_id === boardId && item.node.id === nodeId
                    ? {
                        ...item,
                        node: {
                          ...item.node,
                          version: update.version,
                          start_date: update.start_date,
                          due_date: update.due_date,
                          effort_hours: update.effort_hours,
                          updated_at: update.updated_at,
                        },
                      }
                    : item,
                ),
              }
            : current,
      );

      void queryClient.invalidateQueries({
        queryKey: ["project-planning", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-execution-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["canvas-search"],
      });
      toast.success("تم تحديث خطة المهمة.");
    },
    onError: (error) => {
      void queryClient.invalidateQueries({
        queryKey: ["canvas", boardId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-execution-summary"],
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث خطة المهمة.",
      );
    },
  });
}

export function useSetProjectMemberCapacity(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      weeklyCapacityHours: number;
    }) =>
      setProjectMemberCapacity({
        projectId,
        ...input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-planning", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["portfolio-planning"],
      });
      toast.success("تم تحديث السعة الأسبوعية.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث السعة الأسبوعية.",
      ),
  });
}

export function useCreateProjectScheduleBaseline(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      localItems?: ProjectScheduleBaselineItem[];
    }) =>
      createProjectScheduleBaseline({
        projectId,
        ...input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-planning", projectId],
      });
      toast.success("تم حفظ Baseline للخطة الحالية.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إنشاء Baseline.",
      ),
  });
}
