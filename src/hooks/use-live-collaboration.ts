import {
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createProjectComment,
  deleteProjectComment,
  endProjectPresence,
  heartbeatProjectPresence,
  listBoardNodeReviewSummary,
  listProjectActivity,
  listProjectComments,
  listProjectPresence,
  recordProjectActivity,
  setProjectCommentResolved,
  updateProjectComment,
} from "@/services/live-collaboration.service";
import type {
  CreateProjectCommentInput,
  PresenceContextType,
  ProjectCommentFilters,
  RecordProjectActivityInput,
} from "@/types/live-collaboration";

function sessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const hex = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return hex.replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function useBoardNodeReviewSummary(
  projectId: string,
  boardId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["board-node-review-summary", projectId, boardId],
    queryFn: () => listBoardNodeReviewSummary(projectId, boardId),
    enabled: enabled && !!projectId && !!boardId,
    refetchInterval: enabled ? 4_000 : false,
  });
}

export function useProjectComments(
  projectId: string,
  filters: ProjectCommentFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ["project-comments", projectId, filters],
    queryFn: () => listProjectComments(projectId, filters),
    enabled: enabled && !!projectId,
    refetchInterval: enabled ? 5_000 : false,
  });
}

function useInvalidateLive(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["project-comments", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-activity", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["board-node-review-summary", projectId],
    });
  };
}

export function useCreateProjectComment(projectId: string) {
  const invalidate = useInvalidateLive(projectId);
  return useMutation({
    mutationFn: (input: Omit<CreateProjectCommentInput, "projectId">) =>
      createProjectComment({ projectId, ...input }),
    onSuccess: () => {
      invalidate();
      toast.success("تمت إضافة التعليق.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر إضافة التعليق.",
      ),
  });
}

export function useUpdateProjectComment(projectId: string) {
  const invalidate = useInvalidateLive(projectId);
  return useMutation({
    mutationFn: (input: {
      commentId: string;
      body: string;
      mentionUserIds?: string[];
    }) => updateProjectComment({ projectId, ...input }),
    onSuccess: () => {
      invalidate();
      toast.success("تم تحديث التعليق.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر تحديث التعليق.",
      ),
  });
}

export function useResolveProjectComment(projectId: string) {
  const invalidate = useInvalidateLive(projectId);
  return useMutation({
    mutationFn: (input: { commentId: string; resolved: boolean }) =>
      setProjectCommentResolved({ projectId, ...input }),
    onSuccess: () => invalidate(),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر تحديث حالة التعليق.",
      ),
  });
}

export function useDeleteProjectComment(projectId: string) {
  const invalidate = useInvalidateLive(projectId);
  return useMutation({
    mutationFn: (commentId: string) =>
      deleteProjectComment({ projectId, commentId }),
    onSuccess: () => {
      invalidate();
      toast.success("تم حذف التعليق.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "تعذر حذف التعليق.",
      ),
  });
}

export function useProjectActivity(
  projectId: string,
  enabled = true,
  limit = 80,
) {
  return useQuery({
    queryKey: ["project-activity", projectId, limit],
    queryFn: () => listProjectActivity(projectId, limit),
    enabled: enabled && !!projectId,
    refetchInterval: enabled ? 6_000 : false,
  });
}

export function useRecordProjectActivity(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<RecordProjectActivityInput, "projectId">) =>
      recordProjectActivity({ projectId, ...input }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["project-activity", projectId],
      }),
  });
}

export function useProjectPresence(
  projectId: string,
  contextType: PresenceContextType,
  contextId: string | null,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const sessionRef = useRef<string | null>(null);
  if (sessionRef.current === null) sessionRef.current = sessionId();
  const currentSessionId = sessionRef.current;

  const query = useQuery({
    queryKey: ["project-presence", projectId],
    queryFn: () => listProjectPresence(projectId),
    enabled: enabled && !!projectId,
    refetchInterval: enabled ? 6_000 : false,
  });

  const stableContext = useMemo(
    () => ({ contextType, contextId }),
    [contextType, contextId],
  );

  useEffect(() => {
    if (!enabled || !projectId || !currentSessionId) return;

    let active = true;
    const beat = async () => {
      try {
        await heartbeatProjectPresence({
          projectId,
          sessionId: currentSessionId,
          contextType: stableContext.contextType,
          contextId: stableContext.contextId,
        });
        if (active) {
          void queryClient.invalidateQueries({
            queryKey: ["project-presence", projectId],
          });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[presence] تعذر تحديث الحضور.", error);
        }
      }
    };

    void beat();
    const timer = window.setInterval(() => void beat(), 12_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      void endProjectPresence({
        projectId,
        sessionId: currentSessionId,
      }).catch(() => {
        // Expiry handles abandoned sessions.
      });
    };
  }, [
    currentSessionId,
    enabled,
    projectId,
    queryClient,
    stableContext,
  ]);

  return query;
}
