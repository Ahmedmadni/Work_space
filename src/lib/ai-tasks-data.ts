import { z } from "zod";

export const taskSuggestionsSchema = z.object({
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    priority: z.enum(["critical", "high", "medium", "low"]),
    reason: z.string(),
  }).strict()),
}).strict();

export type SuggestedTask = z.infer<typeof taskSuggestionsSchema>["tasks"][number];

export function normalizeTasks(tasks: SuggestedTask[]): SuggestedTask[] {
  const seen = new Set<string>();
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return tasks.flatMap((task) => {
    const title = task.title.trim().slice(0, 80);
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) return [];
    seen.add(key);
    return [{ ...task, title, description: task.description.trim().slice(0, 600), reason: task.reason.trim().slice(0, 200) }];
  }).sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 20);
}

export function validateTaskDrafts(tasks: SuggestedTask[]): SuggestedTask[] {
  if (!tasks.length || tasks.some((task) => !task.title.trim())) {
    throw new Error("أدخل عنوانًا لكل مهمة قبل الإضافة.");
  }
  return tasks.map((task) => ({ ...task, title: task.title.trim() }));
}