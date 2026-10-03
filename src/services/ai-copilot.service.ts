import { isSupabaseBackend } from "@/lib/backend-config";
import { runProjectCopilotFn } from "@/lib/ai-copilot.functions";
import { saveCollaborativeBoardCanvas } from "@/services/canvas-collaboration.service";
import { createCanvasNode, getBoardCanvas } from "@/services/canvas.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  BoardWithContext,
  CanvasPriority,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type { ProjectActionCenterData } from "@/types/action-center";
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
  actionCenter: ProjectActionCenterData | null;
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
    risks: (input.actionCenter?.risks ?? []).slice(0, 40).map((risk) => ({
      id: risk.id,
      title: risk.title.slice(0, 200),
      description: risk.description?.slice(0, 1200) ?? "",
      severity: risk.severity,
      status: risk.status,
      owner_name: risk.owner_name,
      mitigation: risk.mitigation?.slice(0, 1200) ?? "",
      due_date: risk.due_date,
      node_id: risk.node_id,
    })),
    decisions: (input.actionCenter?.decisions ?? []).slice(0, 40).map((decision) => ({
      id: decision.id,
      title: decision.title.slice(0, 200),
      decision: decision.decision.slice(0, 1600),
      rationale: decision.rationale?.slice(0, 1200) ?? "",
      status: decision.status,
      owner_name: decision.owner_name,
      decided_at: decision.decided_at,
      node_id: decision.node_id,
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

export async function addReviewedCopilotTask(input: {
  projectId: string;
  boardId: string;
  title: string;
  description: string;
  priority: CanvasPriority;
}): Promise<string> {
  const snapshot = await getBoardCanvas(input.boardId);
  const baseY =
    snapshot.nodes.reduce(
      (max, node) => Math.max(max, node.y + node.height),
      0,
    ) + 80;
  const node = createCanvasNode(
    input.boardId,
    { x: 0, y: baseY },
    "task",
  );
  node.title = input.title.trim().slice(0, 300);
  node.description = input.description.trim().slice(0, 1200) || null;
  node.priority = input.priority;
  node.tags = ["ذكاء اصطناعي", "مراجَع"];

  const result = await saveCollaborativeBoardCanvas(
    {
      ...snapshot,
      nodes: [...snapshot.nodes, node],
    },
    snapshot,
  );

  if (result.conflicts.length || result.applied_count < 1) {
    throw new Error(
      "حدث تعارض أثناء إضافة المهمة. حدّث اللوحة وحاول مجددًا.",
    );
  }

  if (isSupabaseBackend()) {
    void supabaseRest<null>("rpc/record_ai_copilot_task_accepted", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_board_id: input.boardId,
        p_node_id: node.id,
      },
    }).catch((error) => {
      if (import.meta.env.DEV) {
        console.warn(
          "[ai-copilot] تعذر تسجيل قبول المهمة في Audit.",
          error,
        );
      }
    });
  }

  return node.id;
}
