import {
  AlertTriangle,
  BellRing,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  GitBranch,
  History,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useAutomationHeartbeat,
  useProjectAutomationRules,
  useProjectAutomationRuns,
  useRefreshProjectAutomations,
  useSetProjectAutomationEnabled,
  useUpdateProjectAutomationConfig,
} from "@/hooks/use-automations";
import { relativeTime } from "@/lib/format";
import { workflowAutomationsAvailable } from "@/services/automations.service";
import type {
  ProjectAutomationKind,
  ProjectAutomationRule,
} from "@/types/automations";

const RULE_META: Record<
  ProjectAutomationKind,
  {
    icon: typeof Bot;
    description: string;
    timing: string;
    caution?: string;
  }
> = {
  blocked_notify_managers: {
    icon: ShieldAlert,
    description:
      "عند انتقال مهمة إلى «معطل»، يرسل تنبيهًا تلقائيًا إلى مالك المشروع والمسؤولين.",
    timing: "فوري عند تغير الحالة",
  },
  dependency_ready_notify_assignee: {
    icon: GitBranch,
    description:
      "عند اكتمال جميع Dependencies لمهمة، ينبه المسؤول والمتابعين أن المهمة أصبحت جاهزة للعمل.",
    timing: "فوري عند اكتمال أو تغيير الاعتمادات",
  },
  due_soon_notify_assignee: {
    icon: CalendarClock,
    description:
      "يرسل تنبيهًا للمسؤول والمتابعين قبل تاريخ الاستحقاق بالمدة التي تحددها.",
    timing: "فحص دوري أثناء نشاط التطبيق",
  },
  overdue_escalate_managers: {
    icon: AlertTriangle,
    description:
      "يصعّد المهمة المتأخرة إلى إدارة المشروع بعد عدد الأيام المحدد، بحد أقصى مرة واحدة يوميًا.",
    timing: "فحص دوري أثناء نشاط التطبيق",
  },
  dependency_ready_set_planned: {
    icon: WandSparkles,
    description:
      "إذا اكتملت جميع المتطلبات وكانت المهمة ما زالت «فكرة»، يحولها تلقائيًا إلى «مخطط».",
    timing: "فوري عند اكتمال أو تغيير الاعتمادات",
    caution:
      "قاعدة تغيّر بيانات فعلية. لا تعدّل المهام المعطلة أو الجارية أو المكتملة.",
  },
};

function readDays(rule: ProjectAutomationRule) {
  if (rule.kind === "due_soon_notify_assignee") {
    const value = rule.config.days_before;
    return typeof value === "number" ? value : 2;
  }
  if (rule.kind === "overdue_escalate_managers") {
    const value = rule.config.days_overdue;
    return typeof value === "number" ? value : 1;
  }
  return null;
}

function AutomationRuleCard({
  projectId,
  rule,
  canManage,
}: {
  projectId: string;
  rule: ProjectAutomationRule;
  canManage: boolean;
}) {
  const setEnabled = useSetProjectAutomationEnabled(projectId);
  const updateConfig = useUpdateProjectAutomationConfig(projectId);
  const meta = RULE_META[rule.kind];
  const Icon = meta.icon;
  const configuredDays = readDays(rule);
  const [days, setDays] = useState(
    configuredDays === null ? "" : String(configuredDays),
  );

  const saveDays = () => {
    if (configuredDays === null || !canManage) return;
    const parsed = Number(days);
    if (!Number.isInteger(parsed)) {
      setDays(String(configuredDays));
      return;
    }

    if (rule.kind === "due_soon_notify_assignee") {
      if (parsed < 0 || parsed > 30) {
        setDays(String(configuredDays));
        return;
      }
      if (parsed === configuredDays) return;
      updateConfig.mutate({
        ruleId: rule.id,
        config: { days_before: parsed },
      });
    } else if (rule.kind === "overdue_escalate_managers") {
      if (parsed < 0 || parsed > 90) {
        setDays(String(configuredDays));
        return;
      }
      if (parsed === configuredDays) return;
      updateConfig.mutate({
        ruleId: rule.id,
        config: { days_overdue: parsed },
      });
    }
  };

  return (
    <article
      className={
        rule.enabled
          ? "rounded-2xl border border-brand/25 bg-brand/[0.03] p-4"
          : "rounded-2xl border border-border bg-background p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            rule.enabled
              ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"
              : "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
          }
        >
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{rule.name}</h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {meta.description}
              </p>
            </div>

            <button
              type="button"
              disabled={!canManage || setEnabled.isPending}
              onClick={() =>
                setEnabled.mutate({
                  ruleId: rule.id,
                  enabled: !rule.enabled,
                })
              }
              className={
                rule.enabled
                  ? "relative h-7 w-12 shrink-0 rounded-full bg-brand transition disabled:opacity-50"
                  : "relative h-7 w-12 shrink-0 rounded-full bg-muted transition disabled:opacity-50"
              }
              aria-pressed={rule.enabled}
              aria-label={
                rule.enabled ? "إيقاف الأتمتة" : "تشغيل الأتمتة"
              }
              title={
                canManage
                  ? rule.enabled
                    ? "إيقاف"
                    : "تشغيل"
                  : "يتطلب صلاحية إدارة المشروع"
              }
            >
              <span
                className={
                  rule.enabled
                    ? "absolute end-1 top-1 h-5 w-5 rounded-full bg-white shadow transition"
                    : "absolute end-6 top-1 h-5 w-5 rounded-full bg-white shadow transition"
                }
              />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <Clock3 className="h-3 w-3" />
              {meta.timing}
            </span>
            <span
              className={
                rule.enabled
                  ? "rounded-full bg-success/10 px-2 py-1 font-medium text-success"
                  : "rounded-full bg-muted px-2 py-1"
              }
            >
              {rule.enabled ? "مفعّلة" : "متوقفة"}
            </span>
            {rule.last_run_at && (
              <span>آخر تشغيل {relativeTime(rule.last_run_at)}</span>
            )}
          </div>

          {configuredDays !== null && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-muted/35 p-3">
              <label className="text-[10px] text-muted-foreground">
                {rule.kind === "due_soon_notify_assignee"
                  ? "التنبيه قبل الاستحقاق"
                  : "التصعيد بعد التأخير"}
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={
                      rule.kind === "due_soon_notify_assignee" ? 30 : 90
                    }
                    value={days}
                    disabled={!canManage || updateConfig.isPending}
                    onChange={(event) => setDays(event.target.value)}
                    onBlur={saveDays}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-brand disabled:opacity-50"
                  />
                  <span>يوم</span>
                </div>
              </label>
              <span className="pb-1 text-[9px] text-muted-foreground">
                {rule.kind === "due_soon_notify_assignee"
                  ? "0 = في يوم الاستحقاق"
                  : "0 = يبدأ التصعيد بمجرد أن تصبح المهمة متأخرة"}
              </span>
            </div>
          )}

          {meta.caution && (
            <div className="mt-3 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-[10px] leading-5 text-warning">
              {meta.caution}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RunStatusIcon({
  status,
}: {
  status: "running" | "success" | "skipped" | "failed";
}) {
  if (status === "success") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4 text-danger" />;
  }
  if (status === "running") {
    return <RefreshCw className="h-4 w-4 animate-spin text-info" />;
  }
  return <Clock3 className="h-4 w-4 text-muted-foreground" />;
}

export function ProjectAutomationCenter({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const rules = useProjectAutomationRules(projectId);
  const runs = useProjectAutomationRuns(projectId, true);
  const refresh = useRefreshProjectAutomations(projectId);
  const available = workflowAutomationsAvailable();
  const [historyOpen, setHistoryOpen] = useState(true);

  const scheduledEnabled = useMemo(
    () =>
      (rules.data ?? []).some(
        (rule) =>
          rule.enabled &&
          (rule.kind === "due_soon_notify_assignee" ||
            rule.kind === "overdue_escalate_managers"),
      ),
    [rules.data],
  );

  useAutomationHeartbeat(
    projectId,
    available && scheduledEnabled,
  );

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-5 w-5 text-brand" />
              أتمتة سير العمل
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              قواعد آمنة ومحددة مسبقًا تعمل فوق نفس بيانات المهام والاعتمادات والإشعارات.
            </p>
          </div>

          <button
            type="button"
            disabled={!available || refresh.isPending}
            onClick={() => refresh.mutate()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {refresh.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            فحص الأتمتة الآن
          </button>
        </div>

        {!available && (
          <div className="mt-3 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs leading-5 text-warning">
            القواعد ظاهرة للمعاينة، لكن تشغيلها الفعلي يتطلب بيئة Supabase.
          </div>
        )}

        {available && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/35 px-3 py-2 text-[10px] text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-brand" />
            القواعد الحدثية تعمل فورًا. قواعد الوقت تُفحص كل دقيقة أثناء نشاط المشروع وكذلك من مركز الإشعارات.
          </div>
        )}
      </header>

      <div className="grid gap-3 p-4 xl:grid-cols-2">
        {rules.isLoading ? (
          <>
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          </>
        ) : (
          (rules.data ?? []).map((rule) => (
            <AutomationRuleCard
              key={rule.id}
              projectId={projectId}
              rule={rule}
              canManage={canManage && available}
            />
          ))
        )}
      </div>

      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start hover:bg-muted/30"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-brand" />
            سجل التشغيل
          </span>
          <span className="text-[10px] text-muted-foreground">
            {(runs.data ?? []).length} عملية
          </span>
        </button>

        {historyOpen && (
          <div className="border-t border-border">
            {runs.isLoading ? (
              <div className="space-y-2 p-4">
                <div className="h-14 animate-pulse rounded-xl bg-muted" />
                <div className="h-14 animate-pulse rounded-xl bg-muted" />
              </div>
            ) : !(runs.data ?? []).length ? (
              <div className="p-8 text-center">
                <BellRing className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">
                  لم يتم تشغيل أي قاعدة بعد
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  فعّل قاعدة أو استخدم «فحص الأتمتة الآن».
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(runs.data ?? []).slice(0, 30).map((run) => (
                  <div
                    key={run.id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <RunStatusIcon status={run.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">
                          {run.rule_name}
                        </p>
                        <span
                          className={
                            run.status === "success"
                              ? "rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] text-success"
                              : run.status === "failed"
                                ? "rounded-full bg-danger/10 px-1.5 py-0.5 text-[9px] text-danger"
                                : "rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                          }
                        >
                          {run.status === "success"
                            ? "نجح"
                            : run.status === "failed"
                              ? "فشل"
                              : run.status === "running"
                                ? "يعمل"
                                : "تم التجاوز"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        {run.node_title ?? "عنصر لم يعد موجودًا"}
                        {run.board_name ? ` · ${run.board_name}` : ""}
                        {run.error ? ` · ${run.error}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[9px] text-muted-foreground">
                      {relativeTime(run.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
