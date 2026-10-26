import { generateTasksFromNotes } from "@/lib/ai-tasks.functions";
import { saveCollaborativeBoardCanvas } from "@/services/canvas-collaboration.service";
import { createCanvasNode, getBoardCanvas } from "@/services/canvas.service";
import type { CanvasPriority } from "@/types";
import { validateTaskDrafts } from "@/lib/ai-tasks-data";

export interface DraftTask {
  title: string;
  description: string;
  priority: CanvasPriority;
  reason: string;
}

export async function suggestTasksFromNotes(notes: string, projectId: string): Promise<DraftTask[]> {
  const res = await generateTasksFromNotes({ data: { notes, projectId } });
  if (!res.ok) throw new Error(res.message);
  return res.tasks;
}

/** Appends tasks as task nodes in a grid below the board's existing content. */
export async function addTasksToBoard(boardId: string, tasks: DraftTask[]): Promise<number> {
  if (!boardId) throw new Error("اختر لوحة لإضافة المهام.");
  const validTasks = validateTaskDrafts(tasks);
  const snapshot = await getBoardCanvas(boardId);
  const baseY = snapshot.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0) + 80;
  const cols = 4;
  const nodes = validTasks.map((t, i) => {
    const node = createCanvasNode(
      boardId,
      { x: (i % cols) * 260, y: baseY + Math.floor(i / cols) * 180 },
      "task",
    );
    return {
      ...node,
      title: t.title,
      description: t.description || null,
      priority: t.priority,
      tags: ["ذكاء اصطناعي"],
    };
  });
  const result = await saveCollaborativeBoardCanvas(
    { ...snapshot, nodes: [...snapshot.nodes, ...nodes] },
    snapshot,
  );
  if (result.conflicts.length) {
    throw new Error("حدث تعارض أثناء إضافة المهام. حدّث اللوحة وحاول مجددًا.");
  }
  return result.applied_count;
}
