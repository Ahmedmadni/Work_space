import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Gavel,
  ShieldAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";

import { arabicNumber } from "@/lib/format";
import type { Project } from "@/types";
import type {
  PortfolioActionCenterData,
  PortfolioRisk,
} from "@/types/portfolio-actions";

type ProjectRiskHealth = "stable" | "follow_up" | "intervention";

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function isActive(risk: PortfolioRisk) {
  return risk.status === "open" || risk.status === "mitigating";
}

function isOverdue(risk: PortfolioRisk, today: string) {
  return isActive(risk) && !!risk.due_date && risk.due_date < today;
}

function formatDate(value: string | null) {
  if (!value) return "بدون موعد";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function riskRank(risk: PortfolioRisk, today: string) {
  const overdue = isOverdue(risk, today);
  if (isActive(risk) && risk.severity === "critical" && overdue) return 0;
  if (isActive(risk) && risk.severity === "critical") return 1;
  if (isActive(risk) && risk.severity === "high" && overdue) return 2;
  if (overdue) return 3;
  if (isActive(risk) && risk.severity === "high") return 4;
  if (isActive(risk) && !risk.owner_user_id) return 5;
  return 6;
}

function projectHealth(input: {
  risks: PortfolioRisk[];
  pendingDecisions: number;
  today: string;
}): ProjectRiskHealth {
  const active = input.risks.filter(isActive);
  const critical = active.some((risk) => risk.severity === "critical");
  const seriousOverdue = active.some(
    (risk) =>
      isOverdue(risk, input.today) &&
      (risk.severity === "critical" || risk.severity === "high"),
  );
  if (critical || seriousOverdue) return "intervention";

  const high = active.some((risk) => risk.severity === "high");
  const overdue = active.some((risk) => isOverdue(risk, input.today));
  if (high || overdue || input.pendingDecisions > 0) return "follow_up";

  return "stable";
}

const HEALTH_META: Record<
  ProjectRiskHealth,
  { label: string; className: string; dot: string }
> = {
  stable: {
    label: "مستقر",
    className: "border-success/20 bg-success/5 text-success",
    dot: "bg-success",
  },
  follow_up: {
    label: "يحتاج متابعة",
    className: "border-warning/20 bg-warning/5 text-warning",
    dot: "bg-warning",
  },
  intervention: {
    label: "يحتاج تدخل",
    className: "border-danger/20 bg-danger/5 text-danger",
    dot: "bg-danger",
  },
};

export function PortfolioRiskRadar({
  data,
  projects,
  isLoading,
}: {
  data: PortfolioActionCenterData | undefined;
  projects: Project[];
  isLoading: boolean;
}) {
  const today = useMemo(todayKey, []);
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const risks = data?.risks ?? [];
  const decisions = data?.decisions ?? [];

  const activeRisks = risks.filter(isActive);
  const critical = activeRisks.filter(
    (risk) => risk.severity === "critical",
  ).length;
  const high = activeRisks.filter((risk) => risk.severity === "high").length;
  const overdue = activeRisks.filter((risk) => isOverdue(risk, today)).length;
  const unowned = activeRisks.filter((risk) => !risk.owner_user_id).length;
  const pendingDecisions = decisions.filter(
    (decision) => decision.status === "proposed",
  );

  const escalationQueue = useMemo(
    () =>
      risks
        .filter(
          (risk) =>
            isActive(risk) &&
            (risk.severity === "critical" ||
              risk.severity === "high" ||
              isOverdue(risk, today) ||
              !risk.owner_user_id),
        )
        .sort((a, b) => {
          const rankDelta = riskRank(a, today) - riskRank(b, today);
          if (rankDelta !== 0) return rankDelta;
          return (a.due_date ?? "9999-12-31").localeCompare(
            b.due_date ?? "9999-12-31",
          );
        })
        .slice(0, 12),
    [risks, today],
  );

  const ownerRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        key: string;
        name: string;
        active: number;
        critical: number;
        high: number;
        overdue: number;
      }
    >();

    for (const risk of activeRisks) {
      const key = risk.owner_user_id ?? "unowned";
      const row = rows.get(key) ?? {
        key,
        name: risk.owner_name ?? "بدون مسؤول",
        active: 0,
        critical: 0,
        high: 0,
        overdue: 0,
      };
      row.active += 1;
      if (risk.severity === "critical") row.critical += 1;
      if (risk.severity === "high") row.high += 1;
      if (isOverdue(risk, today)) row.overdue += 1;
      rows.set(key, row);
    }

    return [...rows.values()]
      .sort((a, b) => {
        const criticalDelta = b.critical - a.critical;
        if (criticalDelta !== 0) return criticalDelta;
        const overdueDelta = b.overdue - a.overdue;
        if (overdueDelta !== 0) return overdueDelta;
        return b.active - a.active;
      })
      .slice(0, 8);
  }, [activeRisks, today]);

  const projectRows = useMemo(
    () =>
      projects
        .map((project) => {
          const projectRisks = risks.filter(
            (risk) => risk.project_id === project.id,
          );
          const active = projectRisks.filter(isActive);
          const pending = pendingDecisions.filter(
            (decision) => decision.project_id === project.id,
          ).length;
          const criticalCount = active.filter(
            (risk) => risk.severity === "critical",
          ).length;
          const highCount = active.filter(
            (risk) => risk.severity === "high",
          ).length;
          const overdueCount = active.filter((risk) =>
            isOverdue(risk, today),
          ).length;
          const unownedCount = active.filter(
            (risk) => !risk.owner_user_id,
          ).length;

          return {
            project,
            active: active.length,
            critical: criticalCount,
            high: highCount,
            overdue: overdueCount,
            unowned: unownedCount,
            pending,
            health: projectHealth({
              risks: projectRisks,
              pendingDecisions: pending,
              today,
            }),
          };
        })
        .sort((a, b) => {
          const rank = (health: ProjectRiskHealth) =>
            health === "intervention" ? 0 : health === "follow_up" ? 1 : 2;
          const healthDelta = rank(a.health) - rank(b.health);
          if (healthDelta !== 0) return healthDelta;
          if (a.critical !== b.critical) return b.critical - a.critical;
          if (a.overdue !== b.overdue) return b.overdue - a.overdue;
          return b.pending - a.pending;
        }),
    [projects, risks, pendingDecisions, today],
  );

  const metrics = [
    {
      label: "مخاطر نشطة",
      value: activeRisks.length,
      icon: ShieldAlert,
      tone: "text-warning",
    },
    {
      label: "مخاطر حرجة",
      value: critical,
      icon: AlertTriangle,
      tone: "text-danger",
    },
    {
      label: "مخاطر مرتفعة",
      value: high,
      icon: ShieldAlert,
      tone: "text-warning",
    },
    {
      label: "معالجة متأخرة",
      value: overdue,
      icon: CalendarClock,
      tone: "text-danger",
    },
    {
      label: "بدون مسؤول",
      value: unowned,
      icon: UserRound,
      tone: "text-muted-foreground",
    },
    {
      label: "قرارات معلقة",
      value: pendingDecisions.length,
      icon: Gavel,
      tone: "text-info",
    },
  ];

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-5 w-5 animate-pulse text-brand" />
          جاري تجميع سجل المخاطر والقرارات عبر المحفظة…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-5 w-5 text-brand" />
          رادار المخاطر والقرارات
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Risk Register وDecision Log موحدان عبر كل المشاريع مع قائمة تصعيد
          تنفيذية وقواعد حالة معلنة.
        </p>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        «يحتاج تدخل» = خطر Critical نشط أو Mitigation متأخر لخطر High/Critical.
        «يحتاج متابعة» = خطر High نشط أو أي Mitigation متأخر أو قرار Proposed.
        لا توجد درجة مخفية أو وزن تقديري.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${tone}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{arabicNumber(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">حالة المخاطر حسب المشروع</h3>
            <p className="mt-1 text-[10px] text-muted-foreground">
              يعرض المخاطر المسجلة والقرارات المعلقة، وليس إشارات التنفيذ
              المستنتجة فقط.
            </p>
          </div>

          {!projectRows.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد مشاريع لعرضها.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {projectRows.slice(0, 15).map((row) => {
                const meta = HEALTH_META[row.health];
                return (
                  <Link
                    key={row.project.id}
                    to="/project/$projectId"
                    params={{ projectId: row.project.id }}
                    className="block px-4 py-3 transition hover:bg-muted/30"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-xs font-semibold">
                            {row.project.name}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] ${meta.className}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] text-muted-foreground">
                          {arabicNumber(row.active)} خطر نشط ·{" "}
                          {arabicNumber(row.pending)} قرار معلق
                        </p>
                      </div>

                      <div className="grid grid-cols-4 gap-2 lg:w-[360px]">
                        <div className="rounded-lg bg-danger/5 p-2 text-center">
                          <p className="text-xs font-semibold text-danger">
                            {arabicNumber(row.critical)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">حرج</p>
                        </div>
                        <div className="rounded-lg bg-warning/5 p-2 text-center">
                          <p className="text-xs font-semibold text-warning">
                            {arabicNumber(row.high)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">مرتفع</p>
                        </div>
                        <div className="rounded-lg bg-danger/5 p-2 text-center">
                          <p className="text-xs font-semibold text-danger">
                            {arabicNumber(row.overdue)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">متأخر</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2 text-center">
                          <p className="text-xs font-semibold">
                            {arabicNumber(row.unowned)}
                          </p>
                          <p className="text-[8px] text-muted-foreground">بلا مسؤول</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold">تعرض أصحاب المخاطر</h3>
          </div>
          <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
            عدد المخاطر النشطة حسب المسؤول؛ لا يمثل تقييمًا لأداء الشخص.
          </p>

          {!ownerRows.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              لا توجد مخاطر نشطة مسندة حاليًا.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {ownerRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {row.name}
                    </p>
                    <span className="text-[9px] text-muted-foreground">
                      {arabicNumber(row.active)} نشط
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                    {row.critical > 0 && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                        {arabicNumber(row.critical)} حرج
                      </span>
                    )}
                    {row.high > 0 && (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                        {arabicNumber(row.high)} مرتفع
                      </span>
                    )}
                    {row.overdue > 0 && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                        {arabicNumber(row.overdue)} متأخر
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">قائمة التصعيد</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Critical ثم High المتأخر ثم بقية المعالجات المتأخرة والمخاطر بلا
                مسؤول.
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {arabicNumber(escalationQueue.length)} معروضة
            </span>
          </div>

          {!escalationQueue.length ? (
            <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-6 text-center text-xs text-success">
              لا توجد مخاطر تستوفي قواعد التصعيد الحالية.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {escalationQueue.map((risk) => {
                const overdueRisk = isOverdue(risk, today);
                const projectName =
                  projectMap.get(risk.project_id)?.name ?? risk.project_name;
                const content = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{risk.title}</p>
                      <p className="mt-1 truncate text-[9px] text-muted-foreground">
                        {projectName} · {risk.owner_name ?? "بدون مسؤول"} ·{" "}
                        {formatDate(risk.due_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {risk.severity === "critical" && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[9px] text-danger">
                          حرج
                        </span>
                      )}
                      {risk.severity === "high" && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] text-warning">
                          مرتفع
                        </span>
                      )}
                      {overdueRisk && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[9px] text-danger">
                          Mitigation متأخر
                        </span>
                      )}
                      {!risk.owner_user_id && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
                          بلا مسؤول
                        </span>
                      )}
                    </div>
                  </>
                );

                return risk.board_id && risk.node_id ? (
                  <Link
                    key={risk.id}
                    to="/project/$projectId/board/$boardId"
                    params={{
                      projectId: risk.project_id,
                      boardId: risk.board_id,
                    }}
                    search={{ node: risk.node_id }}
                    className="flex flex-col gap-2 bg-background px-3 py-3 transition hover:bg-muted/40 md:flex-row md:items-center"
                  >
                    {content}
                  </Link>
                ) : (
                  <Link
                    key={risk.id}
                    to="/project/$projectId"
                    params={{ projectId: risk.project_id }}
                    className="flex flex-col gap-2 bg-background px-3 py-3 transition hover:bg-muted/40 md:flex-row md:items-center"
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">قرارات تنتظر الحسم</h3>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            قرارات Proposed فقط؛ لا يفترض النظام مهلة زمنية غير مسجلة.
          </p>

          {!pendingDecisions.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              لا توجد قرارات معلقة.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {pendingDecisions.slice(0, 8).map((decision) => (
                <Link
                  key={decision.id}
                  to="/project/$projectId"
                  params={{ projectId: decision.project_id }}
                  className="block rounded-xl border border-border bg-background p-3 transition hover:bg-muted/40"
                >
                  <p className="truncate text-xs font-semibold">
                    {decision.title}
                  </p>
                  <p className="mt-1 truncate text-[9px] text-muted-foreground">
                    {projectMap.get(decision.project_id)?.name ??
                      decision.project_name}
                    {" · "}
                    {decision.owner_name ?? "بدون مسؤول متابعة"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
