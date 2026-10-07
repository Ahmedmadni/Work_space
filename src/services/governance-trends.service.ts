import type {
  ExecutiveMeetingActionItem,
  ExecutiveMeetingGovernanceData,
  ExecutiveStrategyMeeting,
} from "@/types/executive-meetings";
import type {
  ExecutiveGovernanceTrendsData,
  GovernanceBottleneckRow,
  GovernanceDecisionPattern,
  GovernanceMeetingTrendPoint,
  GovernancePeriodMetric,
  GovernanceTrendDirection,
} from "@/types/governance-trends";

type MetricPreference = "higher" | "lower";

function todayKey(nowIso: string) {
  return nowIso.slice(0, 10);
}

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

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}

function direction(
  current: number | null,
  previous: number | null,
  preference: MetricPreference,
): GovernanceTrendDirection {
  if (current == null || previous == null) return "insufficient_data";
  if (current === previous) return "unchanged";
  const favorable =
    preference === "higher" ? current > previous : current < previous;
  return favorable ? "improved" : "worsened";
}

function metric(
  current: number | null,
  previous: number | null,
  preference: MetricPreference,
): GovernancePeriodMetric {
  return {
    current,
    previous,
    delta:
      current == null || previous == null ? null : current - previous,
    direction: direction(current, previous, preference),
  };
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

function activeActions(meeting: ExecutiveStrategyMeeting) {
  return meeting.action_items.filter(
    (action) => action.status !== "cancelled",
  );
}

function meetingTrendPoint(
  meeting: ExecutiveStrategyMeeting,
  today: string,
): GovernanceMeetingTrendPoint {
  const decisions = meeting.decisions;
  const resolved = decisions.filter(
    (decision) =>
      decision.outcome === "decided" || decision.outcome === "rejected",
  ).length;
  const deferred = decisions.filter(
    (decision) => decision.outcome === "deferred",
  ).length;

  const actions = activeActions(meeting);
  const done = actions.filter((action) => action.status === "done");
  const open = actions.filter(
    (action) =>
      action.status === "open" || action.status === "in_progress",
  );
  const overdueOpen = open.filter(
    (action) => !!action.due_date && action.due_date < today,
  );
  const unownedOpen = open.filter((action) => !action.owner_user_id);
  const completedWithDue = done.filter(
    (action) => !!action.due_date && !!action.completed_at,
  );
  const completedOnTime = completedWithDue.filter(
    (action) => dateKey(action.completed_at!) <= action.due_date!,
  );
  const completionDays = done
    .filter((action) => !!action.completed_at)
    .map((action) => daysBetween(action.created_at, action.completed_at!));

  return {
    meeting_id: meeting.id,
    title: meeting.title,
    meeting_date: meeting.meeting_date,
    decisions_total: decisions.length,
    decision_resolution_rate: rate(resolved, decisions.length),
    deferred_rate: rate(deferred, decisions.length),
    actions_total: actions.length,
    action_completion_rate: rate(done.length, actions.length),
    overdue_open_rate: rate(overdueOpen.length, open.length),
    unowned_open_rate: rate(unownedOpen.length, open.length),
    on_time_completion_rate: rate(
      completedOnTime.length,
      completedWithDue.length,
    ),
    median_completion_days: median(completionDays),
  };
}

function aggregateMeetingMetrics(
  meetings: ExecutiveStrategyMeeting[],
  today: string,
) {
  const decisions = meetings.flatMap((meeting) => meeting.decisions);
  const resolved = decisions.filter(
    (decision) =>
      decision.outcome === "decided" || decision.outcome === "rejected",
  ).length;
  const deferred = decisions.filter(
    (decision) => decision.outcome === "deferred",
  ).length;
  const actions = meetings.flatMap(activeActions);
  const done = actions.filter((action) => action.status === "done");
  const open = actions.filter(
    (action) =>
      action.status === "open" || action.status === "in_progress",
  );
  const overdueOpen = open.filter(
    (action) => !!action.due_date && action.due_date < today,
  );
  const unownedOpen = open.filter((action) => !action.owner_user_id);
  const completedWithDue = done.filter(
    (action) => !!action.due_date && !!action.completed_at,
  );
  const completedOnTime = completedWithDue.filter(
    (action) => dateKey(action.completed_at!) <= action.due_date!,
  );
  const completionDays = done
    .filter((action) => !!action.completed_at)
    .map((action) => daysBetween(action.created_at, action.completed_at!));

  return {
    decision_resolution_rate: rate(resolved, decisions.length),
    deferred_rate: rate(deferred, decisions.length),
    action_completion_rate: rate(done.length, actions.length),
    overdue_open_rate: rate(overdueOpen.length, open.length),
    unowned_open_rate: rate(unownedOpen.length, open.length),
    on_time_completion_rate: rate(
      completedOnTime.length,
      completedWithDue.length,
    ),
    median_completion_days: median(completionDays),
  };
}

function buildDecisionPatterns(
  meetings: ExecutiveStrategyMeeting[],
): GovernanceDecisionPattern[] {
  const groups = new Map<
    string,
    Array<{
      meeting: ExecutiveStrategyMeeting;
      decision: ExecutiveStrategyMeeting["decisions"][number];
    }>
  >();

  for (const meeting of meetings) {
    for (const decision of meeting.decisions) {
      if (!decision.source_decision_id) continue;
      const rows = groups.get(decision.source_decision_id) ?? [];
      rows.push({ meeting, decision });
      groups.set(decision.source_decision_id, rows);
    }
  }

  const patterns: GovernanceDecisionPattern[] = [];
  for (const [sourceId, rows] of groups) {
    const ordered = rows.slice().sort((a, b) => {
      const byMeeting = a.meeting.meeting_date.localeCompare(
        b.meeting.meeting_date,
      );
      return byMeeting !== 0
        ? byMeeting
        : a.decision.created_at.localeCompare(b.decision.created_at);
    });
    const first = ordered[0]!;
    const latest = ordered.at(-1)!;
    patterns.push({
      source_decision_id: sourceId,
      title: latest.decision.title,
      project_id: latest.decision.project_id,
      project_name: latest.decision.project_name,
      objective_id: latest.decision.objective_id,
      objective_title: latest.decision.objective_title,
      appearances: ordered.length,
      deferred_count: ordered.filter(
        (row) => row.decision.outcome === "deferred",
      ).length,
      decided_count: ordered.filter(
        (row) => row.decision.outcome === "decided",
      ).length,
      rejected_count: ordered.filter(
        (row) => row.decision.outcome === "rejected",
      ).length,
      first_meeting_date: first.meeting.meeting_date,
      latest_meeting_date: latest.meeting.meeting_date,
      latest_meeting_id: latest.meeting.id,
      latest_outcome: latest.decision.outcome,
    });
  }

  return patterns.sort(
    (a, b) =>
      Number(b.latest_outcome === "deferred") -
        Number(a.latest_outcome === "deferred") ||
      b.deferred_count - a.deferred_count ||
      b.appearances - a.appearances ||
      a.title.localeCompare(b.title, "ar"),
  );
}

function repeatedOpenSources(
  meetings: ExecutiveStrategyMeeting[],
  allPatterns: GovernanceDecisionPattern[],
) {
  const meetingIds = new Set(meetings.map((meeting) => meeting.id));
  return allPatterns.filter(
    (pattern) =>
      meetingIds.has(pattern.latest_meeting_id) &&
      pattern.deferred_count >= 2 &&
      pattern.latest_outcome === "deferred",
  ).length;
}

interface BottleneckAccumulator {
  key: string;
  label: string;
  project_id: string | null;
  objective_id: string | null;
  meeting_ids: Set<string>;
  decisions_total: number;
  decisions_deferred: number;
  source_ids: Set<string>;
  actions: ExecutiveMeetingActionItem[];
}

function buildBottlenecks(
  meetings: ExecutiveStrategyMeeting[],
  patterns: GovernanceDecisionPattern[],
  today: string,
  mode: "project" | "objective",
): GovernanceBottleneckRow[] {
  const rows = new Map<string, BottleneckAccumulator>();

  function ensure(
    key: string,
    label: string,
    projectId: string | null,
    objectiveId: string | null,
  ) {
    const current = rows.get(key);
    if (current) return current;
    const created: BottleneckAccumulator = {
      key,
      label,
      project_id: projectId,
      objective_id: objectiveId,
      meeting_ids: new Set(),
      decisions_total: 0,
      decisions_deferred: 0,
      source_ids: new Set(),
      actions: [],
    };
    rows.set(key, created);
    return created;
  }

  for (const meeting of meetings) {
    for (const decision of meeting.decisions) {
      const key =
        mode === "project"
          ? decision.project_id
          : decision.objective_id;
      if (!key) continue;
      const label =
        mode === "project"
          ? decision.project_name ?? "مشروع"
          : decision.objective_title ?? "Objective";
      const row = ensure(
        key,
        label,
        mode === "project" ? key : decision.project_id,
        mode === "objective" ? key : decision.objective_id,
      );
      row.meeting_ids.add(meeting.id);
      row.decisions_total += 1;
      if (decision.outcome === "deferred") {
        row.decisions_deferred += 1;
      }
      if (decision.source_decision_id) {
        row.source_ids.add(decision.source_decision_id);
      }
    }

    for (const action of activeActions(meeting)) {
      const key =
        mode === "project" ? action.project_id : action.objective_id;
      if (!key) continue;
      const label =
        mode === "project"
          ? action.project_name ?? "مشروع"
          : action.objective_title ?? "Objective";
      const row = ensure(
        key,
        label,
        mode === "project" ? key : action.project_id,
        mode === "objective" ? key : action.objective_id,
      );
      row.meeting_ids.add(meeting.id);
      row.actions.push(action);
    }
  }

  const patternMap = new Map(
    patterns.map((pattern) => [pattern.source_decision_id, pattern] as const),
  );

  return [...rows.values()]
    .map((row): GovernanceBottleneckRow => {
      const open = row.actions.filter(
        (action) =>
          action.status === "open" || action.status === "in_progress",
      );
      const done = row.actions.filter((action) => action.status === "done");
      const completionDays = done
        .filter((action) => !!action.completed_at)
        .map((action) => daysBetween(action.created_at, action.completed_at!));

      return {
        key: row.key,
        label: row.label,
        project_id: row.project_id,
        objective_id: row.objective_id,
        meetings: row.meeting_ids.size,
        decisions_total: row.decisions_total,
        decisions_deferred: row.decisions_deferred,
        repeated_deferred_sources: [...row.source_ids].filter((sourceId) => {
          const pattern = patternMap.get(sourceId);
          return (
            !!pattern &&
            pattern.deferred_count >= 2 &&
            pattern.latest_outcome === "deferred"
          );
        }).length,
        actions_total: row.actions.length,
        actions_open: open.length,
        actions_overdue: open.filter(
          (action) => !!action.due_date && action.due_date < today,
        ).length,
        actions_unowned: open.filter((action) => !action.owner_user_id).length,
        actions_done: done.length,
        late_completed_actions: done.filter(
          (action) =>
            !!action.due_date &&
            !!action.completed_at &&
            dateKey(action.completed_at) > action.due_date,
        ).length,
        median_completion_days: median(completionDays),
      };
    })
    .sort(
      (a, b) =>
        b.actions_overdue - a.actions_overdue ||
        b.repeated_deferred_sources - a.repeated_deferred_sources ||
        b.actions_open - a.actions_open ||
        b.decisions_deferred - a.decisions_deferred ||
        a.label.localeCompare(b.label, "ar"),
    );
}

function periodLabel(meetings: ExecutiveStrategyMeeting[]) {
  if (!meetings.length) return "لا توجد اجتماعات";
  if (meetings.length === 1) return meetings[0]!.title;
  return (
    meetings[0]!.meeting_date +
    " → " +
    meetings.at(-1)!.meeting_date
  );
}

export function buildExecutiveGovernanceTrends(
  data: ExecutiveMeetingGovernanceData,
  nowIso = new Date().toISOString(),
): ExecutiveGovernanceTrendsData {
  const meetings = finalizedMeetings(data);
  const today = todayKey(nowIso);
  const windowSize = Math.min(3, Math.floor(meetings.length / 2));
  const current =
    windowSize > 0 ? meetings.slice(-windowSize) : [];
  const previous =
    windowSize > 0
      ? meetings.slice(-(windowSize * 2), -windowSize)
      : [];
  const currentMetrics = aggregateMeetingMetrics(current, today);
  const previousMetrics = aggregateMeetingMetrics(previous, today);
  const patterns = buildDecisionPatterns(meetings);

  return {
    generated_at: nowIso,
    period: {
      current_meeting_ids: current.map((meeting) => meeting.id),
      previous_meeting_ids: previous.map((meeting) => meeting.id),
      current_label: periodLabel(current),
      previous_label: periodLabel(previous),
      window_size: windowSize,
    },
    summary: {
      decision_resolution_rate: metric(
        currentMetrics.decision_resolution_rate,
        previousMetrics.decision_resolution_rate,
        "higher",
      ),
      deferred_rate: metric(
        currentMetrics.deferred_rate,
        previousMetrics.deferred_rate,
        "lower",
      ),
      action_completion_rate: metric(
        currentMetrics.action_completion_rate,
        previousMetrics.action_completion_rate,
        "higher",
      ),
      overdue_open_rate: metric(
        currentMetrics.overdue_open_rate,
        previousMetrics.overdue_open_rate,
        "lower",
      ),
      unowned_open_rate: metric(
        currentMetrics.unowned_open_rate,
        previousMetrics.unowned_open_rate,
        "lower",
      ),
      on_time_completion_rate: metric(
        currentMetrics.on_time_completion_rate,
        previousMetrics.on_time_completion_rate,
        "higher",
      ),
      median_completion_days: metric(
        currentMetrics.median_completion_days,
        previousMetrics.median_completion_days,
        "lower",
      ),
      repeated_deferrals_open: metric(
        current.length
          ? repeatedOpenSources(current, patterns)
          : null,
        previous.length
          ? repeatedOpenSources(previous, patterns)
          : null,
        "lower",
      ),
    },
    meeting_trend: meetings
      .slice(-12)
      .map((meeting) => meetingTrendPoint(meeting, today)),
    project_bottlenecks: buildBottlenecks(
      meetings,
      patterns,
      today,
      "project",
    ),
    objective_bottlenecks: buildBottlenecks(
      meetings,
      patterns,
      today,
      "objective",
    ),
    decision_patterns: patterns,
    finalized_meetings: meetings,
  };
}
