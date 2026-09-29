import { generateTasksFromNotes } from "@/lib/ai-tasks.functions";
import { createCanvasNode, getBoardCanvas, saveBoardCanvas } from "@/services/canvas.service";
import type { CanvasPriority } from "@/types";

export interface DraftTask {
  title: string;
  description: string;
  priority: CanvasPriority;
  reason: string;
}

export async function suggestTasksFromNotes(notes: string, projectName: string): Promise<DraftTask[]> {
  const res = await generateTasksFromNotes({ data: { notes, projectName } });
  if (!res.ok) throw new Error(res.message);
  return res.tasks;
}

/** Appends tasks as task nodes in a grid below the board's existing content. */
export async function addTasksToBoard(boardId: string, tasks: DraftTask[]): Promise<number> {
  const snapshot = await getBoardCanvas(boardId);
  const baseY = snapshot.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0) + 80;
  const cols = 4;
  const nodes = tasks.map((t, i) => {
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
  await saveBoardCanvas({ ...snapshot, nodes: [...snapshot.nodes, ...nodes] });
  return nodes.length;
}
