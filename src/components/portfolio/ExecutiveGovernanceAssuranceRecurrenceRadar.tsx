import {
  AlertTriangle,
  Archive,
  GitBranch,
  Link2,
  ShieldAlert,
} from "lucide-react";

import { useGovernanceAssuranceRecurrenceGroups } from "@/hooks/use-governance-assurance-findings";
import { arabicNumber } from "@/lib/format";
import type {
  GovernanceAssuranceFindingRootCauseCategory,
  GovernanceAssuranceFindingTaxonomyCategory,
} from "@/types/governance-assurance-findings";

const TAXONOMY_LABELS: Record<
  GovernanceAssuranceFindingTaxonomyCategory,
  string
> = {
  control_design: "Control Design",
  control_execution: "Control Execution",
  process: "Process",
  data_quality: "Data Quality",
  access_security: "Access & Security",
  compliance: "Compliance",
  documentation: "Documentation",
  third_party: "Third Party",
  governance: "Governance",
  other: "Other",
};

const ROOT_CAUSE_LABELS: Record<
  GovernanceAssuranceFindingRootCauseCategory,
  string
> = {
  people: "People",
  process: "Process",
  system: "System",
  data: "Data",
  governance: "Governance",
  third_party: "Third Party",
  external: "External",
  unknown: "Unknown",
  other: "Other",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(new Date(value));
}

export function ExecutiveGovernanceAssuranceRecurrenceRadar() {
  const recurrence = useGovernanceAssuranceRecurrenceGroups();

  if (recurrence.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4 animate-pulse text-brand" />
          جاري تحليل Recurrence Keys…
        </div>
      </section>
    );
  }

  const groups = recurrence.data ?? [];
  const archives = new Set(
    groups.flatMap((group) =>
      group.occurrences.map((occurrence) => occurrence.archive_id),
    ),
  ).size;
  const active = groups.reduce((sum, group) => sum + group.active_count, 0);
  const criticalHigh = groups.reduce(
    (sum, group) => sum + group.critical_high_active,
    0,
  );
  const inconsistent = groups.filter(
    (group) =>
      !group.taxonomy_consistent || !group.root_cause_consistent,
  ).length;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="h-4 w-4 text-brand" />
          Recurrence Radar
        </h3>
        <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
          التكرار هنا Deterministic فقط: نفس Recurrence Key بعد trim/lower عبر
          Archive Certificates مختلفة. لا يوجد fuzzy matching أو مقارنة
          تلقائية للنصوص والعناوين.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "Recurring Keys",
            value: groups.length,
            className: "text-brand",
            icon: GitBranch,
          },
          {
            label: "Archives Affected",
            value: archives,
            className: "text-foreground",
            icon: Archive,
          },
          {
            label: "Active Occurrences",
            value: active,
            className: "text-warning",
            icon: AlertTriangle,
          },
          {
            label: "Critical / High Active",
            value: criticalHigh,
            className: "text-danger",
            icon: ShieldAlert,
          },
          {
            label: "Classification Conflicts",
            value: inconsistent,
            className: inconsistent > 0 ? "text-danger" : "text-success",
            icon: Link2,
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
              <p className={"mt-1 text-xl font-bold " + card.className}>
                {arabicNumber(card.value)}
              </p>
            </div>
          );
        })}
      </div>

      {!groups.length ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-xs text-muted-foreground">
          لا توجد Recurrence مؤكدة حتى الآن. المفتاح لا يظهر هنا إلا إذا وُجد
          في Finding داخل Archiveين مختلفين على الأقل.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const latest = group.occurrences[0];
            const primaryTaxonomy = latest?.taxonomy_category ?? null;
            const primaryRootCause = latest?.root_cause_category ?? null;
            const inconsistentGroup =
              !group.taxonomy_consistent || !group.root_cause_consistent;

            return (
              <div
                key={group.recurrence_key}
                className={
                  inconsistentGroup
                    ? "rounded-xl border border-danger/30 bg-danger/[0.025] p-4"
                    : "rounded-xl border border-border bg-background p-4"
                }
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-brand/10 px-2 py-1 font-mono text-[9px] font-semibold text-brand">
                        {group.recurrence_key}
                      </span>
                      {inconsistentGroup && (
                        <span className="rounded-full bg-danger/10 px-2 py-1 text-[8px] font-semibold text-danger">
                          Classification Conflict
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-muted-foreground">
                      <span>
                        {arabicNumber(group.finding_count)} Findings
                      </span>
                      <span>
                        {arabicNumber(group.archive_count)} Archives
                      </span>
                      <span>
                        {arabicNumber(group.active_count)} Active
                      </span>
                      <span>
                        {arabicNumber(group.critical_high_active)} Critical/High
                        Active
                      </span>
                      <span>First: {formatDate(group.first_seen_at)}</span>
                      <span>Latest: {formatDate(group.last_seen_at)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[8px]">
                      <span className="rounded-full border border-border px-2 py-1">
                        Category:{" "}
                        {primaryTaxonomy
                          ? TAXONOMY_LABELS[primaryTaxonomy]
                          : "—"}
                      </span>
                      <span className="rounded-full border border-border px-2 py-1">
                        Root Cause:{" "}
                        {primaryRootCause
                          ? ROOT_CAUSE_LABELS[primaryRootCause]
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {inconsistentGroup && (
                  <div className="mt-3 rounded-lg border border-danger/20 bg-danger/5 p-3 text-[8px] leading-4 text-muted-foreground">
                    نفس Recurrence Key مستخدمة مع Category أو Root Cause مختلفة.
                    النظام لا يصححها تلقائيًا؛ راجع التصنيف يدويًا.
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {group.occurrences.map((occurrence) => (
                    <div
                      key={occurrence.finding_id}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[9px] font-semibold">
                            {occurrence.title}
                          </p>
                          <p className="mt-1 text-[8px] text-muted-foreground">
                            {occurrence.certificate_code} ·{" "}
                            {occurrence.period_label}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[8px] text-muted-foreground">
                          <span>{occurrence.severity}</span>
                          <span>{occurrence.status}</span>
                          <span>{formatDate(occurrence.created_at)}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-muted-foreground">
                        <span>
                          Category:{" "}
                          {occurrence.taxonomy_category
                            ? TAXONOMY_LABELS[occurrence.taxonomy_category]
                            : "—"}
                        </span>
                        <span>
                          Root Cause:{" "}
                          {occurrence.root_cause_category
                            ? ROOT_CAUSE_LABELS[
                                occurrence.root_cause_category
                              ]
                            : "—"}
                        </span>
                        {occurrence.control_reference && (
                          <span>
                            Reference: {occurrence.control_reference}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
