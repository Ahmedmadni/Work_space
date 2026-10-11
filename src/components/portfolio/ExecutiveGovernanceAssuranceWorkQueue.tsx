import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ShieldAlert,
  UserCheck,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useGovernanceAssuranceFindings } from "@/hooks/use-governance-assurance-findings";
import { arabicNumber } from "@/lib/format";
import { buildGovernanceAssuranceWorkQueue } from "@/services/governance-assurance-findings.service";
import type {
  GovernanceAssuranceWorkItem,
  GovernanceAssuranceWorkItemReason,
  GovernanceAssuranceWorkItemUrgency,
} from "@/types/governance-assurance-findings";

const URGENCY_META: Record<
  GovernanceAssuranceWorkItemUrgency,
  { label: string; className: string }
> = {
  overdue: {
    label: "Overdue",
    className: "bg-danger/10 text-danger",
  },
  critical: {
    label: "Critical",
    className: "bg-danger/10 text-danger",
  },
  attention: {
    label: "Attention",
    className: "bg-warning/10 text-warning",
  },
  normal: {
    label: "Normal",
    className: "bg-muted text-muted-foreground",
  },
};

const REASON_LABELS: Record<GovernanceAssuranceWorkItemReason, string> = {
  finding_assigned: "Finding Assigned",
  capa_assigned: "CAPA Assigned",
  verification_required: "Verification Required",
  capa_overdue: "CAPA Overdue",
  finding_overdue: "Finding Overdue",
  critical_high_active: "Critical / High Active",
  effectiveness_failed: "Effectiveness Failed",
  recurrence_preventive_gap: "Preventive Gap",
  verification_pending: "Verification Pending",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(new Date(value + (value.length === 10 ? "T12:00:00Z" : "")));
}

function scrollToFinding(item: GovernanceAssuranceWorkItem) {
  const target = document.getElementById(item.anchor_id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("ring-2", "ring-brand/50");
  window.setTimeout(() => {
    target.classList.remove("ring-2", "ring-brand/50");
  }, 1600);
}

function WorkItemCard({ item }: { item: GovernanceAssuranceWorkItem }) {
  const urgency = URGENCY_META[item.urgency];
  const Icon =
    item.kind === "capa_assignment"
      ? Wrench
      : item.kind === "verification"
        ? CheckCircle2
        : item.kind === "owner_attention"
          ? ShieldAlert
          : UserCheck;

  return (
    <button
      type="button"
      onClick={() => scrollToFinding(item)}
      className="w-full rounded-xl border border-border bg-background p-3 text-start transition hover:border-brand/30 hover:bg-brand/[0.025]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-brand" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[10px] font-semibold">
              {item.title}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[8px] " +
                urgency.className
              }
            >
              {urgency.label}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
              {REASON_LABELS[item.reason]}
            </span>
          </span>
          <span className="mt-1 block text-[8px] leading-4 text-muted-foreground">
            {item.context}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-muted-foreground">
            <span>{item.certificate_code}</span>
            <span>{item.period_label}</span>
            <span>Due: {formatDate(item.due_date)}</span>
          </span>
        </span>
      </div>
    </button>
  );
}

export function ExecutiveGovernanceAssuranceWorkQueue() {
  const findings = useGovernanceAssuranceFindings();
  const [tab, setTab] = useState<"my_work" | "owner_attention">("my_work");

  const queue = useMemo(
    () =>
      findings.data
        ? buildGovernanceAssuranceWorkQueue(findings.data)
        : null,
    [findings.data],
  );

  if (findings.isLoading || !queue) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4 animate-pulse text-brand" />
          جاري تحميل Assurance Work Queue…
        </div>
      </section>
    );
  }

  const items =
    tab === "my_work" ? queue.my_work : queue.owner_attention;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="h-4 w-4 text-brand" />
          Assurance Work Queue
        </h3>
        <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
          قائمة عمل تشغيلية مبنية فقط على الإسنادات والحالات والمواعيد المسجلة.
          لا توجد Priority Score مخفية؛ الترتيب هو Overdue ثم Critical ثم Attention ثم Normal.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {[
          ["My Work", queue.summary.my_total, UserCheck, "text-brand"],
          ["My Overdue", queue.summary.my_overdue, AlertTriangle, "text-danger"],
          ["My Findings", queue.summary.my_findings, ClipboardList, "text-foreground"],
          ["My CAPA", queue.summary.my_capa, Wrench, "text-warning"],
          ["My Verifications", queue.summary.my_verifications, CheckCircle2, "text-info"],
          ["Owner Attention", queue.summary.owner_attention, ShieldAlert, "text-warning"],
          ["Owner Overdue", queue.summary.owner_overdue, Clock3, "text-danger"],
        ].map(([label, value, Icon, className]) => {
          const IconComponent = Icon as typeof UserCheck;
          return (
            <div
              key={String(label)}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2">
                <IconComponent className={"h-3.5 w-3.5 " + className} />
                <p className="text-[8px] text-muted-foreground">
                  {String(label)}
                </p>
              </div>
              <p className={"mt-1 text-lg font-bold " + className}>
                {arabicNumber(Number(value))}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("my_work")}
          className={
            tab === "my_work"
              ? "border-b-2 border-brand px-3 py-2 text-[10px] font-semibold text-brand"
              : "px-3 py-2 text-[10px] text-muted-foreground"
          }
        >
          My Work ({arabicNumber(queue.summary.my_total)})
        </button>
        <button
          type="button"
          onClick={() => setTab("owner_attention")}
          className={
            tab === "owner_attention"
              ? "border-b-2 border-brand px-3 py-2 text-[10px] font-semibold text-brand"
              : "px-3 py-2 text-[10px] text-muted-foreground"
          }
        >
          Owner Attention ({arabicNumber(queue.summary.owner_attention)})
        </button>
      </div>

      {!items.length ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-2 text-xs font-semibold">
            لا توجد عناصر عمل في هذا التبويب
          </p>
          <p className="mt-1 text-[9px] text-muted-foreground">
            ستظهر العناصر تلقائيًا من Findings وCAPA وEffectiveness Reviews الحالية.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {items.map((item) => (
            <WorkItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <p className="text-[8px] leading-4 text-muted-foreground">
        Generated {formatDate(queue.generated_at)}. النقر على أي عنصر ينقلك إلى Finding المرتبطة به في السجل أدناه.
      </p>
    </section>
  );
}
