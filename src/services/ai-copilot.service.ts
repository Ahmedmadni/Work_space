import { runProjectCopilotFn } from "@/lib/ai-copilot.functions";
import type {
  BoardWithContext,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type {
  CopilotMode,
  CopilotProjectContext,
  CopilotResult,
} from "@/types/copilot";

export function buildCopilotProjectContext(input: {
  project: Project;
  execution: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
}): CopilotProjectContext {
  const boardNames = new Map(
    input.boards.map((board) => [board.id, board.name] as const),
  );

  const rankedItems = [...input.execution.items].sort((a, b) => {
    const score = (item: typeof a) =>
      (item.node.status === "blocked" ? 100 : 0) +
      (item.is_overdue ? 80 : 0) +
      (item.is_critical ? 60 : 0) +
      (item.waiting_on_dependencies ? 40 : 0) +
      (item.is_upcoming ? 20 : 0) +
      (item.node.status === "in_progress" ? 10 : 0);
    return score(b) - score(a);
  });

  return {
    project: {
      id: input.project.id,
      name: input.project.name,
      description: input.project.description?.slice(0, 2000) ?? "",
      status: input.project.status,
    },
    metrics: {
      total: input.execution.total,
      completed: input.execution.completed,
      in_progress: input.execution.in_progress,
      blocked: input.execution.blocked,
      overdue: input.execution.overdue,
      upcoming: input.execution.upcoming,
      critical: input.execution.critical,
      unassigned: input.execution.unassigned,
      dependency_ready: input.execution.dependency_ready,
      waiting_on_dependencies: input.execution.waiting_on_dependencies,
      average_progress: input.execution.average_progress,
    },
    boards: input.boards.slice(0, 100).map((board) => ({
      id: board.id,
      name: board.name,
    })),
    team: input.collaborators.slice(0, 100).map((member) => ({
      name: member.full_name,
      role: member.role,
    })),
    items: rankedItems.slice(0, 80).map((item) => ({
      id: item.node.id,
      board_id: item.board_id,
      board_name: boardNames.get(item.board_id) ?? item.board_id,
      title: item.node.title.slice(0, 300),
      description: item.node.description?.slice(0, 1200) ?? "",
      kind: item.node.kind,
      status: item.node.status,
      priority: item.node.priority,
      progress: item.node.progress,
      start_date: item.node.start_date,
      due_date: item.node.due_date,
      assignee_name:
        item.node.assignee_name ?? item.node.owner ?? null,
      is_overdue: item.is_overdue,
      is_upcoming: item.is_upcoming,
      is_critical: item.is_critical,
      is_unassigned: item.is_unassigned,
      waiting_on: item.waiting_on.slice(0, 20).map((row) => row.title),
    })),
  };
}

export async function askProjectCopilot(input: {
  mode: CopilotMode;
  question: string;
  context: CopilotProjectContext;
}): Promise<CopilotResult> {
  const response = await runProjectCopilotFn({ data: input });
  if (!response.ok) throw new Error(response.message);
  return response.result;
}
