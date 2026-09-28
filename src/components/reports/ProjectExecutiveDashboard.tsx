import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  Flag,
  Gauge,
  Milestone,
  Printer,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";

import { useProjectAuditSummary } from "@/hooks/use-audit";
import { useProjectAutomationHealth } from "@/hooks/use-automations";
import {
  buildProjectExecutiveReport,
  downloadProjectExecutiveReportCsv,
} from "@/services/reports.service";
import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type {
  ProjectHealthLevel,
  ProjectReportRisk,
} from "@/types/reports";

const PROJECT_STATUS_LABELS = {
  planning: "تخطيط",
  active: "نشط",
  on_hold: "موقوف",
  completed: "مكتمل",
  archived: "مؤرشف",
} as const;

const HEALTH_META: Record<
  ProjectHealthLevel,
  { label: string; description: string; className: string }
> = {
  healthy: {
    label: "مستقر",
    description: "لا توجد مؤشرات تحذيرية حالية وفق قواعد التقرير.",
    className: "border-success/25 bg-success/5 text-success",
  },
  attention: {
    label: "يحتاج متابعة",
    description: "توجد مؤشرات تشغيلية تحتاج متابعة الإدارة.",
    className: "border-warning/25 bg-warning/5 text-warning",
  },
  critical: {
    label: "يحتاج تدخل",
    description: "توجد حالة حرجة تستلزم تدخلًا إداريًا.",
    className: "border-danger/25 bg-danger/5 text-danger",
  },
};

const RISK_META: Record<
  ProjectReportRisk["severity"],
  { label: string; className: string }
> = {
  critical: {
    label: "حرج",
    className: "border-danger/20 bg-danger/5 text-danger",
  },
  warning: {
    label: "تحذير",
    className: "border-warning/20 bg-warning/5 text-warning",
  },
  info: {
    label: "معلومة",
    className: "border-info/20 bg-info/5 text-info",
  },
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {note && (
        <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

export function ProjectExecutiveDashboard({
  project,
  execution,
  boards,
  collaborators,
  canManage,
}: {
  project: Project;
  execution: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
  canManage: boolean;
}) {
  const automation = useProjectAutomationHealth(project.id);
  const governance = useProjectAuditSummary(project.id, canManage);
  const reportReady =
    !automation.isLoading &&
    (!canManage || !governance.isLoading);

  const report = useMemo(
    () =>
      buildProjectExecutiveReport({
        project,
        execution,
        boards,
        collaborators,
        automation: automation.data ?? null,
        governance: canManage ? governance.data ?? null : null,
      }),
    [
      project,
      execution,
      boards,
      collaborators,
      automation.data,
      governance.data,
      canManage,
    ],
  );

  const health = HEALTH_META[report.health.level];
  const topWorkload = report.workload
    .filter((row) => row.open > 0 || row.assigned > 0)
    .slice(0, 6);

  return (
    <section
      data-project-report-print
      className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]"
    >
      <header className="border-b border-border p-4 md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Executive Project Report
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <Gauge className="h-5 w-5 text-brand" />
              لوحة الإدارة التنفيذية
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              ملخص موحد لصحة المشروع والتنفيذ والمخاطر والأتمتة والحوكمة.
            </p>
          </div>

          <div
            data-report-screen-only
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              disabled={!reportReady}
              onClick={() => downloadProjectExecutiveReportCsv(report)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              تصدير CSV
            </button>
            <button
              type="button"
              disabled={!reportReady}
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              طباعة التقرير
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-xl bg-muted/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{project.name}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
            </div>
            {project.description && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {project.description}
              </p>
            )}
            <p className="mt-2 text-[9px] text-muted-foreground">
              أُنشئ التقرير {formatTimestamp(report.generated_at)}
            </p>
          </div>

          <div
            className={
              reportReady
                ? `rounded-xl border p-4 ${health.className}`
                : "rounded-xl border border-border bg-muted/25 p-4 text-muted-foreground"
            }
          >
            <div className="flex items-center gap-2">
              {reportReady && report.health.level === "healthy" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
              <div>
                <p className="text-[10px] opacity-80">حالة المشروع</p>
                <p className="text-lg font-semibold">
                  {reportReady ? health.label : "جاري تجميع التقرير"}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-4 opacity-80">
              {reportReady
                ? health.description
                : "يتم تحميل بيانات التنفيذ والأتمتة والحوكمة قبل اعتماد الحالة."}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="نسبة الإغلاق"
          value={`${report.kpis.completion_rate}%`}
          note={`${report.kpis.completed} من ${report.kpis.total}`}
        />
        <MetricCard
          label="متوسط الإنجاز"
          value={`${report.kpis.average_progress}%`}
        />
        <MetricCard label="مفتوحة" value={report.kpis.open} />
        <MetricCard label="متأخرة" value={report.kpis.overdue} />
        <MetricCard label="معطلة" value={report.kpis.blocked} />
        <MetricCard label="بدون مسؤول" value={report.kpis.unassigned} />
      </div>

      <div className="grid gap-4 border-b border-border p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <div>
              <h3 className="text-sm font-semibold">المخاطر الحالية</h3>
              <p className="text-[10px] text-muted-foreground">
                قواعد واضحة مبنية على بيانات المشروع الحالية، وليست درجة تقديرية مخفية.
              </p>
            </div>
          </div>

          {!report.risks.length ? (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-xs text-success">
              لا توجد مخاطر تشغيلية مصنفة حاليًا.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {report.risks.map((risk) => {
                const meta = RISK_META[risk.severity];
                return (
                  <div
                    key={risk.id}
                    className={`rounded-xl border p-3 ${meta.className}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{risk.title}</p>
                      <span className="rounded-full bg-background/60 px-2 py-0.5 text-[9px]">
                        {meta.label} · {risk.count}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                      {risk.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside>
          <div className="mb-3 flex items-center gap-2">
            <Milestone className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">المعالم الرئيسية</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="إجمالي المعالم" value={report.milestones.total} />
            <MetricCard label="مفتوحة" value={report.milestones.open} />
            <MetricCard label="مكتملة" value={report.milestones.completed} />
            <MetricCard label="متأخرة" value={report.milestones.overdue} />
          </div>
          <div className="mt-2 rounded-xl bg-muted/25 p-3 text-[10px] text-muted-foreground">
            {report.milestones.upcoming} معلمًا ضمن نافذة الاستحقاق القريب الحالية.
          </div>
        </aside>
      </div>

      <div className="grid gap-4 border-b border-border p-4 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">توزيع العمل</h3>
              <p className="text-[10px] text-muted-foreground">
                الحمل المفتوح والتأخير والمتوسط لكل عضو.
              </p>
            </div>
          </div>

          {!topWorkload.length ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              لا توجد مهام مسندة لأعضاء المشروع بعد.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_70px_70px_70px_90px] gap-2 bg-muted/30 px-3 py-2 text-[9px] text-muted-foreground md:grid">
                <span>العضو</span>
                <span>مفتوحة</span>
                <span>متأخرة</span>
                <span>معطلة</span>
                <span>الإنجاز</span>
              </div>
              {topWorkload.map((row) => (
                <div
                  key={row.user_id}
                  className="grid gap-2 border-t border-border px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,1fr)_70px_70px_70px_90px] md:items-center"
                >
                  <div>
                    <p className="truncate text-xs font-semibold">{row.name}</p>
                    <p className="text-[9px] text-muted-foreground">{row.role}</p>
                  </div>
                  <span className="text-xs">{row.open}</span>
                  <span className={row.overdue ? "text-xs text-danger" : "text-xs"}>
                    {row.overdue}
                  </span>
                  <span className={row.blocked ? "text-xs text-warning" : "text-xs"}>
                    {row.blocked}
                  </span>
                  <span className="text-xs">{row.average_progress}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <Flag className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">أداء اللوحات</h3>
              <p className="text-[10px] text-muted-foreground">
                تفصيل الحالة التنفيذية حسب كل لوحة عمل.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(0,1fr)_60px_60px_60px_85px] gap-2 bg-muted/30 px-3 py-2 text-[9px] text-muted-foreground md:grid">
              <span>اللوحة</span>
              <span>مفتوحة</span>
              <span>متأخرة</span>
              <span>معطلة</span>
              <span>الإنجاز</span>
            </div>
            {report.boards.map((row) => (
              <div
                key={row.board_id}
                className="grid gap-2 border-t border-border px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,1fr)_60px_60px_60px_85px] md:items-center"
              >
                <p className="truncate text-xs font-semibold">{row.name}</p>
                <span className="text-xs">{row.open}</span>
                <span className={row.overdue ? "text-xs text-danger" : "text-xs"}>
                  {row.overdue}
                </span>
                <span className={row.blocked ? "text-xs text-warning" : "text-xs"}>
                  {row.blocked}
                </span>
                <span className="text-xs">{row.average_progress}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">صحة الأتمتة</h3>
          </div>
          {!report.automation ? (
            <p className="mt-3 text-xs text-muted-foreground">
              بيانات الأتمتة غير متاحة في البيئة الحالية.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[9px] text-muted-foreground">Scheduler</p>
                <p className="mt-0.5 font-semibold">
                  {report.automation.scheduler_mode === "pg_cron"
                    ? "24/7"
                    : "Fallback"}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">قواعد مفعلة</p>
                <p className="mt-0.5 font-semibold">
                  {report.automation.enabled_rules}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">فشل حالي</p>
                <p className="mt-0.5 font-semibold">
                  {report.automation.failed_runs}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">تحتاج تدخلًا</p>
                <p className="mt-0.5 font-semibold">
                  {report.automation.exhausted_runs}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">ملخص الحوكمة</h3>
          </div>
          {!canManage || !report.governance ? (
            <p className="mt-3 text-xs text-muted-foreground">
              تفاصيل الحوكمة متاحة للمالك والمسؤولين فقط.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[9px] text-muted-foreground">أحداث 7 أيام</p>
                <p className="mt-0.5 font-semibold">{report.governance.events_7d}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">تغييرات وصول</p>
                <p className="mt-0.5 font-semibold">{report.governance.access_7d}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">تغييرات تنفيذ</p>
                <p className="mt-0.5 font-semibold">{report.governance.execution_7d}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">فشل أتمتة</p>
                <p className="mt-0.5 font-semibold">
                  {report.governance.automation_failures_7d}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
