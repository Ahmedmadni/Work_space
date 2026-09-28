import {
  useEffect,
  useRef,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getProjectAutomationHealth,
  listProjectAutomationRules,
  listProjectAutomationRuns,
  refreshProjectAutomations,
  retryProjectAutomationRun,
  setProjectAutomationEnabled,
  testProjectAutomationRule,
  updateProjectAutomationConfig,
} from "@/services/automations.service";

export function useProjectAutomationRules(projectId: string) {
  return useQuery({
    queryKey: ["project-automation-rules", projectId],
    queryFn: () => listProjectAutomationRules(projectId),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
}

export function useProjectAutomationRuns(
  projectId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["project-automation-runs", projectId],
    queryFn: () => listProjectAutomationRuns(projectId),
    enabled: enabled && !!projectId,
    refetchInterval: enabled ? 15_000 : false,
  });
}


export function useProjectAutomationHealth(projectId: string) {
  return useQuery({
    queryKey: ["project-automation-health", projectId],
    queryFn: () => getProjectAutomationHealth(projectId),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
}

function useInvalidateAutomations(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["project-automation-rules", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-automation-runs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-automation-health", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["notifications"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["notification-unread-count"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-activity", projectId],
    });
  };
}

export function useSetProjectAutomationEnabled(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: (input: { ruleId: string; enabled: boolean }) =>
      setProjectAutomationEnabled({
        projectId,
        ...input,
      }),
    onSuccess: (_, input) => {
      invalidate();
      toast.success(
        input.enabled ? "تم تشغيل الأتمتة." : "تم إيقاف الأتمتة.",
      );
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "تعذر تحديث الأتمتة.";
      toast.error(
        message.includes("AUTOMATION_TEST_REQUIRED")
          ? "شغّل «اختبار القاعدة» بعد آخر تعديل قبل تفعيلها."
          : message,
      );
    },
  });
}

export function useUpdateProjectAutomationConfig(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: (input: {
      ruleId: string;
      config: Record<string, unknown>;
    }) =>
      updateProjectAutomationConfig({
        projectId,
        ...input,
      }),
    onSuccess: () => {
      invalidate();
      toast.success("تم تحديث إعداد الأتمتة.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تحديث إعداد الأتمتة.",
      ),
  });
}

export function useRefreshProjectAutomations(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: () => refreshProjectAutomations(projectId),
    onSuccess: (count) => {
      invalidate();
      toast.success(
        count > 0
          ? `تم تنفيذ ${count} أتمتة مستحقة.`
          : "لا توجد أتمتة مستحقة الآن.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تشغيل فحص الأتمتة.",
      ),
  });
}

export function useTestProjectAutomationRule(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: (ruleId: string) =>
      testProjectAutomationRule({
        projectId,
        ruleId,
        limit: 20,
      }),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result.candidate_count > 0
          ? `الاختبار آمن: ${result.candidate_count} عنصرًا مطابقًا حاليًا.`
          : "الاختبار آمن: لا توجد عناصر مطابقة حاليًا.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر اختبار قاعدة الأتمتة.",
      ),
  });
}

export function useRetryProjectAutomationRun(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: (runId: string) =>
      retryProjectAutomationRun({
        projectId,
        runId,
      }),
    onSuccess: (ok) => {
      invalidate();
      toast.success(
        ok
          ? "نجحت إعادة تشغيل الأتمتة."
          : "تمت المحاولة، لكن التشغيل لم يكتمل بنجاح.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إعادة تشغيل الأتمتة.",
      ),
  });
}

export function useAutomationHeartbeat(
  projectId: string,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled || !projectId) return;

    let disposed = false;
    const run = async () => {
      if (inFlight.current || disposed) return;
      inFlight.current = true;
      try {
        const count = await refreshProjectAutomations(projectId);
        if (count > 0 && !disposed) {
          void queryClient.invalidateQueries({
            queryKey: ["project-automation-runs", projectId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["project-automation-rules", projectId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["notifications"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["notification-unread-count"],
          });
        }
      } catch {
        // Passive heartbeat: explicit controls surface errors to the user.
      } finally {
        inFlight.current = false;
      }
    };

    void run();
    const timer = window.setInterval(run, 60_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [enabled, projectId, queryClient]);
}
