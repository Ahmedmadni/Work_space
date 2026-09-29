import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { notesToTasks } from "./ai-tasks.server";

export const generateTasksFromNotes = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        notes: z.string().trim().min(10).max(8000),
        projectName: z.string().max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => notesToTasks(data.notes, data.projectName));
