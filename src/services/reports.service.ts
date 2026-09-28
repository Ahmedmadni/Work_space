import type {
  BuildProjectExecutiveReportInput,
  ProjectExecutiveReport,
  ProjectHealthLevel,
  ProjectReportBoardRow,
  ProjectReportRisk,
  ProjectReportWorkloadRow,
} from "@/types/reports";

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function buildWorkload(
  input: BuildProjectExecutiveReportInput,
): ProjectReportWorkloadRow[] {
  return input.collaborators
    .map((member) => {
      const assigned = input.execution.items.filter(
        (item) => item.node.assignee_user_id === member.user_id,
      );
      const open = assigned.filter((item) => item.node.status !== "done");

      return {
        user_id: member.user_id,
        name: member.full_name,
        role: member.role,
        assigned: assigned.length,
        open: open.length,
        completed: assigned.filter((item) => item.node.status === "done").length,
        overdue: open.filter((item) => item.is_overdue).length,
        blocked: open.filter((item) => item.node.status === "blocked").length,
        upcoming: open.filter((item) => item.is_upcoming).length,
        average_progress: average(assigned.map((item) => item.node.progress)),
      };
    })
    .sort((a, b) => {
      if (a.open !== b.open) return b.open - a.open;
      if (a.overdue !== b.overdue) return b.overdue - a.overdue;
      return a.name.localeCompare(b.name, "ar");
    });
}

function buildBoardRows(
  input: BuildProjectExecutiveReportInput,
): ProjectReportBoardRow[] {
  return input.boards.map((board) => {
    const items = input.execution.items.filter(
      (item) => item.board_id === board.id,
    );
    const open = items.filter((item) => item.node.status !== "done");

    return {
      board_id: board.id,
      name: board.name,
      total: items.length,
      open: open.length,
      completed: items.filter((item) => item.node.status === "done").length,
      overdue: open.filter((item) => item.is_overdue).length,
      blocked: open.filter((item) => item.node.status === "blocked").length,
      average_progress: average(items.map((item) => item.node.progress)),
    };
  });
}

function buildRisks(
  input: BuildProjectExecutiveReportInput,
): ProjectReportRisk[] {
  const risks: ProjectReportRisk[] = [];

  const criticalBlocked = input.execution.items.filter(
    (item) =>
      item.node.priority === "critical" &&
      item.node.status === "blocked",
  ).length;

  if (criticalBlocked > 0) {
    risks.push({
      id: "critical-blocked",
      severity: "critical",
      title: "مهام حرجة معطلة",
      description:
        "توجد عناصر ذات أولوية حرجة وحالتها معطلة، وتحتاج قرارًا أو إزالة عائق.",
      count: criticalBlocked,
    });
  }

  if ((input.automation?.exhausted_runs ?? 0) > 0) {
    risks.push({
      id: "automation-exhausted",
      severity: "critical",
      title: "فشل أتمتة استنفد المحاولات",
      description:
        "يوجد تشغيل أتمتة فشل بعد استنفاد محاولات الاستعادة التلقائية ويتطلب تدخلًا إداريًا.",
      count: input.automation?.exhausted_runs ?? 0,
    });
  }

  const warningRisks: Array<[string, string, string, number]> = [
    [
      "overdue",
      "مهام متأخرة",
      "عناصر مفتوحة تجاوزت تاريخ الاستحقاق.",
      input.execution.overdue,
    ],
    [
      "blocked",
      "مهام معطلة",
      "عناصر متوقفة وتحتاج إزالة عائق قبل استكمال التنفيذ.",
      input.execution.blocked,
    ],
    [
      "unassigned",
      "مهام بدون مسؤول",
      "عناصر تنفيذية لم يتم إسنادها إلى عضو واضح في الفريق.",
      input.execution.unassigned,
    ],
    [
      "dependencies",
      "مهام تنتظر اعتمادات",
      "عناصر لا يمكن بدء العمل عليها بعد بسبب Dependencies غير مكتملة.",
      input.execution.waiting_on_dependencies,
    ],
  ];

  for (const [id, title, description, count] of warningRisks) {
    if (count > 0) {
      risks.push({
        id,
        severity: "warning",
        title,
        description,
        count,
      });
    }
  }

  if (
    input.automation &&
    input.automation.scheduled_rules > 0 &&
    input.automation.scheduler_mode !== "pg_cron"
  ) {
    risks.push({
      id: "scheduler-fallback",
      severity: "warning",
      title: "القواعد الزمنية تعمل بوضع Fallback",
      description:
        "القواعد الزمنية تعتمد على نشاط التطبيق بدل Scheduler خادمي 24/7.",
      count: input.automation.scheduled_rules,
    });
  }

  if ((input.governance?.automation_failures_7d ?? 0) > 0) {
    risks.push({
      id: "automation-failures",
      severity: "info",
      title: "فشل أتمتة خلال 7 أيام",
      description:
        "تم تسجيل حالات فشل أتمتة في سجل الحوكمة خلال آخر سبعة أيام.",
      count: input.governance?.automation_failures_7d ?? 0,
    });
  }

  return risks;
}

function healthFromRisks(
  risks: ProjectReportRisk[],
): {
  level: ProjectHealthLevel;
  reasons: string[];
} {
  const critical = risks.filter((risk) => risk.severity === "critical");
  if (critical.length) {
    return {
      level: "critical",
      reasons: critical.map((risk) => `${risk.title}: ${risk.count}`),
    };
  }

  const warnings = risks.filter((risk) => risk.severity === "warning");
  if (warnings.length) {
    return {
      level: "attention",
      reasons: warnings.map((risk) => `${risk.title}: ${risk.count}`),
    };
  }

  return {
    level: "healthy",
    reasons: ["لا توجد مؤشرات تشغيلية حرجة أو تحذيرية حالية."],
  };
}

export function buildProjectExecutiveReport(
  input: BuildProjectExecutiveReportInput,
): ProjectExecutiveReport {
  const open = input.execution.total - input.execution.completed;
  const milestones = input.execution.items.filter(
    (item) => item.node.kind === "milestone",
  );
  const milestoneOpen = milestones.filter(
    (item) => item.node.status !== "done",
  );
  const risks = buildRisks(input);

  const roleCounts = input.collaborators.reduce(
    (counts, member) => {
      counts[member.role] += 1;
      return counts;
    },
    { owner: 0, admin: 0, editor: 0, viewer: 0 },
  );

  return {
    generated_at: new Date().toISOString(),
    project: input.project,
    health: healthFromRisks(risks),
    kpis: {
      total: input.execution.total,
      open,
      completed: input.execution.completed,
      completion_rate: percent(
        input.execution.completed,
        input.execution.total,
      ),
      average_progress: input.execution.average_progress,
      in_progress: input.execution.in_progress,
      blocked: input.execution.blocked,
      overdue: input.execution.overdue,
      upcoming: input.execution.upcoming,
      critical: input.execution.critical,
      unassigned: input.execution.unassigned,
      dependency_ready: input.execution.dependency_ready,
      waiting_on_dependencies: input.execution.waiting_on_dependencies,
    },
    milestones: {
      total: milestones.length,
      open: milestoneOpen.length,
      completed: milestones.filter((item) => item.node.status === "done").length,
      overdue: milestoneOpen.filter((item) => item.is_overdue).length,
      upcoming: milestoneOpen.filter((item) => item.is_upcoming).length,
    },
    workload: buildWorkload(input),
    boards: buildBoardRows(input),
    risks,
    automation: input.automation,
    governance: input.governance,
    team: {
      total: input.collaborators.length,
      ...roleCounts,
    },
    execution: input.execution,
    board_catalog: input.boards,
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

export function projectExecutiveReportCsv(report: ProjectExecutiveReport) {
  const boardNames = new Map(
    report.board_catalog.map((board) => [board.id, board.name] as const),
  );

  const lines: string[] = [
    csvLine([
      "Section",
      "Board",
      "Item",
      "Assignee",
      "Status",
      "Priority",
      "Progress",
      "Due Date",
      "Overdue",
      "Blocked",
      "Critical",
      "Waiting Dependencies",
    ]),
  ];

  for (const item of report.execution.items) {
    lines.push(
      csvLine([
        "Task",
        boardNames.get(item.board_id) ?? item.board_id,
        item.node.title,
        item.node.assignee_name ?? item.node.owner ?? "",
        item.node.status,
        item.node.priority ?? "",
        item.node.progress,
        item.node.due_date ?? "",
        item.is_overdue ? "Yes" : "No",
        item.node.status === "blocked" ? "Yes" : "No",
        item.is_critical ? "Yes" : "No",
        item.waiting_on_dependencies ? item.waiting_on.length : 0,
      ]),
    );
  }

  lines.push("");
  lines.push(csvLine(["Section", "Member", "Role", "Assigned", "Open", "Completed", "Overdue", "Blocked", "Upcoming", "Average Progress"]));
  for (const row of report.workload) {
    lines.push(
      csvLine([
        "Workload",
        row.name,
        row.role,
        row.assigned,
        row.open,
        row.completed,
        row.overdue,
        row.blocked,
        row.upcoming,
        row.average_progress,
      ]),
    );
  }

  lines.push("");
  lines.push(csvLine(["Section", "Risk", "Severity", "Count", "Description"]));
  for (const risk of report.risks) {
    lines.push(
      csvLine([
        "Risk",
        risk.title,
        risk.severity,
        risk.count,
        risk.description,
      ]),
    );
  }

  return "\uFEFF" + lines.join("\r\n");
}

export function downloadProjectExecutiveReportCsv(
  report: ProjectExecutiveReport,
) {
  const blob = new Blob([projectExecutiveReportCsv(report)], {
    type: "text/csv;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = report.project.name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 80) || "project";
  anchor.href = href;
  anchor.download = `${safeName}-executive-report.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
