import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getCurrentTaskUserId,
  listCanvasNodeWatchers,
  setCanvasNodeAssignee,
  setCanvasNodeWatching,
  updateCanvasNodeExecution,
} from "@/services/task-execution.service";
import type {
  BoardCanvasSnapshot,
  CanvasNodeAssignment,
  CanvasNodeExecutionUpdate,
  CanvasNodeStatus,
  CanvasPriority,
} from "@/types";

export function useCanvasNodeWatchers(
  projectId: string,
  boardId: string,
  nodeId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["canvas-node-watchers", projectId, boardId, nodeId],
    queryFn: () =>
      listCanvasNodeWatchers({
        projectId,
        boardId,
        nodeId,
      }),
    enabled: enabled && !!projectId && !!boardId && !!nodeId,
    refetchInterval: enabled ? 8_000 : false,
  });
}

export function useSetCanvasNodeWatching(
  projectId: string,
  boardId: string,
  nodeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (watching: boolean) =>
      setCanvasNodeWatching({
        projectId,
        boardId,
        nodeId,
        watching,
      }),
    onSuccess: (_, watching) => {
      void queryClient.invalidateQueries({
        queryKey: ["canvas-node-watchers", projectId, boardId, nodeId],
      });
      toast.success(watching ? "أنت تتابع هذا العنصر الآن." : "تم إيقاف متابعة العنصر.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر تحديث المتابعة.",
      ),
  });
}

export function useSetCanvasNodeAssignee(
  projectId: string,
  boardId: string,
  nodeId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      assigneeUserId: string | null;
      assigneeName?: string | null;
    }) =>
      setCanvasNodeAssignee({
        projectId,
        boardId,
        nodeId,
        ...input,
      }),
    onSuccess: (assignment: CanvasNodeAssignment) => {
      queryClient.setQueryData<BoardCanvasSnapshot>(
        ["canvas", boardId],
        (current) =>
          current
            ? {
                ...current,
                nodes: current.nodes.map((node) =>
                  node.id === nodeId
                    ? {
                        ...node,
                        assignee_user_id: assignment.assignee_user_id,
                        assignee_name: assignment.assignee_name,
                        owner: assignment.assignee_name,
                      }
                    : node,
                ),
              }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: ["project-execution-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["canvas-search"],
      });
      toast.success(
        assignment.assignee_user_id
          ? "تم تعيين المسؤول عن العنصر."
          : "تم إلغاء تعيين المسؤول.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر تحديث المسؤول.",
      ),
  });
}

export function useUpdateCanvasNodeExecution(
  projectId: string,
  boardId: string,
  nodeId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      expectedVersion: number;
      status?: CanvasNodeStatus;
      priority?: CanvasPriority | null;
    }) =>
      updateCanvasNodeExecution({
        projectId,
        boardId,
        nodeId,
        ...input,
      }),
    onSuccess: (update: CanvasNodeExecutionUpdate) => {
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
                        status: update.status,
                        priority: update.priority,
                        progress: update.progress,
                        updated_at: update.updated_at,
                      }
                    : node,
                ),
              }
            : current,
      );

      void queryClient.invalidateQueries({
        queryKey: ["project-execution-summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["canvas-search"],
      });
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
          : "تعذر تحديث المهمة.",
      );
    },
  });
}

export function useCurrentTaskUserId() {
  return getCurrentTaskUserId();
}
