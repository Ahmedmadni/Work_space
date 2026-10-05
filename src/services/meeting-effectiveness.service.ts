import type {
  ExecutiveMeetingGovernanceData,
  ExecutiveStrategyMeeting,
} from "@/types/executive-meetings";
import type {
  ActionFollowThroughRow,
  ExecutiveMeetingEffectivenessData,
  MeetingOutcomeRow,
  RepeatedDeferredDecision,
} from "@/types/meeting-effectiveness";

function dateKey(value: string) {
  return value.slice(0, 10);
}

function daysBetween(start: string, end: string) {
  const a = new Date(dateKey(start) + "T12:00:00Z");
  const b = new Date(dateKey(end) + "T12:00:00Z");
  return Math.max(
    0,
    Math.round((b.getTime() - a.getTime()) / 86_400_000),
  );
}

function median(values: number[]) {
  if (!values.length) return null;
  const rows = [...values].sort((a, b) => a - b);
  const middle = Math.floor(rows.length / 2);
  if (rows.length % 2) return rows[middle]!;
  return Math.round((rows[middle - 1]! + rows[middle]!) / 2);
}

function finalizedMeetings(data: ExecutiveMeetingGovernanceData) {
  return data.meetings
    .filter((meeting) => meeting.status === "completed")
    .slice()
    .sort((a, b) => {
      const byDate = a.meeting_date.localeCompare(b.meeting_date);
      return byDate !== 0
        ? byDate
        : a.created_at.localeCompare(b.created_at);
    });
}

function countLaterMeetings(
  meetings: ExecutiveStrategyMeeting[],
  origin: ExecutiveStrategyMeeting,
) {
  return meetings.filter(
    (meeting) =>
      meeting.id !== origin.id &&
      meeting.meeting_date > origin.meeting_date,
  ).length;
}

function buildActionRows(
  meetings: ExecutiveStrategyMeeting[],
  nowIso: string,
) {
  const today = dateKey(nowIso);
  const rows: ActionFollowThroughRow[] = [];

  for (const meeting of meetings) {
    for (const action of meeting.action_items) {
      if (action.status === "cancelled") continue;

      const completed = action.status === "done" && !!action.completed_at;
      const end = completed ? action.completed_at! : nowIso;
      const completionDays = completed
        ? daysBetween(action.created_at, action.completed_at!)
        : null;
      const overdue =
        !completed &&
        !!action.due_date &&
        action.due_date < today;
      const lateCompleted =
        completed &&
        !!action.due_date &&
        dateKey(action.completed_at!) > action.due_date;

      rows.push({
        action,
        origin_meeting: meeting,
        age_days: daysBetween(action.created_at, end),
        carryover_meetings: countLaterMeetings(meetings, meeting),
        overdue,
        late_completed: lateCompleted,
        completion_days: completionDays,
      });
    }
  }

  return rows;
}

function buildRepeatedDeferrals(
  meetings: ExecutiveStrategyMeeting[],
): RepeatedDeferredDecision[] {
  const bySource = new Map<
    string,
    Array<{
      meeting: ExecutiveStrategyMeeting;
      decision: ExecutiveStrategyMeeting["decisions"][number];
    }>
  >();

  for (const meeting of meetings) {
    for (const decision of meeting.decisions) {
      if (!decision.source_decision_id) continue;
      const rows = bySource.get(decision.source_decision_id) ?? [];
      rows.push({ meeting, decision });
      bySource.set(decision.source_decision_id, rows);
    }
  }

  const result: RepeatedDeferredDecision[] = [];
  for (const [sourceId, appearances] of bySource) {
    const ordered = appearances
      .slice()
      .sort((a, b) => {
        const byMeeting = a.meeting.meeting_date.localeCompare(
          b.meeting.meeting_date,
        );
        return byMeeting !== 0
          ? byMeeting
          : a.decision.created_at.localeCompare(b.decision.created_at);
      });
    const deferrals = ordered.filter(
      (row) => row.decision.outcome === "deferred",
    );
    if (deferrals.length < 2) continue;

    const first = ordered[0]!;
    const latest = ordered.at(-1)!;
    result.push({
      source_decision_id: sourceId,
      title: latest.decision.title,
      project_name: latest.decision.project_name,
      objective_title: latest.decision.objective_title,
      deferral_count: deferrals.length,
      total_appearances: ordered.length,
      first_meeting_date: first.meeting.meeting_date,
      latest_meeting_date: latest.meeting.meeting_date,
      latest_outcome: latest.decision.outcome,
      still_unresolved: latest.decision.outcome === "deferred",
    });
  }

  return result.sort(
    (a, b) =>
      Number(b.still_unresolved) - Number(a.still_unresolved) ||
      b.deferral_count - a.deferral_count ||
      a.first_meeting_date.localeCompare(b.first_meeting_date),
  );
}

function buildMeetingOutcomes(
  meetings: ExecutiveStrategyMeeting[],
  today: string,
): MeetingOutcomeRow[] {
  return meetings
    .map((meeting) => {
      const actions = meeting.action_items.filter(
        (action) => action.status !== "cancelled",
      );
      const done = actions.filter((action) => action.status === "done").length;
      const open = actions.filter(
        (action) =>
          action.status === "open" || action.status === "in_progress",
      ).length;
      const overdue = actions.filter(
        (action) =>
          (action.status === "open" || action.status === "in_progress") &&
          !!action.due_date &&
          action.due_date < today,
      ).length;

      return {
        meeting,
        decisions_total: meeting.decisions.length,
        decisions_decided: meeting.decisions.filter(
          (decision) => decision.outcome === "decided",
        ).length,
        decisions_deferred: meeting.decisions.filter(
          (decision) => decision.outcome === "deferred",
        ).length,
        decisions_rejected: meeting.decisions.filter(
          (decision) => decision.outcome === "rejected",
        ).length,
        actions_total: actions.length,
        actions_done: done,
        actions_open: open,
        actions_overdue: overdue,
        action_completion_rate: actions.length
          ? Math.round((done / actions.length) * 100)
          : null,
      };
    })
    .sort((a, b) => b.meeting.meeting_date.localeCompare(a.meeting.meeting_date));
}

export function buildExecutiveMeetingEffectiveness(
  data: ExecutiveMeetingGovernanceData,
  nowIso = new Date().toISOString(),
): ExecutiveMeetingEffectivenessData {
  const meetings = finalizedMeetings(data);
  const today = dateKey(nowIso);
  const actionRows = buildActionRows(meetings, nowIso);
  const repeatedDeferrals = buildRepeatedDeferrals(meetings);
  const decisions = meetings.flatMap((meeting) => meeting.decisions);
  const resolvedDecisions = decisions.filter(
    (decision) =>
      decision.outcome === "decided" || decision.outcome === "rejected",
  ).length;
  const deferredDecisions = decisions.filter(
    (decision) => decision.outcome === "deferred",
  ).length;
  const openRows = actionRows
    .filter(
      (row) =>
        row.action.status === "open" ||
        row.action.status === "in_progress",
    )
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        b.carryover_meetings - a.carryover_meetings ||
        b.age_days - a.age_days,
    );
  const completedRows = actionRows
    .filter((row) => row.action.status === "done")
    .sort(
      (a, b) =>
        Number(b.late_completed) - Number(a.late_completed) ||
        (b.completion_days ?? 0) - (a.completion_days ?? 0),
    );
  const actions = actionRows.length;
  const done = completedRows.length;

  return {
    generated_at: nowIso,
    summary: {
      finalized_meetings: meetings.length,
      decisions_total: decisions.length,
      decisions_resolved: resolvedDecisions,
      decisions_deferred: deferredDecisions,
      decision_resolution_rate: decisions.length
        ? Math.round((resolvedDecisions / decisions.length) * 100)
        : null,
      repeated_deferred_sources: repeatedDeferrals.length,
      unresolved_repeated_deferrals: repeatedDeferrals.filter(
        (row) => row.still_unresolved,
      ).length,
      actions_total: actions,
      actions_done: done,
      actions_open: openRows.length,
      actions_overdue: openRows.filter((row) => row.overdue).length,
      actions_unowned: openRows.filter(
        (row) => !row.action.owner_user_id,
      ).length,
      action_completion_rate: actions
        ? Math.round((done / actions) * 100)
        : null,
      median_completion_days: median(
        completedRows
          .map((row) => row.completion_days)
          .filter((value): value is number => value != null),
      ),
      late_completed_actions: completedRows.filter(
        (row) => row.late_completed,
      ).length,
      oldest_open_action_days: openRows.length
        ? Math.max(...openRows.map((row) => row.age_days))
        : null,
      max_carryover_meetings: openRows.length
        ? Math.max(...openRows.map((row) => row.carryover_meetings))
        : 0,
    },
    repeated_deferrals: repeatedDeferrals,
    open_follow_through: openRows,
    completed_follow_through: completedRows,
    meeting_outcomes: buildMeetingOutcomes(meetings, today),
  };
}
