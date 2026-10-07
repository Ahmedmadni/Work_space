import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Download,
  History,
  Minus,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { arabicNumber } from "@/lib/format";
import {
  buildGovernanceAssuranceHistory,
  compareGovernanceAssuranceReviews,
  downloadGovernanceAssuranceComparisonCsv,
} from "@/services/governance-assurance.service";
import type {
  ExecutiveGovernanceReview,
  ExecutiveGovernanceReviewsData,
  GovernanceAssuranceActualDirection,
  GovernanceAssuranceComplianceTransition,
} from "@/types/governance-assurance";

const CONCLUSION_LABELS: Record<string, string> = {
  satisfactory: "Satisfactory",
  needs_improvement: "Needs Improvement",
  unsatisfactory: "Unsatisfactory",
  insufficient_evidence: "Insufficient Evidence",
};

const TRANSITION_LABELS: Record<
  GovernanceAssuranceComplianceTransition,
  string
> = {
  recovered: "Recovered",
  new_breach: "New Breach",
  persistent_breach: "Persistent Breach",
  persistent_met: "Still Met",
  status_changed: "Status Changed",
  no_target: "No Target",
  insufficient_data: "Insufficient Data",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  }).format(new Date(value + "T12:00:00Z"));
}

function formatValue(
  value: number | null,
  unit: "%" | "days" | "count",
) {
  if (value == null) return "—";
  if (unit === "%") return arabicNumber(value) + "%";
  if (unit === "days") return arabicNumber(value) + " يوم";
  return arabicNumber(value);
}

function directionMeta(direction: GovernanceAssuranceActualDirection) {
  if (direction === "improved") {
    return {
      label: "Actual Improved",
      className: "text-success",
      icon: ArrowUp,
    };
  }
  if (direction === "worsened") {
    return {
      label: "Actual Worsened",
      className: "text-danger",
      icon: ArrowDown,
    };
  }
  if (direction === "unchanged") {
    return {
      label: "Actual Unchanged",
      className: "text-muted-foreground",
      icon: Minus,
    };
  }
  return {
    label: "Insufficient Data",
    className: "text-info",
    icon: Minus,
  };
}

function reviewOrder(a: ExecutiveGovernanceReview, b: ExecutiveGovernanceReview) {
  return (
    a.review_date.localeCompare(b.review_date) ||
    (a.finalized_at ?? a.updated_at).localeCompare(
      b.finalized_at ?? b.updated_at,
    )
  );
}

export function ExecutiveGovernanceAssuranceHistory({
  data,
}: {
  data: ExecutiveGovernanceReviewsData;
}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [previousId, setPreviousId] = useState<string | null>(null);

  const finalized = useMemo(
    () =>
      data.reviews
        .filter((review) => review.status === "finalized")
        .slice()
        .sort(reviewOrder),
    [data.reviews],
  );
  const history = useMemo(
    () => buildGovernanceAssuranceHistory(data.reviews),
    [data.reviews],
  );

  if (finalized.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <History className="h-4 w-4 text-brand" />
          Assurance History & Review Comparison
        </div>
        <p className="mt-2 text-xs leading-5">
          يلزم وجود Reviewين Finalized على الأقل للمقارنة التاريخية. Drafts لا
          تدخل في التحليل.
        </p>
      </div>
    );
  }

  const requestedCurrent = finalized.find((row) => row.id === currentId);
  const currentReview = requestedCurrent ?? finalized.at(-1)!;
  const currentIndex = finalized.findIndex(
    (row) => row.id === currentReview.id,
  );
  const previousCandidates = finalized.slice(0, currentIndex);
  const requestedPrevious = previousCandidates.find(
    (row) => row.id === previousId,
  );
  const previousReview =
    requestedPrevious ?? previousCandidates.at(-1) ?? null;

  if (!previousReview) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-xs text-muted-foreground">
        اختر Review أحدث من أول Review Finalized لعرض المقارنة.
      </div>
    );
  }

  const comparison = compareGovernanceAssuranceReviews(
    previousReview,
    currentReview,
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-brand" />
            Assurance History & Review-to-Review Comparison
          </h3>
          <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
            Actual movement يقيس اتجاه البيانات نفسها. Compliance Transition
            يقيس Met/Not Met. تغيير Target يظهر منفصلًا حتى لا تختلط المقارنة
            بتغيير المعيار.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            downloadGovernanceAssuranceComparisonCsv(comparison)
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[10px] font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          تصدير Comparison CSV
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[9px] text-muted-foreground">
          Previous Finalized Review
          <select
            value={previousReview.id}
            onChange={(event) => setPreviousId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            {previousCandidates.map((review) => (
              <option key={review.id} value={review.id}>
                {review.period_label} · {review.review_date} · Target v
                {review.target_version}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[9px] text-muted-foreground">
          Current Finalized Review
          <select
            value={currentReview.id}
            onChange={(event) => {
              setCurrentId(event.target.value);
              setPreviousId(null);
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            {finalized.slice(1).map((review) => (
              <option key={review.id} value={review.id}>
                {review.period_label} · {review.review_date} · Target v
                {review.target_version}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3 text-[9px]">
        <strong>{previousReview.period_label}</strong>
        <span className="text-muted-foreground">
          {formatDate(previousReview.review_date)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-brand" />
        <strong>{currentReview.period_label}</strong>
        <span className="text-muted-foreground">
          {formatDate(currentReview.review_date)}
        </span>
        {comparison.target_version_changed && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
            Target Version Changed
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ["Recovered", comparison.summary.recovered_metrics, "text-success"],
          ["New Breaches", comparison.summary.new_breaches, "text-danger"],
          [
            "Persistent",
            comparison.summary.persistent_breaches,
            "text-warning",
          ],
          [
            "Target Changed",
            comparison.summary.target_changed_metrics,
            "text-warning",
          ],
          [
            "Actual Improved",
            comparison.summary.improved_actuals,
            "text-success",
          ],
          [
            "Actual Worsened",
            comparison.summary.worsened_actuals,
            "text-danger",
          ],
          ["Met Now", comparison.summary.current_met, "text-success"],
          ["Not Met Now", comparison.summary.current_not_met, "text-danger"],
        ].map(([label, value, tone]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-border bg-background p-3"
          >
            <p className="text-[8px] text-muted-foreground">{label}</p>
            <p className={"mt-1 text-xl font-bold " + tone}>
              {arabicNumber(value as number)}
            </p>
          </div>
        ))}
      </div>

      {comparison.summary.target_changed_metrics > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 text-[9px] leading-5 text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          تغير Target في{" "}
          {arabicNumber(comparison.summary.target_changed_metrics)} metric(s).
          لذلك يُعرض تغير Actual وحالة Compliance كلٌ على حدة، ولا يُفترض أن
          التحول إلى Met أو Not Met سببه الأداء وحده.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[1.45fr_.8fr_.8fr_.8fr_1fr_1fr] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground">
            <span>Metric</span>
            <span>Previous</span>
            <span>Current</span>
            <span>Target</span>
            <span>Actual Direction</span>
            <span>Compliance</span>
          </div>

          {comparison.metrics.map((row) => {
            const direction = directionMeta(row.actual_direction);
            const DirectionIcon = direction.icon;
            return (
              <div
                key={row.key}
                className="grid grid-cols-[1.45fr_.8fr_.8fr_.8fr_1fr_1fr] gap-2 border-t border-border px-3 py-3 text-[9px]"
              >
                <div>
                  <p className="font-semibold">{row.label}</p>
                  {row.target_changed && (
                    <p className="mt-1 text-[8px] text-warning">
                      Target changed
                    </p>
                  )}
                </div>
                <div>
                  <p>{formatValue(row.previous_actual, row.unit)}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {row.previous_status}
                  </p>
                </div>
                <div>
                  <p>{formatValue(row.current_actual, row.unit)}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {row.current_status}
                  </p>
                </div>
                <div>
                  <p>
                    {row.operator === "gte" ? "≥" : "≤"}{" "}
                    {formatValue(row.current_target, row.unit)}
                  </p>
                  {row.target_changed && (
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      was{" "}
                      {formatValue(row.previous_target, row.unit)}
                    </p>
                  )}
                </div>
                <div className={direction.className}>
                  <p className="inline-flex items-center gap-1">
                    <DirectionIcon className="h-3.5 w-3.5" />
                    {direction.label}
                  </p>
                  <p className="mt-1 text-[8px]">
                    Δ{" "}
                    {row.actual_delta == null
                      ? "—"
                      : (row.actual_delta > 0 ? "+" : "") +
                        formatValue(row.actual_delta, row.unit)}
                  </p>
                </div>
                <div>
                  <p
                    className={
                      row.compliance_transition === "recovered" ||
                      row.compliance_transition === "persistent_met"
                        ? "text-success"
                        : row.compliance_transition === "new_breach"
                          ? "text-danger"
                          : row.compliance_transition ===
                              "persistent_breach"
                            ? "text-warning"
                            : "text-muted-foreground"
                    }
                  >
                    {TRANSITION_LABELS[row.compliance_transition]}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">
            Persistent Active Exceptions
          </p>
          <p className="mt-1 text-xl font-bold text-warning">
            {arabicNumber(comparison.exceptions.persistent_active)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">
            Newly Active Exceptions
          </p>
          <p className="mt-1 text-xl font-bold text-danger">
            {arabicNumber(comparison.exceptions.newly_active)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">
            Resolved Since Previous
          </p>
          <p className="mt-1 text-xl font-bold text-success">
            {arabicNumber(comparison.exceptions.resolved_since_previous)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">
            Current Overdue Exceptions
          </p>
          <p className="mt-1 text-xl font-bold text-danger">
            {arabicNumber(comparison.exceptions.current_overdue)}
          </p>
        </div>
      </div>

      {comparison.exceptions.no_longer_present > 0 && (
        <p className="text-[8px] leading-4 text-muted-foreground">
          {arabicNumber(comparison.exceptions.no_longer_present)} previous
          active exception(s) لم تعد موجودة في Snapshot الحالية. لا يصنفها
          النظام تلقائيًا كـResolved لأن غيابها قد يكون نتيجة Cancellation أو
          اختلاف نطاق الـSnapshot.
        </p>
      )}

      <div className="rounded-xl border border-border bg-background p-3">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand" />
          <div>
            <p className="text-xs font-semibold">Finalized Review Timeline</p>
            <p className="text-[8px] text-muted-foreground">
              آخر 12 Review Finalized مرتبة زمنيًا.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {history.slice(-12).map((point) => (
            <button
              key={point.review_id}
              type="button"
              onClick={() => setCurrentId(point.review_id)}
              className="rounded-lg border border-border p-3 text-start hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-semibold">
                  {point.period_label}
                </p>
                <span className="text-[8px] text-muted-foreground">
                  v{arabicNumber(point.target_version)}
                </span>
              </div>
              <p className="mt-1 text-[8px] text-muted-foreground">
                {formatDate(point.review_date)}
              </p>
              <p className="mt-2 text-[8px]">
                <span className="text-success">
                  {arabicNumber(point.met_count)} Met
                </span>
                {" · "}
                <span className="text-danger">
                  {arabicNumber(point.not_met_count)} Not Met
                </span>
                {" · "}
                {arabicNumber(point.active_exceptions)} active exceptions
              </p>
              <p className="mt-1 text-[8px] text-muted-foreground">
                {CONCLUSION_LABELS[point.assurance_conclusion] ??
                  point.assurance_conclusion}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
