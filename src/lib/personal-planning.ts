import type { CanvasNode, CanvasNodeStatus } from "@/types";

export function localPlanningDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isTaskOverdue(node: Pick<CanvasNode, "kind" | "status" | "due_date">, today: string): boolean {
  return node.kind === "task" && node.status !== "done" && !!node.due_date && node.due_date < today;
}

export function planningStatusPatch(node: Pick<CanvasNode, "progress">, status: CanvasNodeStatus) {
  return { status, progress: status === "done" ? 100 : node.progress === 100 ? 0 : node.progress };
}