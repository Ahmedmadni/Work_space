import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notesToTasks } from "./ai-tasks.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateTasksFromNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        notes: z.string().trim().min(10).max(8000),
        projectId: z.string().min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // The generated schema is empty until the existing application migrations are applied.
    const client: SupabaseClient = context.supabase;
    const { data: allowed, error } = await client.rpc("can_edit_project", { p_project_id: data.projectId });
    if (error || allowed !== true) {
      return { ok: false as const, status: 403, message: "هذه الميزة متاحة للأعضاء الذين يمكنهم تعديل المشروع فقط." };
    }
    return notesToTasks(data.notes, data.projectId);
  });
