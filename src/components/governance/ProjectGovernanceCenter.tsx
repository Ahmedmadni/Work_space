import {
  Activity,
  Bot,
  ChevronDown,
  FileClock,
  Filter,
  KeyRound,
  Search,
  ShieldCheck,
  ShieldX,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useProjectAuditEvents,
  useProjectAuditSummary,
  useVerifyProjectAuditChain,
} from "@/hooks/use-audit";
import { relativeTime } from "@/lib/format";
import { auditGovernanceAvailable } from "@/services/audit.service";
import type {
  ProjectAuditCategory,
  ProjectAuditEvent,
  ProjectAuditSource,
} from "@/types/audit";
import type { ProjectCollaborator } from "@/types/collaboration";

const ACTION_LABELS: Record<string, string> = {
  member_added: "إضافة عضو للمشروع",
  member_removed: "إزالة عضو من المشروع",
  member_role_changed: "تغيير صلاحية عضو",
  invitation_created: "إنشاء دعوة",
  invitation_updated: "تعديل دعوة",
  invitation_accepted: "قبول دعوة",
  invitation_revoked: "إلغاء دعوة",
  invitation_deleted: "حذف دعوة",
  project_updated: "تعديل بيانات المشروع",
  project_status_changed: "تغيير حالة المشروع",
  project_renamed: "تغيير اسم المشروع",
  project_archived: "أرشفة المشروع",
  project_restored: "استعادة المشروع",
  project_deleted: "حذف المشروع",
  board_created: "إنشاء لوحة",
  board_deleted: "حذف لوحة",
  board_updated: "تعديل لوحة",
  board_renamed: "تغيير اسم لوحة",
  board_archived: "أرشفة لوحة",
  board_restored: "استعادة لوحة",
  node_execution_changed: "تغيير بيانات تنفيذ مهمة",
  task_assignee_changed: "تغيير مسؤول مهمة",
  automation_rule_created: "إنشاء قاعدة أتمتة",
  automation_rule_deleted: "حذف قاعدة أتمتة",
  automation_rule_enabled: "تشغيل قاعدة أتمتة",
  automation_rule_disabled: "إيقاف قاعدة أتمتة",
  automation_rule_config_changed: "تعديل إعداد قاعدة أتمتة",
  automation_rule_tested: "اختبار قاعدة أتمتة",
  automation_run_failed: "فشل تشغيل أتمتة",
  restore_checkpoint_created: "إنشاء نقطة استعادة",
  import_snapshot_created: "إنشاء نسخة استيراد",
  manual_snapshot_created: "إنشاء نسخة يدوية",
  ai_copilot_task_accepted: "قبول مهمة من مساعد المشروع",
  member_capacity_changed: "تغيير السعة الأسبوعية لعضو",
  planning_baseline_created: "إنشاء Baseline للتخطيط",
  planning_baseline_deleted: "حذف Baseline للتخطيط",
};

const CATEGORY_LABELS: Record<ProjectAuditCategory, string> = {
  access: "الوصول والصلاحيات",
  automation: "الأتمتة",
  execution: "التنفيذ",
  content: "المحتوى واللوحات",
  project: "المشروع",
};

const SOURCE_LABELS: Record<ProjectAuditSource, string> = {
  app: "مستخدم",
  automation: "أتمتة",
  system: "نظام",
  auth: "المصادقة",
};

const ROLE_LABELS = {
  owner: "مالك",
  admin: "مسؤول",
  editor: "محرر",
  viewer: "مشاهد",
} as const;

const ROLE_CAPABILITIES = {
  owner: "إدارة كاملة، أعضاء، أتمتة، Audit، تعديل وتنفيذ",
  admin: "إدارة الأعضاء والأتمتة وAudit والتعديل والتنفيذ",
  editor: "تعديل اللوحات والمهام والتعليقات بدون إدارة الصلاحيات",
  viewer: "عرض فقط بدون تعديل أو إدارة",
} as const;

function sinceFromRange(range: string): string | null {
  const now = Date.now();
  if (range === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (range === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function ChangeSet({
  beforeState,
  afterState,
}: {
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
}) {
  const keys = Array.from(
    new Set([
      ...Object.keys(beforeState ?? {}),
      ...Object.keys(afterState ?? {}),
    ]),
  );

  if (!keys.length) {
    return (
      <p className="text-[10px] text-muted-foreground">
        لا توجد تفاصيل إضافية محفوظة لهذا الحدث.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {keys.map((key) => {
        const before = beforeState?.[key];
        const after = afterState?.[key];
        const changed =
          JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
        return (
          <div
            key={key}
            className="grid gap-1 border-t border-border px-3 py-2 first:border-t-0 md:grid-cols-[140px_1fr_1fr]"
          >
            <span className="text-[9px] font-medium text-muted-foreground">
              {key}
            </span>
            <span
              className={
                changed
                  ? "break-all text-[10px] text-danger/80"
                  : "break-all text-[10px] text-muted-foreground"
              }
            >
              {valueLabel(before)}
            </span>
            <span
              className={
                changed
                  ? "break-all text-[10px] text-success"
                  : "break-all text-[10px] text-muted-foreground"
              }
            >
              {valueLabel(after)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AuditEventRow({ event }: { event: ProjectAuditEvent }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-muted/30"
      >
        <span
          className={
            event.actor_kind === "automation"
              ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info/10 text-info"
              : event.actor_kind === "human"
                ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"
                : "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
          }
        >
          {event.actor_kind === "automation" ? (
            <Bot className="h-4 w-4" />
          ) : event.actor_kind === "human" ? (
            <UserCog className="h-4 w-4" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold">
              {ACTION_LABELS[event.action] ?? event.action}
            </p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
              {CATEGORY_LABELS[event.category]}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
              {SOURCE_LABELS[event.source]}
            </span>
          </div>

          <p className="mt-1 truncate text-[10px] text-muted-foreground">
            {event.actor_name}
            {event.actor_email ? ` · ${event.actor_email}` : ""}
            {event.entity_type ? ` · ${event.entity_type}` : ""}
            {event.entity_id ? ` · ${event.entity_id}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[9px] text-muted-foreground">
          <span>#{event.sequence}</span>
          <span>{relativeTime(event.occurred_at)}</span>
          <ChevronDown
            className={
              open
                ? "h-4 w-4 rotate-180 transition"
                : "h-4 w-4 transition"
            }
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/10 px-4 py-3">
          <div className="mb-2 grid grid-cols-2 gap-2 text-[9px] text-muted-foreground md:grid-cols-4">
            <span>Transaction: {event.transaction_id}</span>
            <span>Source: {event.source}</span>
            <span>Actor: {event.actor_kind}</span>
            <span>{new Date(event.occurred_at).toLocaleString("ar-SA")}</span>
          </div>
          <ChangeSet
            beforeState={event.before_state}
            afterState={event.after_state}
          />
        </div>
      )}
    </article>
  );
}

export function ProjectGovernanceCenter({
  projectId,
  collaborators,
  canManage,
}: {
  projectId: string;
  collaborators: ProjectCollaborator[];
  canManage: boolean;
}) {
  const available = auditGovernanceAvailable();
  const [source, setSource] = useState<"all" | ProjectAuditSource>("all");
  const [category, setCategory] =
    useState<"all" | ProjectAuditCategory>("all");
  const [actor, setActor] = useState("all");
  const [range, setRange] = useState("7d");
  const [query, setQuery] = useState("");

  const filters = useMemo(
    () => ({
      source: source === "all" ? null : source,
      category: category === "all" ? null : category,
      actorUserId: actor === "all" ? null : actor,
      search: query,
      since: sinceFromRange(range),
      limit: 120,
    }),
    [source, category, actor, query, range],
  );

  const enabled = canManage && available;
  const audit = useProjectAuditEvents(projectId, filters, enabled);
  const summary = useProjectAuditSummary(projectId, enabled);
  const verify = useVerifyProjectAuditChain(projectId);

  if (!canManage) return null;

  const roleCounts = collaborators.reduce(
    (acc, member) => {
      acc[member.role] += 1;
      return acc;
    },
    { owner: 0, admin: 0, editor: 0, viewer: 0 },
  );

  const filtersActive =
    source !== "all" ||
    category !== "all" ||
    actor !== "all" ||
    range !== "7d" ||
    !!query.trim();

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand" />
              الحوكمة وسجل التدقيق
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              سجل مستقل Append-only للتغييرات الحساسة مع تمييز المستخدم والأتمتة والنظام.
            </p>
          </div>

          <button
            type="button"
            disabled={!available || verify.isPending}
            onClick={() => verify.mutate()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {verify.isPending ? (
              <Activity className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            تحقق من سلامة السجل
          </button>
        </div>

        {!available && (
          <div className="mt-3 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
            سجل التدقيق الإنتاجي يتطلب بيئة Supabase.
          </div>
        )}
      </header>

      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["أحداث اليوم", summary.data?.events_today ?? 0],
          ["آخر 7 أيام", summary.data?.events_7d ?? 0],
          ["تغييرات وصول", summary.data?.access_7d ?? 0],
          ["تغييرات تنفيذ", summary.data?.execution_7d ?? 0],
          ["فشل أتمتة", summary.data?.automation_failures_7d ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-muted/30 p-3">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث في المستخدم أو الحدث أو القيمة أو المعرّف…"
                className="w-full rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-xs outline-none focus:border-brand"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value as "all" | ProjectAuditCategory,
                  )
                }
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="all">كل الفئات</option>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as "all" | ProjectAuditSource)
                }
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="all">كل المصادر</option>
                {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                value={actor}
                onChange={(event) => setActor(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="all">كل المستخدمين</option>
                {collaborators.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name}
                  </option>
                ))}
              </select>

              <select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="24h">آخر 24 ساعة</option>
                <option value="7d">آخر 7 أيام</option>
                <option value="30d">آخر 30 يومًا</option>
                <option value="all">كل السجل</option>
              </select>

              {filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setSource("all");
                    setCategory("all");
                    setActor("all");
                    setRange("7d");
                    setQuery("");
                  }}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-danger hover:bg-danger/10"
                >
                  <X className="h-3.5 w-3.5" />
                  مسح
                </button>
              )}
            </div>
          </div>

          {audit.isLoading ? (
            <div className="space-y-2 p-4">
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : !(audit.data ?? []).length ? (
            <div className="grid min-h-60 place-items-center p-8 text-center">
              <div>
                <FileClock className="mx-auto h-9 w-9 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-semibold">
                  لا توجد أحداث مطابقة
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  غيّر الفلاتر أو انتظر أول تغيير رقابي في المشروع.
                </p>
              </div>
            </div>
          ) : (
            <div>
              {(audit.data ?? []).map((event) => (
                <AuditEventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>

        <aside className="border-t border-border bg-muted/10 p-4 xl:border-s xl:border-t-0">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">مصفوفة الصلاحيات</h3>
              <p className="text-[10px] text-muted-foreground">
                الأدوار الفعلية في المشروع الحالي.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {(["owner", "admin", "editor", "viewer"] as const).map((role) => (
              <div
                key={role}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <UsersRound className="h-3.5 w-3.5 text-brand" />
                    {ROLE_LABELS[role]}
                  </span>
                  <strong>{roleCounts[role]}</strong>
                </div>
                <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                  {ROLE_CAPABILITIES[role]}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <p className="text-xs font-semibold">Append-only</p>
            </div>
            <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
              التطبيق لا يملك صلاحية تعديل أو حذف أحداث التدقيق بعد إنشائها.
            </p>
          </div>

          {(summary.data?.automation_failures_7d ?? 0) > 0 && (
            <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 p-3">
              <div className="flex items-center gap-2">
                <ShieldX className="h-4 w-4 text-danger" />
                <p className="text-xs font-semibold text-danger">
                  يحتاج مراجعة
                </p>
              </div>
              <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                يوجد فشل أتمتة مسجل خلال آخر 7 أيام.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
