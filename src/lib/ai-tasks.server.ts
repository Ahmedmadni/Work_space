import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, streamText } from "ai";
import { normalizeTasks, taskSuggestionsSchema, type SuggestedTask } from "./ai-tasks-data";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway-run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type SuggestedPriority = (typeof PRIORITIES)[number];

export interface SuggestedTask {
  title: string;
  description: string;
  priority: SuggestedPriority;
  reason: string;
}

export type NotesToTasksResult =
  | { ok: true; tasks: SuggestedTask[] }
  | { ok: false; status: number; message: string };

const SYSTEM = `أنت مساعد تخطيط مشاريع. حوّل ملاحظات المستخدم الحرة إلى مهام عملية منظمة.
أعد JSON فقط بهذا الشكل دون أي نص آخر:
{"tasks":[{"title":"...","description":"...","priority":"critical|high|medium|low","reason":"..."}]}
القواعد:
- اكتب بلغة الملاحظات نفسها (العربية افتراضيًا).
- العنوان فعل واضح وقصير (أقل من 80 حرفًا). الوصف جملة أو جملتان.
- الأولوية: critical للعاجل الذي يعيق غيره، high للمهم قريب الموعد، medium للعادي، low للتحسينات.
- reason: سبب الأولوية في جملة قصيرة.
- لا تكرر المهام، ولا تزد عن 20 مهمة، ورتبها حسب الأولوية.`;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseTasks(text: string): SuggestedTask[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const priority = PRIORITIES.includes(r.priority as SuggestedPriority)
        ? (r.priority as SuggestedPriority)
        : "medium";
      return {
        title: clean(r.title, 120),
        description: clean(r.description, 600),
        priority,
        reason: clean(r.reason, 200),
      };
    })
    .filter((t) => t.title)
    .slice(0, 20);
}

export async function notesToTasks(notes: string, projectName: string): Promise<NotesToTasksResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, status: 401, message: "خدمة الذكاء الاصطناعي غير مهيأة." };

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  try {
    let streamError: unknown = null;
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: SYSTEM,
      output: Output.object({ schema: taskSuggestionsSchema }),
      maxRetries: 0,
      prompt: `المشروع: ${projectName}\n\nالملاحظات:\n${notes}`,
      onError: ({ error }) => {
        streamError = error;
      },
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const output = await result.output;
    if (streamError) throw streamError;
    const tasks = normalizeTasks(output.tasks);
    if (!tasks.length) {
      return { ok: false, status: 422, message: "لم يتمكن الذكاء الاصطناعي من استخراج مهام من هذه الملاحظات." };
    }
    return { ok: true, tasks };
  } catch (error) {
    const status = APICallError.isInstance(error) ? (error.statusCode ?? 500) : 500;
    const message =
      status === 402
        ? "نفد رصيد الذكاء الاصطناعي في مساحة العمل. أضف رصيدًا ثم حاول مجددًا."
        : status === 429
          ? "طلبات كثيرة الآن. انتظر قليلًا ثم حاول مجددًا."
          : status === 403
            ? "تم رفض الطلب من خدمة الذكاء الاصطناعي."
            : "تعذر توليد المهام حاليًا. حاول لاحقًا.";
    console.error("[ai-tasks]", status);
    return { ok: false, status, message };
  }
}
