import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";

import { useGovernanceAssuranceFindings } from "@/hooks/use-governance-assurance-findings";
import { arabicNumber } from "@/lib/format";
import {
  buildGovernanceAssuranceRemediationAnalytics,
  downloadGovernanceAssuranceRemediationAnalyticsCsv,
} from "@/services/governance-assurance-findings.service";
import type { GovernanceAssuranceFindingSeverity } from "@/types/governance-assurance-findings";

const SEVERITY_LABELS: Record<GovernanceAssuranceFindingSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(new Date(value));
}

function numberOrDash(value: number | null, suffix = "") {
  return value == null ? "—" : arabicNumber(value) + suffix;
}

export function ExecutiveGovernanceAssuranceRemediationAnalytics() {
  const findings = useGovernanceAssuranceFindings();

  const analytics = useMemo(
    () =>
      findings.data
        ? buildGovernanceAssuranceRemediationAnalytics(findings.data)
        : null,
    [findings.data],
  );

  if (findings.isLoading || !analytics) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4 animate-pulse text-brand" />
          جاري تحميل Remediation Analytics…
        </div>
      </section>
    );
  }

  const completed = analytics.completed_verifications;
  const agingMax = Math.max(
    1,
    ...analytics.active_aging.map((row) => row.count),
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-brand" />
            Remediation Analytics & Effectiveness Trends
          </h3>
          <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
            تحليل وصفي للسجلات الفعلية فقط. لا يوجد Composite Score أو أوزان
            مخفية. Effectiveness Rate = Effective ÷ كل Verification مكتملة.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            downloadGovernanceAssuranceRemediationAnalyticsCsv(analytics)
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[10px] font-semibold hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          تصدير Analytics CSV
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          {
            label: "Total Findings",
            value: analytics.total_findings,
            className: "text-foreground",
            icon: Activity,
          },
          {
            label: "Active",
            value: analytics.active_findings,
            className: "text-warning",
            icon: RefreshCw,
          },
          {
            label: "Closed",
            value: analytics.closed_findings,
            className: "text-success",
            icon: CheckCircle2,
          },
          {
            label: "Overdue Active",
            value: analytics.overdue_active,
            className: "text-danger",
            icon: AlertTriangle,
          },
          {
            label: "Unassigned Active",
            value: analytics.unassigned_active,
            className: "text-warning",
            icon: ShieldAlert,
          },
          {
            label: "Verification Pending",
            value: analytics.verification_pending,
            className: "text-info",
            icon: Clock3,
          },
          {
            label: "Reopened by Review",
            value: analytics.reopened_by_effectiveness,
            className: "text-danger",
            icon: RefreshCw,
          },
          {
            label: "Effectiveness Rate",
            value: analytics.effectiveness_rate_pct,
            className: "text-success",
            icon: Gauge,
            suffix: "%",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2">
                <Icon className={"h-3.5 w-3.5 " + card.className} />
                <p className="text-[8px] text-muted-foreground">
                  {card.label}
                </p>
              </div>
              <p className={"mt-1 text-lg font-bold " + card.className}>
                {card.value == null
                  ? "—"
                  : arabicNumber(card.value) + (card.suffix ?? "")}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold">Effectiveness Outcome</p>
          <p className="mt-1 text-[8px] leading-4 text-muted-foreground">
            المقام ={" "}
            {arabicNumber(analytics.completed_verifications)} completed
            verification(s).
          </p>
          <div className="mt-3 space-y-2 text-[9px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-success">Effective</span>
              <strong>
                {arabicNumber(analytics.effective_verifications)} /{" "}
                {arabicNumber(completed)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-warning">Partially Effective</span>
              <strong>
                {arabicNumber(analytics.partially_effective_verifications)} /{" "}
                {arabicNumber(completed)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-danger">Ineffective</span>
              <strong>
                {arabicNumber(analytics.ineffective_verifications)} /{" "}
                {arabicNumber(completed)}
              </strong>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border p-3">
            <p className="text-[8px] text-muted-foreground">
              Effectiveness Rate
            </p>
            <p className="mt-1 text-xl font-bold text-success">
              {numberOrDash(analytics.effectiveness_rate_pct, "%")}
            </p>
            <p className="mt-1 text-[8px] text-muted-foreground">
              Effective ÷ (Effective + Partially Effective + Ineffective)
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold">Closure Duration</p>
          <p className="mt-1 text-[8px] leading-4 text-muted-foreground">
            Median محسوب من Created At حتى أول timestamp فعلي للحالة، بدون
            افتراض SLA.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[8px] text-muted-foreground">
                Median Resolution Days
              </p>
              <p className="mt-1 text-lg font-bold">
                {numberOrDash(analytics.median_resolution_days, " يوم")}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[8px] text-muted-foreground">
                Median Acceptance Days
              </p>
              <p className="mt-1 text-lg font-bold">
                {numberOrDash(analytics.median_acceptance_days, " يوم")}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold">Active Finding Aging</p>
          <p className="mt-1 text-[8px] leading-4 text-muted-foreground">
            العمر = الفرق بين Created At والوقت الحالي للـOpen / In Progress
            فقط.
          </p>
          <div className="mt-3 space-y-3">
            {analytics.active_aging.map((bucket) => (
              <div key={bucket.key}>
                <div className="flex items-center justify-between gap-3 text-[9px]">
                  <span>{bucket.label}</span>
                  <strong>{arabicNumber(bucket.count)}</strong>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width:
                        Math.round((bucket.count / agingMax) * 100) + "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-[1.25fr_1fr_.55fr_.55fr_.7fr_.65fr_.6fr_.6fr_.6fr] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground">
            <span>Archive</span>
            <span>Period</span>
            <span>Total</span>
            <span>Active</span>
            <span>Critical/High</span>
            <span>Overdue</span>
            <span>Effective</span>
            <span>Partial</span>
            <span>Ineffective</span>
          </div>

          {analytics.by_archive.length ? (
            analytics.by_archive.map((row) => (
              <div
                key={row.archive_id}
                className="grid grid-cols-[1.25fr_1fr_.55fr_.55fr_.7fr_.65fr_.6fr_.6fr_.6fr] gap-2 border-t border-border px-3 py-3 text-[9px]"
              >
                <div>
                  <p className="font-semibold">{row.certificate_code}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {formatDate(row.archived_at)}
                  </p>
                </div>
                <span>{row.period_label}</span>
                <span>{arabicNumber(row.total)}</span>
                <span>{arabicNumber(row.active)}</span>
                <span
                  className={
                    row.critical_high_active > 0 ? "text-warning" : ""
                  }
                >
                  {arabicNumber(row.critical_high_active)}
                </span>
                <span
                  className={row.overdue_active > 0 ? "text-danger" : ""}
                >
                  {arabicNumber(row.overdue_active)}
                </span>
                <span className="text-success">
                  {arabicNumber(row.effective)}
                </span>
                <span className="text-warning">
                  {arabicNumber(row.partially_effective)}
                </span>
                <span className="text-danger">
                  {arabicNumber(row.ineffective)}
                </span>
              </div>
            ))
          ) : (
            <div className="border-t border-border px-3 py-6 text-center text-xs text-muted-foreground">
              لا توجد Findings مرتبطة بـArchive Certificates حتى الآن.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-brand" />
          <div>
            <p className="text-xs font-semibold">
              Effectiveness by Severity
            </p>
            <p className="text-[8px] text-muted-foreground">
              Outcome counts فقط؛ لا يوجد وزن مختلف للـSeverity.
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {analytics.by_severity.map((row) => (
            <div
              key={row.severity}
              className="rounded-lg border border-border p-3"
            >
              <p className="text-[10px] font-semibold">
                {SEVERITY_LABELS[row.severity]}
              </p>
              <p className="mt-1 text-[8px] text-muted-foreground">
                {arabicNumber(row.total_findings)} Finding(s)
                {" · "}
                {arabicNumber(row.completed_verifications)} verified
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[8px]">
                <span className="text-success">
                  {arabicNumber(row.effective)} Effective
                </span>
                <span className="text-warning">
                  {arabicNumber(row.partially_effective)} Partial
                </span>
                <span className="text-danger">
                  {arabicNumber(row.ineffective)} Ineffective
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[8px] leading-4 text-muted-foreground">
        Generated {formatDate(analytics.generated_at)}. Historical Due Date
        performance غير محسوب لأن Finding تحتفظ بقيمة Due Date الحالية، وليس
        snapshot مستقل لكل تغيير في الموعد.
      </p>
    </section>
  );
}
