import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileLock2,
  Gavel,
  History,
  ListChecks,
  Plus,
  Save,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useFinalizeExecutiveStrategyMeeting,
  useSaveExecutiveStrategyMeeting,
  useUpdateExecutiveMeetingActionItem,
} from "@/hooks/use-executive-meetings";
import { arabicNumber } from "@/lib/format";
import type { Project } from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type {
  ExecutiveMeetingActionStatus,
  ExecutiveMeetingAttendanceStatus,
  ExecutiveMeetingDecisionOutcome,
  ExecutiveMeetingGovernanceData,
  ExecutiveStrategyMeeting,
  SaveExecutiveMeetingActionInput,
  SaveExecutiveMeetingAttendeeInput,
  SaveExecutiveMeetingDecisionInput,
} from "@/types/executive-meetings";
import type { PortfolioActionCenterData } from "@/types/portfolio-actions";
import type {
  PortfolioObjective,
  PortfolioStrategyData,
  StrategyReviewData,
} from "@/types/strategy";

const OUTCOME_LABELS: Record<ExecutiveMeetingDecisionOutcome, string> = {
  decided: "تم اتخاذ القرار",
  deferred: "مؤجل",
  rejected: "مرفوض",
};

const ACTION_LABELS: Record<ExecutiveMeetingActionStatus, string> = {
  open: "مفتوح",
  in_progress: "قيد التنفيذ",
  done: "مكتمل",
  cancelled: "ملغى",
};

const ATTENDANCE_LABELS: Record<ExecutiveMeetingAttendanceStatus, string> = {
  invited: "مدعو",
  attended: "حضر",
  absent: "غائب",
  excused: "اعتذر",
};

interface MeetingDraft {
  id: string | null;
  expected_version: number | null;
  title: string;
  meeting_date: string;
  period_label: string;
  status: "draft" | "in_progress";
  chair_user_id: string;
  summary: string;
  next_meeting_date: string;
  board_pack_generated_at: string | null;
  attendees: SaveExecutiveMeetingAttendeeInput[];
  decisions: Array<SaveExecutiveMeetingDecisionInput & { id: string }>;
  action_items: Array<SaveExecutiveMeetingActionInput & { id: string }>;
}

interface PersonOption {
  user_id: string;
  full_name: string;
  email: string;
  role_label: string;
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysKey(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(
    value.length === 10 ? value + "T12:00:00Z" : value,
  );
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  }).format(date);
}

function latestReviewDecision(
  objective: PortfolioObjective,
  reviewData: StrategyReviewData | undefined,
) {
  return (reviewData?.reviews ?? [])
    .filter(
      (review) =>
        review.objective_id === objective.id &&
        !!review.decisions_needed?.trim(),
    )
    .slice()
    .sort((a, b) => {
      const byDate = b.review_date.localeCompare(a.review_date);
      return byDate !== 0
        ? byDate
        : b.created_at.localeCompare(a.created_at);
    })[0] ?? null;
}

function flattenPeople(
  collaboratorsByProject: Record<string, ProjectCollaborator[]>,
  currentUser: { id: string; full_name: string; email: string } | null,
): PersonOption[] {
  const people = new Map<string, PersonOption>();

  if (currentUser) {
    people.set(currentUser.id, {
      user_id: currentUser.id,
      full_name: currentUser.full_name,
      email: currentUser.email,
      role_label: "Current user",
    });
  }

  for (const [projectId, collaborators] of Object.entries(
    collaboratorsByProject,
  )) {
    for (const person of collaborators) {
      const prior = people.get(person.user_id);
      const projectTag = person.role + " · " + projectId;
      people.set(person.user_id, {
        user_id: person.user_id,
        full_name: person.full_name,
        email: person.email,
        role_label: prior?.role_label
          ? prior.role_label + " / " + projectTag
          : projectTag,
      });
    }
  }

  return [...people.values()].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "ar"),
  );
}

function linkedObjectiveForProject(
  projectId: string,
  objectives: PortfolioObjective[],
) {
  const linked = objectives.filter((objective) =>
    objective.project_ids.includes(projectId),
  );
  return linked.length === 1 ? linked[0]! : null;
}

function freshMeetingDraft(
  strategy: PortfolioStrategyData | undefined,
  reviewData: StrategyReviewData | undefined,
  actionCenter: PortfolioActionCenterData | undefined,
  currentUser: { id: string; full_name: string; email: string } | null,
  includeBoardPackAgenda: boolean,
): MeetingDraft {
  const today = todayKey();
  const objectives = strategy?.objectives ?? [];
  const decisions: MeetingDraft["decisions"] = [];

  if (includeBoardPackAgenda) {
    for (const source of actionCenter?.decisions ?? []) {
      if (source.status !== "proposed") continue;
      const objective = linkedObjectiveForProject(source.project_id, objectives);
      decisions.push({
        id: crypto.randomUUID(),
        source_decision_id: source.id,
        source_decision_version: source.version,
        objective_id: objective?.id ?? null,
        project_id: source.project_id,
        title: source.title,
        outcome: "deferred",
        decision_text: source.decision,
        rationale: source.rationale,
        owner_user_id: source.owner_user_id,
        follow_up_date: null,
      });
    }

    for (const objective of objectives) {
      const review = latestReviewDecision(objective, reviewData);
      if (!review?.decisions_needed?.trim()) continue;
      decisions.push({
        id: crypto.randomUUID(),
        source_decision_id: null,
        source_decision_version: null,
        objective_id: objective.id,
        project_id:
          objective.project_ids.length === 1
            ? objective.project_ids[0]!
            : null,
        title: "قرارات مطلوبة — " + objective.title,
        outcome: "deferred",
        decision_text: review.decisions_needed,
        rationale: null,
        owner_user_id: objective.owner_user_id,
        follow_up_date: null,
      });
    }
  }

  return {
    id: null,
    expected_version: null,
    title: "اجتماع المراجعة التنفيذية",
    meeting_date: today,
    period_label: "",
    status: "draft",
    chair_user_id: currentUser?.id ?? "",
    summary: "",
    next_meeting_date: "",
    board_pack_generated_at: includeBoardPackAgenda
      ? new Date().toISOString()
      : null,
    attendees: currentUser
      ? [
          {
            id: crypto.randomUUID(),
            user_id: currentUser.id,
            display_name: currentUser.full_name,
            email_snapshot: currentUser.email,
            role_label: "Chair",
            attendance_status: "attended",
          },
        ]
      : [],
    decisions,
    action_items: [],
  };
}

function draftFromMeeting(meeting: ExecutiveStrategyMeeting): MeetingDraft {
  return {
    id: meeting.id,
    expected_version: meeting.version,
    title: meeting.title,
    meeting_date: meeting.meeting_date,
    period_label: meeting.period_label ?? "",
    status:
      meeting.status === "in_progress" ? "in_progress" : "draft",
    chair_user_id: meeting.chair_user_id ?? "",
    summary: meeting.summary ?? "",
    next_meeting_date: meeting.next_meeting_date ?? "",
    board_pack_generated_at: meeting.board_pack_generated_at,
    attendees: meeting.attendees.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      display_name: row.display_name,
      email_snapshot: row.email_snapshot,
      role_label: row.role_label,
      attendance_status: row.attendance_status,
    })),
    decisions: meeting.decisions.map((row) => ({
      id: row.id,
      source_decision_id: row.source_decision_id,
      source_decision_version: row.source_decision_version,
      objective_id: row.objective_id,
      project_id: row.project_id,
      title: row.title,
      outcome: row.outcome,
      decision_text: row.decision_text,
      rationale: row.rationale,
      owner_user_id: row.owner_user_id,
      follow_up_date: row.follow_up_date,
    })),
    action_items: meeting.action_items.map((row) => ({
      id: row.id,
      decision_id: row.decision_id,
      objective_id: row.objective_id,
      project_id: row.project_id,
      title: row.title,
      description: row.description,
      owner_user_id: row.owner_user_id,
      due_date: row.due_date,
      status: row.status,
    })),
  };
}

export function ExecutiveMeetingGovernanceCenter({
  meetingData,
  strategy,
  reviewData,
  actionCenter,
  projects,
  collaboratorsByProject,
  currentUser,
  isLoading,
}: {
  meetingData: ExecutiveMeetingGovernanceData | undefined;
  strategy: PortfolioStrategyData | undefined;
  reviewData: StrategyReviewData | undefined;
  actionCenter: PortfolioActionCenterData | undefined;
  projects: Project[];
  collaboratorsByProject: Record<string, ProjectCollaborator[]>;
  currentUser: { id: string; full_name: string; email: string } | null;
  isLoading: boolean;
}) {
  const save = useSaveExecutiveStrategyMeeting();
  const finalize = useFinalizeExecutiveStrategyMeeting();
  const updateAction = useUpdateExecutiveMeetingActionItem();

  const meetings = meetingData?.meetings ?? [];
  const objectives = strategy?.objectives ?? [];
  const people = useMemo(
    () => flattenPeople(collaboratorsByProject, currentUser),
    [collaboratorsByProject, currentUser],
  );
  const personMap = useMemo(
    () => new Map(people.map((person) => [person.user_id, person] as const)),
    [people],
  );
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const objectiveMap = useMemo(
    () => new Map(objectives.map((objective) => [objective.id, objective] as const)),
    [objectives],
  );

  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const completedMeetings = meetings
    .filter((meeting) => meeting.status === "completed")
    .slice()
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
  const latestCompleted = completedMeetings[0] ?? null;
  const carryover = completedMeetings
    .flatMap((meeting) =>
      meeting.action_items
        .filter(
          (action) =>
            action.status === "open" || action.status === "in_progress",
        )
        .map((action) => ({ meeting, action })),
    )
    .sort((a, b) => {
      const aDue = a.action.due_date ?? "9999-12-31";
      const bDue = b.action.due_date ?? "9999-12-31";
      return aDue.localeCompare(bDue);
    });
  const today = todayKey();
  const overdueCarryover = carryover.filter(
    ({ action }) => !!action.due_date && action.due_date < today,
  );
  const dueSoonLimit = addDaysKey(today, 3);
  const dueSoonCarryover = carryover.filter(
    ({ action }) =>
      !!action.due_date &&
      action.due_date >= today &&
      action.due_date <= dueSoonLimit,
  );
  const unownedCarryover = carryover.filter(
    ({ action }) => !action.owner_user_id,
  );
  const finalizedActions = completedMeetings
    .flatMap((meeting) => meeting.action_items)
    .filter((action) => action.status !== "cancelled");
  const completedActions = finalizedActions.filter(
    (action) => action.status === "done",
  );
  const closureRate = finalizedActions.length
    ? Math.round((completedActions.length / finalizedActions.length) * 100)
    : null;
  const accountabilityByOwner = (() => {
    const rows = new Map<
      string,
      {
        key: string;
        name: string;
        total: number;
        open: number;
        overdue: number;
        dueSoon: number;
        done: number;
      }
    >();

    for (const action of finalizedActions) {
      const key = action.owner_user_id ?? "unowned";
      const row = rows.get(key) ?? {
        key,
        name: action.owner_name ?? "بدون مسؤول",
        total: 0,
        open: 0,
        overdue: 0,
        dueSoon: 0,
        done: 0,
      };
      row.total += 1;
      if (action.status === "done") {
        row.done += 1;
      } else if (action.status === "open" || action.status === "in_progress") {
        row.open += 1;
        if (action.due_date && action.due_date < today) {
          row.overdue += 1;
        } else if (
          action.due_date &&
          action.due_date >= today &&
          action.due_date <= dueSoonLimit
        ) {
          row.dueSoon += 1;
        }
      }
      rows.set(key, row);
    }

    return [...rows.values()].sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.open - a.open ||
        a.name.localeCompare(b.name, "ar"),
    );
  })();
  const deferredDecisions = completedMeetings.flatMap((meeting) =>
    meeting.decisions.filter((decision) => decision.outcome === "deferred"),
  );
  const draftMeetings = meetings.filter(
    (meeting) =>
      meeting.status === "draft" || meeting.status === "in_progress",
  );

  function addMemberAttendee(userId: string) {
    if (!draft || !userId) return;
    const person = personMap.get(userId);
    if (!person) return;
    if (draft.attendees.some((row) => row.user_id === userId)) return;

    setDraft({
      ...draft,
      attendees: [
        ...draft.attendees,
        {
          id: crypto.randomUUID(),
          user_id: person.user_id,
          display_name: person.full_name,
          email_snapshot: person.email,
          role_label: person.role_label,
          attendance_status: "invited",
        },
      ],
    });
    setMemberToAdd("");
  }

  function addGuest() {
    if (!draft || !guestName.trim()) return;
    setDraft({
      ...draft,
      attendees: [
        ...draft.attendees,
        {
          id: crypto.randomUUID(),
          user_id: null,
          display_name: guestName.trim(),
          email_snapshot: guestEmail.trim() || null,
          role_label: "Guest",
          attendance_status: "invited",
        },
      ],
    });
    setGuestName("");
    setGuestEmail("");
  }

  function addDecision() {
    if (!draft) return;
    setDraft({
      ...draft,
      decisions: [
        ...draft.decisions,
        {
          id: crypto.randomUUID(),
          source_decision_id: null,
          source_decision_version: null,
          objective_id: null,
          project_id: null,
          title: "",
          outcome: "deferred",
          decision_text: "",
          rationale: "",
          owner_user_id: null,
          follow_up_date: null,
        },
      ],
    });
  }

  function addAction() {
    if (!draft) return;
    setDraft({
      ...draft,
      action_items: [
        ...draft.action_items,
        {
          id: crypto.randomUUID(),
          decision_id: null,
          objective_id: null,
          project_id: null,
          title: "",
          description: "",
          owner_user_id: null,
          due_date: null,
          status: "open",
        },
      ],
    });
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gavel className="h-5 w-5 animate-pulse text-brand" />
          جاري تحميل حوكمة الاجتماعات التنفيذية…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Gavel className="h-5 w-5 text-brand" />
            حوكمة الاجتماعات والقرارات التنفيذية
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            سجل الاجتماع، الحضور، Outcomes، Action Items ومتابعة ما ينتقل للاجتماع التالي.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setDraft(
                freshMeetingDraft(
                  strategy,
                  reviewData,
                  actionCenter,
                  currentUser,
                  false,
                ),
              )
            }
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            اجتماع فارغ
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft(
                freshMeetingDraft(
                  strategy,
                  reviewData,
                  actionCenter,
                  currentUser,
                  true,
                ),
              )
            }
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <ClipboardCheck className="h-4 w-4" />
            إنشاء من Board Pack الحالي
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 text-[10px] leading-5 text-muted-foreground">
        Finalize يقفل محضر الاجتماع نهائيًا. بعده يمكن فقط تحديث حالة Action Items.
        أي Decision Log مرتبط يتم تحديثه عند الاعتماد فقط، ومع Version check يمنع
        اعتماد Outcome فوق قرار تغيّر منذ تجهيز الاجتماع.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          {
            label: "Carryover مفتوح",
            value: carryover.length,
            tone: "text-warning",
            icon: ListChecks,
          },
          {
            label: "Carryover متأخر",
            value: overdueCarryover.length,
            tone: "text-danger",
            icon: CalendarDays,
          },
          {
            label: "Due Soon ≤ 3 أيام",
            value: dueSoonCarryover.length,
            tone: "text-warning",
            icon: CalendarDays,
          },
          {
            label: "بدون مسؤول",
            value: unownedCarryover.length,
            tone: unownedCarryover.length ? "text-danger" : "text-success",
            icon: UsersRound,
          },
          {
            label: "نسبة الإغلاق",
            value: closureRate == null ? "—" : closureRate + "%",
            tone: "text-success",
            icon: CheckCircle2,
          },
          {
            label: "قرارات مؤجلة",
            value: deferredDecisions.length,
            tone: "text-warning",
            icon: Gavel,
          },
          {
            label: "مسودات اجتماعات",
            value: draftMeetings.length,
            tone: "text-info",
            icon: History,
          },
          {
            label: "آخر اجتماع",
            value: latestCompleted ? formatDate(latestCompleted.meeting_date) : "—",
            tone: "text-success",
            icon: CheckCircle2,
          },
        ].map(({ label, value, tone, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
          >
            <div className="flex items-center gap-2">
              <Icon className={"h-4 w-4 " + tone} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={"mt-2 text-xl font-bold " + tone}>
              {typeof value === "number" ? arabicNumber(value) : value}
            </p>
          </div>
        ))}
      </div>

      {!!accountabilityByOwner.length && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold">Executive Action Accountability</h3>
              <p className="text-[9px] text-muted-foreground">
                عرض صريح للمسؤولية والتنفيذ؛ لا توجد درجة مركبة أو Ranking مخفي.
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(180px,1.2fr)_90px_90px_90px_90px_90px] gap-2 bg-muted/30 px-3 py-2 text-[8px] text-muted-foreground md:grid">
              <span>المسؤول</span>
              <span>Total</span>
              <span>Open</span>
              <span>Overdue</span>
              <span>Due Soon</span>
              <span>Done</span>
            </div>
            {accountabilityByOwner.slice(0, 20).map((row) => (
              <div
                key={row.key}
                className="border-t border-border p-3 first:border-t-0 md:grid md:grid-cols-[minmax(180px,1.2fr)_90px_90px_90px_90px_90px] md:items-center md:gap-2"
              >
                <p className="text-xs font-semibold">{row.name}</p>
                <p className="mt-1 text-[10px] md:mt-0">{row.total}</p>
                <p className="mt-1 text-[10px] text-warning md:mt-0">{row.open}</p>
                <p className="mt-1 text-[10px] text-danger md:mt-0">{row.overdue}</p>
                <p className="mt-1 text-[10px] text-warning md:mt-0">{row.dueSoon}</p>
                <p className="mt-1 text-[10px] text-success md:mt-0">{row.done}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!carryover.length && (
        <div className="rounded-2xl border border-warning/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-warning" />
            <div>
              <h3 className="text-sm font-semibold">Carryover إلى الاجتماع التالي</h3>
              <p className="text-[9px] text-muted-foreground">
                Action Items المفتوحة من الاجتماعات النهائية السابقة.
              </p>
            </div>
          </div>

          <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {carryover.slice(0, 20).map(({ meeting, action }) => {
              const overdue = !!action.due_date && action.due_date < today;
              return (
                <div
                  key={action.id}
                  className="flex flex-col gap-2 bg-background p-3 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold">{action.title}</p>
                      {overdue && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[8px] text-danger">
                          متأخر
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      {meeting.title} · {formatDate(meeting.meeting_date)}
                      {action.owner_name ? " · " + action.owner_name : ""}
                      {action.due_date ? " · " + formatDate(action.due_date) : ""}
                    </p>
                  </div>

                  {action.can_update ? (
                    <select
                      value={action.status}
                      disabled={updateAction.isPending}
                      onChange={(event) =>
                        updateAction.mutate({
                          id: action.id,
                          expected_version: action.version,
                          status: event.target.value as ExecutiveMeetingActionStatus,
                        })
                      }
                      className="rounded-lg border border-border bg-card px-2.5 py-2 text-[10px]"
                    >
                      {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-1 text-[9px] text-muted-foreground">
                      {ACTION_LABELS[action.status]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {draft && (
        <div className="rounded-2xl border border-brand/20 bg-card p-4 shadow-[var(--shadow-frost)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {draft.id ? "تحرير مسودة الاجتماع" : "اجتماع تنفيذي جديد"}
              </h3>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {draft.board_pack_generated_at
                  ? "تم تجهيز Agenda من Board Pack الحالي."
                  : "مسودة فارغة."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="md:col-span-2 text-[10px] text-muted-foreground">
              عنوان الاجتماع
              <input
                value={draft.title}
                maxLength={200}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              التاريخ
              <input
                type="date"
                value={draft.meeting_date}
                onChange={(event) =>
                  setDraft({ ...draft, meeting_date: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              الفترة
              <input
                value={draft.period_label}
                maxLength={120}
                placeholder="Q4 2026 / أكتوبر 2026"
                onChange={(event) =>
                  setDraft({ ...draft, period_label: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              رئيس الاجتماع
              <select
                value={draft.chair_user_id}
                onChange={(event) =>
                  setDraft({ ...draft, chair_user_id: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">غير محدد</option>
                {draft.attendees
                  .filter((attendee) => !!attendee.user_id)
                  .map((attendee) => (
                    <option
                      key={attendee.user_id!}
                      value={attendee.user_id!}
                    >
                      {attendee.display_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              حالة المسودة
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status: event.target.value as "draft" | "in_progress",
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="draft">مسودة</option>
                <option value="in_progress">الاجتماع جارٍ</option>
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              الاجتماع التالي
              <input
                type="date"
                value={draft.next_meeting_date}
                onChange={(event) =>
                  setDraft({ ...draft, next_meeting_date: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <label className="md:col-span-2 xl:col-span-4 text-[10px] text-muted-foreground">
              ملخص الاجتماع
              <textarea
                rows={3}
                maxLength={12000}
                value={draft.summary}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-brand" />
              <h4 className="text-xs font-semibold">الحضور</h4>
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_1fr_1fr_auto]">
              <select
                value={memberToAdd}
                onChange={(event) => setMemberToAdd(event.target.value)}
                className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
              >
                <option value="">اختر عضوًا من المشاريع…</option>
                {people
                  .filter(
                    (person) =>
                      !draft.attendees.some(
                        (attendee) => attendee.user_id === person.user_id,
                      ),
                  )
                  .map((person) => (
                    <option key={person.user_id} value={person.user_id}>
                      {person.full_name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!memberToAdd}
                onClick={() => addMemberAttendee(memberToAdd)}
                className="rounded-lg border border-border px-3 py-2 text-[10px] disabled:opacity-40"
              >
                إضافة عضو
              </button>
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="اسم ضيف خارجي"
                className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
              />
              <input
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                placeholder="البريد — اختياري"
                className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
              />
              <button
                type="button"
                disabled={!guestName.trim()}
                onClick={addGuest}
                className="rounded-lg border border-border px-3 py-2 text-[10px] disabled:opacity-40"
              >
                إضافة ضيف
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {draft.attendees.map((attendee, index) => (
                <div
                  key={attendee.id ?? index}
                  className="grid gap-2 rounded-lg border border-border bg-card p-2 md:grid-cols-[1fr_150px_auto]"
                >
                  <div>
                    <p className="text-[10px] font-semibold">
                      {attendee.display_name}
                    </p>
                    <p className="text-[8px] text-muted-foreground">
                      {attendee.email_snapshot ?? "بدون بريد"}
                      {attendee.role_label ? " · " + attendee.role_label : ""}
                    </p>
                  </div>
                  <select
                    value={attendee.attendance_status}
                    onChange={(event) => {
                      const rows = [...draft.attendees];
                      rows[index] = {
                        ...rows[index]!,
                        attendance_status: event.target
                          .value as ExecutiveMeetingAttendanceStatus,
                      };
                      setDraft({ ...draft, attendees: rows });
                    }}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px]"
                  >
                    {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        attendees: draft.attendees.filter(
                          (_, rowIndex) => rowIndex !== index,
                        ),
                        chair_user_id:
                          draft.chair_user_id === attendee.user_id
                            ? ""
                            : draft.chair_user_id,
                      })
                    }
                    className="rounded-lg border border-border px-2 text-[9px] text-muted-foreground"
                  >
                    إزالة
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold">Decision Outcomes</h4>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Decided يغلق القرار المصدر، Deferred يبقيه للاجتماع التالي، Rejected يلغيه.
                </p>
              </div>
              <button
                type="button"
                onClick={addDecision}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px]"
              >
                <Plus className="h-3.5 w-3.5" />
                قرار
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {draft.decisions.map((decision, index) => {
                const sourceLocked = !!decision.source_decision_id;
                const linkedProject = decision.project_id
                  ? projectMap.get(decision.project_id)
                  : null;
                return (
                  <div
                    key={decision.id}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        value={decision.title}
                        maxLength={240}
                        onChange={(event) => {
                          const rows = [...draft.decisions];
                          rows[index] = {
                            ...rows[index]!,
                            title: event.target.value,
                          };
                          setDraft({ ...draft, decisions: rows });
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const decisionId = decision.id;
                          setDraft({
                            ...draft,
                            decisions: draft.decisions.filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                            action_items: draft.action_items.map((action) =>
                              action.decision_id === decisionId
                                ? { ...action, decision_id: null }
                                : action,
                            ),
                          });
                        }}
                        className="rounded-lg border border-border px-2 py-2 text-[9px] text-muted-foreground"
                      >
                        حذف
                      </button>
                    </div>

                    {sourceLocked && (
                      <p className="mt-2 text-[8px] text-info">
                        مرتبط بـDecision Log · Version{" "}
                        {decision.source_decision_version ?? "—"}
                        {linkedProject ? " · " + linkedProject.name : ""}
                      </p>
                    )}

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-[9px] text-muted-foreground">
                        Outcome
                        <select
                          value={decision.outcome}
                          onChange={(event) => {
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              outcome: event.target
                                .value as ExecutiveMeetingDecisionOutcome,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs"
                        >
                          {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-[9px] text-muted-foreground">
                        Objective
                        <select
                          value={decision.objective_id ?? ""}
                          onChange={(event) => {
                            const objectiveId = event.target.value || null;
                            const objective = objectiveId
                              ? objectiveMap.get(objectiveId)
                              : null;
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              objective_id: objectiveId,
                              project_id:
                                sourceLocked
                                  ? decision.project_id
                                  : objective?.project_ids.length === 1
                                    ? objective.project_ids[0]!
                                    : decision.project_id,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs"
                        >
                          <option value="">بدون Objective مباشر</option>
                          {objectives
                            .filter(
                              (objective) =>
                                !sourceLocked ||
                                !decision.project_id ||
                                objective.project_ids.includes(
                                  decision.project_id,
                                ),
                            )
                            .map((objective) => (
                              <option key={objective.id} value={objective.id}>
                                {objective.title}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="text-[9px] text-muted-foreground">
                        Project
                        <select
                          value={decision.project_id ?? ""}
                          disabled={sourceLocked}
                          onChange={(event) => {
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              project_id: event.target.value || null,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs disabled:opacity-60"
                        >
                          <option value="">بدون مشروع مباشر</option>
                          {projects
                            .filter((project) => {
                              if (!decision.objective_id) return true;
                              return objectiveMap
                                .get(decision.objective_id)
                                ?.project_ids.includes(project.id);
                            })
                            .map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="text-[9px] text-muted-foreground">
                        Owner
                        <select
                          value={decision.owner_user_id ?? ""}
                          onChange={(event) => {
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              owner_user_id: event.target.value || null,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs"
                        >
                          <option value="">بدون مسؤول</option>
                          {people.map((person) => (
                            <option key={person.user_id} value={person.user_id}>
                              {person.full_name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="md:col-span-2 xl:col-span-3 text-[9px] text-muted-foreground">
                        نص القرار / Outcome
                        <textarea
                          rows={2}
                          maxLength={8000}
                          value={decision.decision_text ?? ""}
                          onChange={(event) => {
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              decision_text: event.target.value,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                        />
                      </label>

                      <label className="text-[9px] text-muted-foreground">
                        Follow-up date
                        <input
                          type="date"
                          value={decision.follow_up_date ?? ""}
                          onChange={(event) => {
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              follow_up_date: event.target.value || null,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-4 text-[9px] text-muted-foreground">
                        Rationale
                        <textarea
                          rows={2}
                          maxLength={6000}
                          value={decision.rationale ?? ""}
                          onChange={(event) => {
                            const rows = [...draft.decisions];
                            rows[index] = {
                              ...rows[index]!,
                              rationale: event.target.value,
                            };
                            setDraft({ ...draft, decisions: rows });
                          }}
                          className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold">Meeting Action Items</h4>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  تبقى قابلة لتحديث الحالة بعد Finalize وتظهر Carryover حتى الإغلاق.
                </p>
              </div>
              <button
                type="button"
                onClick={addAction}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px]"
              >
                <Plus className="h-3.5 w-3.5" />
                Action Item
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {draft.action_items.map((action, index) => (
                <div
                  key={action.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.4fr_.9fr_.9fr_.8fr_auto]">
                    <input
                      value={action.title}
                      maxLength={240}
                      placeholder="الإجراء المطلوب"
                      onChange={(event) => {
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          title: event.target.value,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                    />

                    <select
                      value={action.owner_user_id ?? ""}
                      onChange={(event) => {
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          owner_user_id: event.target.value || null,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      <option value="">بدون مسؤول</option>
                      {people.map((person) => (
                        <option key={person.user_id} value={person.user_id}>
                          {person.full_name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="date"
                      value={action.due_date ?? ""}
                      onChange={(event) => {
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          due_date: event.target.value || null,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    />

                    <select
                      value={action.decision_id ?? ""}
                      onChange={(event) => {
                        const decisionId = event.target.value || null;
                        const linkedDecision = decisionId
                          ? draft.decisions.find((row) => row.id === decisionId)
                          : null;
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          decision_id: decisionId,
                          objective_id:
                            linkedDecision?.objective_id ?? action.objective_id,
                          project_id:
                            linkedDecision?.project_id ?? action.project_id,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      <option value="">بدون قرار مرتبط</option>
                      {draft.decisions.map((decision) => (
                        <option key={decision.id} value={decision.id}>
                          {decision.title}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          action_items: draft.action_items.filter(
                            (_, rowIndex) => rowIndex !== index,
                          ),
                        })
                      }
                      className="rounded-lg border border-border px-2 text-[9px] text-muted-foreground"
                    >
                      حذف
                    </button>
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    <select
                      value={action.objective_id ?? ""}
                      onChange={(event) => {
                        const objectiveId = event.target.value || null;
                        const objective = objectiveId
                          ? objectiveMap.get(objectiveId)
                          : null;
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          objective_id: objectiveId,
                          project_id:
                            objective?.project_ids.length === 1
                              ? objective.project_ids[0]!
                              : action.project_id,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      <option value="">بدون Objective مباشر</option>
                      {objectives.map((objective) => (
                        <option key={objective.id} value={objective.id}>
                          {objective.title}
                        </option>
                      ))}
                    </select>

                    <select
                      value={action.project_id ?? ""}
                      onChange={(event) => {
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          project_id: event.target.value || null,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      <option value="">بدون مشروع مباشر</option>
                      {projects
                        .filter((project) => {
                          if (!action.objective_id) return true;
                          return objectiveMap
                            .get(action.objective_id)
                            ?.project_ids.includes(project.id);
                        })
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                    </select>

                    <select
                      value={action.status}
                      onChange={(event) => {
                        const rows = [...draft.action_items];
                        rows[index] = {
                          ...rows[index]!,
                          status: event.target.value as ExecutiveMeetingActionStatus,
                        };
                        setDraft({ ...draft, action_items: rows });
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
                    >
                      {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    rows={2}
                    maxLength={6000}
                    value={action.description ?? ""}
                    placeholder="تفاصيل Action Item"
                    onChange={(event) => {
                      const rows = [...draft.action_items];
                      rows[index] = {
                        ...rows[index]!,
                        description: event.target.value,
                      };
                      setDraft({ ...draft, action_items: rows });
                    }}
                    className="mt-2 w-full resize-y rounded-lg border border-border bg-card px-2.5 py-2 text-[10px]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                !draft.title.trim() ||
                !draft.meeting_date ||
                save.isPending
              }
              onClick={() =>
                save.mutate(
                  {
                    id: draft.id,
                    expected_version: draft.expected_version,
                    title: draft.title,
                    meeting_date: draft.meeting_date,
                    period_label: draft.period_label || null,
                    status: draft.status,
                    chair_user_id: draft.chair_user_id || null,
                    summary: draft.summary || null,
                    next_meeting_date: draft.next_meeting_date || null,
                    board_pack_generated_at: draft.board_pack_generated_at,
                    attendees: draft.attendees,
                    decisions: draft.decisions,
                    action_items: draft.action_items,
                  },
                  {
                    onSuccess: (result) => {
                      setDraft({
                        ...draft,
                        id: result.id,
                        expected_version: result.version,
                      });
                    },
                  },
                )
              }
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              حفظ المسودة
            </button>

            {draft.id && draft.expected_version != null && (
              <button
                type="button"
                disabled={
                  draft.meeting_date > today ||
                  finalize.isPending ||
                  save.isPending
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "اعتماد المحضر سيقفل الاجتماع نهائيًا ويطبق Outcomes على القرارات المصدر. متابعة؟",
                    )
                  ) {
                    finalize.mutate(
                      {
                        meetingId: draft.id!,
                        expectedVersion: draft.expected_version!,
                      },
                      { onSuccess: () => setDraft(null) },
                    );
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-xs font-semibold text-success disabled:opacity-50"
              >
                <FileLock2 className="h-4 w-4" />
                اعتماد وإقفال المحضر
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {draftMeetings.length > 0 && (
          <div className="rounded-2xl border border-info/20 bg-card p-4 shadow-[var(--shadow-frost)]">
            <h3 className="text-sm font-semibold">اجتماعات قيد الإعداد</h3>
            <div className="mt-3 space-y-2">
              {draftMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  type="button"
                  disabled={!meeting.can_edit}
                  onClick={() => setDraft(draftFromMeeting(meeting))}
                  className="w-full rounded-xl border border-border bg-background p-3 text-start disabled:opacity-60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold">{meeting.title}</p>
                    <span className="rounded-full bg-info/10 px-2 py-0.5 text-[8px] text-info">
                      {meeting.status === "in_progress" ? "جارٍ" : "مسودة"}
                    </span>
                  </div>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {formatDate(meeting.meeting_date)} ·{" "}
                    {meeting.decisions.length} قرار ·{" "}
                    {meeting.action_items.length} Action Item
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
          <h3 className="text-sm font-semibold">سجل الاجتماعات المعتمدة</h3>
          {!completedMeetings.length ? (
            <div className="mt-3 rounded-xl border border-dashed border-border p-5 text-center text-[10px] text-muted-foreground">
              لا توجد اجتماعات معتمدة بعد.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {completedMeetings.slice(0, 8).map((meeting) => {
                const decided = meeting.decisions.filter(
                  (row) => row.outcome === "decided",
                ).length;
                const deferred = meeting.decisions.filter(
                  (row) => row.outcome === "deferred",
                ).length;
                const openActions = meeting.action_items.filter(
                  (row) =>
                    row.status === "open" || row.status === "in_progress",
                ).length;
                const attended = meeting.attendees.filter(
                  (row) => row.attendance_status === "attended",
                ).length;
                return (
                  <div
                    key={meeting.id}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-xs font-semibold">
                        {meeting.title}
                      </p>
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[8px] text-success">
                        Finalized
                      </span>
                    </div>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      {formatDate(meeting.meeting_date)}
                      {meeting.chair_name ? " · " + meeting.chair_name : ""}
                      {meeting.period_label ? " · " + meeting.period_label : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[8px]">
                      <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        حضور {attended}
                      </span>
                      <span className="rounded-full bg-success/10 px-2 py-1 text-success">
                        Decided {decided}
                      </span>
                      <span className="rounded-full bg-warning/10 px-2 py-1 text-warning">
                        Deferred {deferred}
                      </span>
                      <span className="rounded-full bg-info/10 px-2 py-1 text-info">
                        Actions مفتوحة {openActions}
                      </span>
                    </div>
                    {meeting.summary && (
                      <p className="mt-2 line-clamp-3 text-[9px] leading-4 text-muted-foreground">
                        {meeting.summary}
                      </p>
                    )}
                    {meeting.next_meeting_date && (
                      <p className="mt-2 text-[8px] text-muted-foreground">
                        الاجتماع التالي: {formatDate(meeting.next_meeting_date)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
