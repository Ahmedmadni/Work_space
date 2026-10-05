import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type {
  ProjectDecision,
  ProjectRisk,
} from "@/types/action-center";
import type {
  PortfolioStrategyData,
  RecoveryPlanData,
  StrategyCalendarData,
  StrategyReviewData,
} from "@/types/strategy";
import type {
  ExecutiveDecisionRequired,
  ExecutiveObjectiveAttention,
  ExecutiveObjectiveScorecardRow,
  ExecutiveRiskItem,
  ExecutiveStrategyBoardPack,
} from "@/types/strategy-board-pack";
import { buildObjectiveForecast } from "@/services/strategy-forecast.service";

export interface BuildExecutiveStrategyBoardPackInput {
  strategy: PortfolioStrategyData;
  reviews: StrategyReviewData;
  recovery: RecoveryPlanData;
  calendar: StrategyCalendarData;
  risks: ProjectRisk[];
  decisions: ProjectDecision[];
  projects: Project[];
  boards: BoardWithContext[];
  execution: ProjectExecutionSummary | null;
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function latestReviewFor(
  objectiveId: string,
  reviews: StrategyReviewData["reviews"],
) {
  return reviews
    .filter((row) => row.objective_id === objectiveId)
    .slice()
    .sort((a, b) => {
      const byDate = b.review_date.localeCompare(a.review_date);
      return byDate !== 0
        ? byDate
        : b.created_at.localeCompare(a.created_at);
    })[0] ?? null;
}

function activeRisk(risk: ProjectRisk) {
  return risk.status === "open" || risk.status === "mitigating";
}

function pendingDecision(decision: ProjectDecision) {
  return decision.status === "proposed";
}

function determineAttention(input: {
  forecastStatus: ExecutiveObjectiveScorecardRow["forecast"]["status"];
  criticalHighRisks: number;
  pendingDecisions: number;
  benefitsOverdue: number;
  overdueRecoveryCommitments: number;
  overdueCalendarEvents: number;
}) {
  const reasons: string[] = [];

  if (input.forecastStatus === "overdue") {
    reasons.push("Objective تجاوز موعده.");
  }
  if (input.criticalHighRisks > 0) {
    reasons.push(
      `يوجد ${input.criticalHighRisks} خطر مرتفع/حرج مرتبط بالمشاريع الداعمة.`,
    );
  }
  if (input.overdueRecoveryCommitments > 0) {
    reasons.push(
      `يوجد ${input.overdueRecoveryCommitments} Recovery Commitment متأخر.`,
    );
  }

  if (reasons.length) {
    return {
      attention: "intervention" as ExecutiveObjectiveAttention,
      reasons,
    };
  }

  if (input.forecastStatus === "projected_late") {
    reasons.push("Forecast يتوقع التأخر عن الموعد.");
  }
  if (input.forecastStatus === "stalled") {
    reasons.push("Trend متوقف أو سلبي.");
  }
  if (input.pendingDecisions > 0) {
    reasons.push(`يوجد ${input.pendingDecisions} قرار معلق.`);
  }
  if (input.benefitsOverdue > 0) {
    reasons.push(`يوجد ${input.benefitsOverdue} Benefit متأخرة.`);
  }
  if (input.overdueCalendarEvents > 0) {
    reasons.push(`يوجد ${input.overdueCalendarEvents} موعد استراتيجي متأخر.`);
  }

  if (reasons.length) {
    return {
      attention: "follow_up" as ExecutiveObjectiveAttention,
      reasons,
    };
  }

  if (input.forecastStatus === "insufficient_data") {
    return {
      attention: "insufficient_data" as ExecutiveObjectiveAttention,
      reasons: ["بيانات المراجعات غير كافية لإصدار Forecast زمني."],
    };
  }

  return {
    attention: "stable" as ExecutiveObjectiveAttention,
    reasons: ["لا توجد إشارات تدخل أو متابعة وفق القواعد الحالية."],
  };
}

function buildObjectiveRows(
  input: BuildExecutiveStrategyBoardPackInput,
): ExecutiveObjectiveScorecardRow[] {
  const today = todayKey();

  return input.strategy.objectives
    .map((objective) => {
      const projectIds = new Set(objective.project_ids);
      const forecast = buildObjectiveForecast(objective, input.reviews.reviews);
      const latestReview = latestReviewFor(
        objective.id,
        input.reviews.reviews,
      );
      const benefits = input.reviews.benefits.filter(
        (benefit) => benefit.objective_id === objective.id,
      );
      const activeRisks = input.risks.filter(
        (risk) => projectIds.has(risk.project_id) && activeRisk(risk),
      );
      const decisions = input.decisions.filter(
        (decision) =>
          projectIds.has(decision.project_id) && pendingDecision(decision),
      );
      const recoveryPlans = input.recovery.plans.filter(
        (plan) =>
          plan.objective_id === objective.id && plan.status === "active",
      );
      const overdueRecoveryCommitments = recoveryPlans.flatMap((plan) =>
        plan.commitments.filter(
          (commitment) =>
            (commitment.status === "open" ||
              commitment.status === "in_progress") &&
            !!commitment.due_date &&
            commitment.due_date < today,
        ),
      ).length;
      const objectiveEvents = input.calendar.events
        .filter((event) => event.objective_id === objective.id)
        .slice()
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      const overdueCalendarEvents = objectiveEvents.filter(
        (event) => event.status === "overdue",
      ).length;
      const attention = determineAttention({
        forecastStatus: forecast.status,
        criticalHighRisks: activeRisks.filter(
          (risk) =>
            risk.severity === "critical" || risk.severity === "high",
        ).length,
        pendingDecisions: decisions.length,
        benefitsOverdue: benefits.filter(
          (benefit) =>
            !!benefit.target_date &&
            benefit.target_date < today &&
            (benefit.status === "planned" ||
              benefit.status === "realizing"),
        ).length,
        overdueRecoveryCommitments,
        overdueCalendarEvents,
      });

      return {
        objective,
        forecast,
        attention: attention.attention,
        attention_reasons: attention.reasons,
        latest_review: latestReview,
        benefits_total: benefits.length,
        benefits_realized: benefits.filter(
          (benefit) => benefit.status === "realized",
        ).length,
        benefits_overdue: benefits.filter(
          (benefit) =>
            !!benefit.target_date &&
            benefit.target_date < today &&
            (benefit.status === "planned" ||
              benefit.status === "realizing"),
        ).length,
        active_risks: activeRisks.length,
        critical_high_risks: activeRisks.filter(
          (risk) =>
            risk.severity === "critical" || risk.severity === "high",
        ).length,
        pending_decisions: decisions.length,
        active_recovery_plans: recoveryPlans.length,
        overdue_recovery_commitments: overdueRecoveryCommitments,
        next_event:
          objectiveEvents.find((event) => event.due_date >= today) ??
          objectiveEvents.at(-1) ??
          null,
      };
    })
    .sort((a, b) => {
      const rank: Record<ExecutiveObjectiveAttention, number> = {
        intervention: 0,
        follow_up: 1,
        insufficient_data: 2,
        stable: 3,
      };
      const byAttention = rank[a.attention] - rank[b.attention];
      if (byAttention !== 0) return byAttention;
      const byRisk = b.critical_high_risks - a.critical_high_risks;
      if (byRisk !== 0) return byRisk;
      return a.objective.title.localeCompare(b.objective.title, "ar");
    });
}

function buildDecisionAgenda(
  input: BuildExecutiveStrategyBoardPackInput,
): ExecutiveDecisionRequired[] {
  const projectMap = new Map(
    input.projects.map((project) => [project.id, project] as const),
  );
  const objectiveByProject = new Map<string, Array<{ id: string; title: string }>>();
  for (const objective of input.strategy.objectives) {
    for (const projectId of objective.project_ids) {
      const rows = objectiveByProject.get(projectId) ?? [];
      rows.push({ id: objective.id, title: objective.title });
      objectiveByProject.set(projectId, rows);
    }
  }

  const rows: ExecutiveDecisionRequired[] = input.decisions
    .filter(pendingDecision)
    .map((decision) => {
      const objective = objectiveByProject.get(decision.project_id)?.[0] ?? null;
      return {
        id: "decision:" + decision.id,
        source: "decision_log",
        title: decision.title,
        detail: decision.decision,
        objective_id: objective?.id ?? null,
        objective_title: objective?.title ?? null,
        project_id: decision.project_id,
        project_name: projectMap.get(decision.project_id)?.name ?? null,
        owner_name: decision.owner_name,
        created_at: decision.created_at,
      };
    });

  for (const objective of input.strategy.objectives) {
    const review = latestReviewFor(objective.id, input.reviews.reviews);
    const detail = review?.decisions_needed?.trim();
    if (!review || !detail) continue;

    rows.push({
      id: "review:" + review.id,
      source: "strategy_review",
      title: "قرارات مطلوبة — " + objective.title,
      detail,
      objective_id: objective.id,
      objective_title: objective.title,
      project_id: objective.project_ids[0] ?? null,
      project_name:
        projectMap.get(objective.project_ids[0] ?? "")?.name ?? null,
      owner_name: objective.owner_name,
      created_at: review.created_at,
    });
  }

  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function buildTopRisks(
  input: BuildExecutiveStrategyBoardPackInput,
): ExecutiveRiskItem[] {
  const objectives = input.strategy.objectives;
  const severityRank: Record<ProjectRisk["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return input.risks
    .filter(activeRisk)
    .map((risk) => {
      const linked = objectives.filter((objective) =>
        objective.project_ids.includes(risk.project_id),
      );
      return {
        risk,
        objective_ids: linked.map((objective) => objective.id),
        objective_titles: linked.map((objective) => objective.title),
      };
    })
    .sort((a, b) => {
      const bySeverity =
        severityRank[a.risk.severity] - severityRank[b.risk.severity];
      if (bySeverity !== 0) return bySeverity;
      const aDue = a.risk.due_date ?? "9999-12-31";
      const bDue = b.risk.due_date ?? "9999-12-31";
      return aDue.localeCompare(bDue);
    });
}

export function buildExecutiveStrategyBoardPack(
  input: BuildExecutiveStrategyBoardPackInput,
): ExecutiveStrategyBoardPack {
  const today = todayKey();
  const nextThirty = addDays(today, 30);
  const objectives = buildObjectiveRows(input);
  const activeRecoveryPlans = input.recovery.plans.filter(
    (plan) => plan.status === "active",
  );
  const overdueRecoveryCommitments = activeRecoveryPlans.flatMap((plan) =>
    plan.commitments.filter(
      (commitment) =>
        (commitment.status === "open" ||
          commitment.status === "in_progress") &&
        !!commitment.due_date &&
        commitment.due_date < today,
    ),
  ).length;
  const activeRisks = input.risks.filter(activeRisk);
  const benefits = input.reviews.benefits;
  const upcomingAgenda = input.calendar.events.filter(
    (event) =>
      event.status === "overdue" ||
      event.status === "due_soon" ||
      event.due_date <= nextThirty,
  );

  return {
    generated_at: new Date().toISOString(),
    objectives,
    summary: {
      objectives_total: objectives.length,
      objectives_intervention: objectives.filter(
        (row) => row.attention === "intervention",
      ).length,
      objectives_follow_up: objectives.filter(
        (row) => row.attention === "follow_up",
      ).length,
      objectives_stable: objectives.filter(
        (row) => row.attention === "stable",
      ).length,
      objectives_insufficient_data: objectives.filter(
        (row) => row.attention === "insufficient_data",
      ).length,
      projected_late_or_overdue: objectives.filter(
        (row) =>
          row.forecast.status === "projected_late" ||
          row.forecast.status === "overdue" ||
          row.forecast.status === "stalled",
      ).length,
      benefits_total: benefits.length,
      benefits_realized: benefits.filter(
        (benefit) => benefit.status === "realized",
      ).length,
      benefits_overdue: benefits.filter(
        (benefit) =>
          !!benefit.target_date &&
          benefit.target_date < today &&
          (benefit.status === "planned" ||
            benefit.status === "realizing"),
      ).length,
      active_risks: activeRisks.length,
      critical_high_risks: activeRisks.filter(
        (risk) =>
          risk.severity === "critical" || risk.severity === "high",
      ).length,
      pending_decisions: input.decisions.filter(pendingDecision).length,
      active_recovery_plans: activeRecoveryPlans.length,
      overdue_recovery_commitments: overdueRecoveryCommitments,
      calendar_overdue: input.calendar.events.filter(
        (event) => event.status === "overdue",
      ).length,
      calendar_due_soon: input.calendar.events.filter(
        (event) => event.status === "due_soon",
      ).length,
      execution_total: input.execution?.total ?? 0,
      execution_completed: input.execution?.completed ?? 0,
      execution_overdue: input.execution?.overdue ?? 0,
      execution_blocked: input.execution?.blocked ?? 0,
      execution_average_progress: input.execution?.average_progress ?? 0,
    },
    decisions_required: buildDecisionAgenda(input),
    top_risks: buildTopRisks(input),
    benefits: [...benefits],
    active_recovery_plans: activeRecoveryPlans,
    upcoming_agenda: upcomingAgenda,
    projects: input.projects,
    boards: input.boards,
    execution: input.execution,
    project_decisions: input.decisions,
  };
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const protectedText = /^[=+@-]/.test(raw.trimStart())
    ? "'" + raw
    : raw;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

function csvLine(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export function executiveStrategyBoardPackCsv(
  pack: ExecutiveStrategyBoardPack,
) {
  const lines: string[] = [
    csvLine([
      "Section",
      "Objective",
      "Attention",
      "Progress",
      "Forecast",
      "Projected Completion",
      "Benefits Realized",
      "Benefits Total",
      "Benefits Overdue",
      "Active Risks",
      "Critical/High Risks",
      "Pending Decisions",
      "Active Recovery Plans",
      "Overdue Recovery Commitments",
      "Next Event",
      "Next Event Date",
      "Reasons",
    ]),
  ];

  for (const row of pack.objectives) {
    lines.push(
      csvLine([
        "Objective Scorecard",
        row.objective.title,
        row.attention,
        row.forecast.latest_progress ?? "",
        row.forecast.status,
        row.forecast.projected_completion_date ?? "",
        row.benefits_realized,
        row.benefits_total,
        row.benefits_overdue,
        row.active_risks,
        row.critical_high_risks,
        row.pending_decisions,
        row.active_recovery_plans,
        row.overdue_recovery_commitments,
        row.next_event?.title ?? "",
        row.next_event?.due_date ?? "",
        row.attention_reasons.join(" | "),
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvLine([
      "Section",
      "Title",
      "Source",
      "Objective",
      "Project",
      "Owner",
      "Detail",
      "Created At",
    ]),
  );
  for (const row of pack.decisions_required) {
    lines.push(
      csvLine([
        "Decision Required",
        row.title,
        row.source,
        row.objective_title ?? "",
        row.project_name ?? "",
        row.owner_name ?? "",
        row.detail,
        row.created_at,
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvLine([
      "Section",
      "Risk",
      "Severity",
      "Status",
      "Project",
      "Objectives",
      "Owner",
      "Due Date",
      "Mitigation",
    ]),
  );
  for (const row of pack.top_risks) {
    lines.push(
      csvLine([
        "Strategic Risk",
        row.risk.title,
        row.risk.severity,
        row.risk.status,
        row.risk.project_id,
        row.objective_titles.join(" | "),
        row.risk.owner_name ?? "",
        row.risk.due_date ?? "",
        row.risk.mitigation ?? row.risk.description ?? "",
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvLine([
      "Section",
      "Event",
      "Type",
      "Objective",
      "Due Date",
      "Status",
    ]),
  );
  for (const event of pack.upcoming_agenda) {
    lines.push(
      csvLine([
        "Agenda",
        event.title,
        event.event_type,
        event.objective_title,
        event.due_date,
        event.status,
      ]),
    );
  }

  return "\uFEFF" + lines.join("\r\n");
}

export function downloadExecutiveStrategyBoardPackCsv(
  pack: ExecutiveStrategyBoardPack,
) {
  const blob = new Blob([executiveStrategyBoardPackCsv(pack)], {
    type: "text/csv;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = pack.generated_at.slice(0, 10);
  anchor.href = href;
  anchor.download = `executive-strategy-board-pack-${date}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
