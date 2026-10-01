import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { runProjectCopilot } from "@/lib/ai-copilot.server";

const statusSchema = z.enum([
  "idea",
  "planned",
  "in_progress",
  "done",
  "blocked",
]);
const prioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

const contextSchema = z.object({
  project: z.object({
    id: z.string().max(200),
    name: z.string().max(200),
    description: z.string().max(2000),
    status: z.string().max(50),
  }),
  metrics: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    unassigned: z.number().int().nonnegative(),
    dependency_ready: z.number().int().nonnegative(),
    waiting_on_dependencies: z.number().int().nonnegative(),
    average_progress: z.number().min(0).max(100),
  }),
  boards: z
    .array(z.object({ id: z.string().max(200), name: z.string().max(200) }))
    .max(100),
  team: z
    .array(z.object({ name: z.string().max(200), role: z.string().max(50) }))
    .max(100),
  items: z
    .array(
      z.object({
        id: z.string().max(200),
        board_id: z.string().max(200),
        board_name: z.string().max(200),
        title: z.string().max(300),
        description: z.string().max(1200),
        kind: z.string().max(50),
        status: statusSchema,
        priority: prioritySchema.nullable(),
        progress: z.number().min(0).max(100),
        start_date: z.string().max(20).nullable(),
        due_date: z.string().max(20).nullable(),
        assignee_name: z.string().max(200).nullable(),
        is_overdue: z.boolean(),
        is_upcoming: z.boolean(),
        is_critical: z.boolean(),
        is_unassigned: z.boolean(),
        waiting_on: z.array(z.string().max(300)).max(20),
      }),
    )
    .max(80),
});

export const runProjectCopilotFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        mode: z.enum(["brief", "risks", "next_steps", "ask"]),
        question: z.string().trim().max(2500),
        context: contextSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => runProjectCopilot(data));
