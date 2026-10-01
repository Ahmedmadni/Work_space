import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, streamText } from "ai";

import type {
  CopilotAction,
  CopilotInsight,
  CopilotMode,
  CopilotProjectContext,
  CopilotResult,
} from "@/types/copilot";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const SEVERITIES = ["critical", "warning", "info"] as const;

const SYSTEM = `أنت مساعد إدارة مشاريع داخل ProjectFlow.
حلّل فقط البيانات الموجودة في السياق المرسل، ولا تدّع وجود معلومات غير متاحة.

أعد JSON فقط بالشكل التالي:
{
  "answer":"إجابة مباشرة ومختصرة على طلب المستخدم",
  "executive_summary":"ملخص تنفيذي من فقرة واحدة",
  "insights":[
    {
      "title":"...",
      "detail":"...",
      "severity":"critical|warning|info",
      "node_id":"معرّف عنصر من السياق أو null"
    }
  ],
  "actions":[
    {
      "type":"create_task",
      "title":"...",
      "description":"...",
      "priority":"critical|high|medium|low",
      "reason":"لماذا تقترح هذه المهمة",
      "board_id":"معرّف لوحة موجودة في السياق أو null",
      "source_node_ids":["معرّفات عناصر داعمة"]
    },
    {
      "type":"recommendation",
      "title":"...",
      "description":"...",
      "reason":"...",
      "source_node_ids":[]
    }
  ]
}

قواعد صارمة:
- اكتب باللغة العربية الواضحة ما لم يطلب المستخدم لغة أخرى صراحة.
- لا تنفذ أي تغيير. أنت تقترح فقط، والمستخدم يراجع قبل التطبيق.
- لا تخترع تاريخًا أو مسؤولًا أو نسبة أو Dependency غير موجودة في البيانات.
- لا تغيّر حالة مهمة أو تاريخها عبر actions؛ استخدم recommendation لذلك.
- create_task فقط عندما توجد فجوة عملية واضحة تحتاج مهمة جديدة.
- لا تكرر مهمة قائمة بالفعل بعنوان أو معنى مماثل.
- اربط insight أو action بعناصر موجودة عبر node_id/source_node_ids عندما يكون ذلك مفيدًا.
- board_id يجب أن يكون من اللوحات الموجودة في السياق، وإلا null.
- بحد أقصى 8 insights و8 actions.
- إذا كانت البيانات غير كافية، قل ذلك بوضوح بدل التخمين.
- المخاطر critical فقط عند وجود عائق/تأخير/اعتماد حرج واضح من السياق.`;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseInsights(
  value: unknown,
  nodeIds: Set<string>,
): CopilotInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const row = raw as Record<string, unknown>;
      const severity = SEVERITIES.includes(
        row.severity as (typeof SEVERITIES)[number],
      )
        ? (row.severity as CopilotInsight["severity"])
        : "info";
      const nodeId =
        typeof row.node_id === "string" && nodeIds.has(row.node_id)
          ? row.node_id
          : null;
      const title = clean(row.title, 140);
      const detail = clean(row.detail, 700);
      return title && detail
        ? [{ title, detail, severity, node_id: nodeId }]
        : [];
    })
    .slice(0, 8);
}

function parseActions(
  value: unknown,
  nodeIds: Set<string>,
  boardIds: Set<string>,
): CopilotAction[] {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const row = raw as Record<string, unknown>;
      const type = row.type;
      const title = clean(row.title, 140);
      const description = clean(row.description, 900);
      const reason = clean(row.reason, 400);
      if (!title || !description || !reason) return [];

      const sourceNodeIds = Array.isArray(row.source_node_ids)
        ? row.source_node_ids
            .filter(
              (id): id is string =>
                typeof id === "string" && nodeIds.has(id),
            )
            .slice(0, 10)
        : [];

      if (type === "create_task") {
        const priority = PRIORITIES.includes(
          row.priority as (typeof PRIORITIES)[number],
        )
          ? (row.priority as (typeof PRIORITIES)[number])
          : "medium";
        const boardId =
          typeof row.board_id === "string" && boardIds.has(row.board_id)
            ? row.board_id
            : null;

        return [
          {
            type: "create_task" as const,
            title,
            description,
            priority,
            reason,
            board_id: boardId,
            source_node_ids: sourceNodeIds,
          },
        ];
      }

      if (type === "recommendation") {
        return [
          {
            type: "recommendation" as const,
            title,
            description,
            reason,
            source_node_ids: sourceNodeIds,
          },
        ];
      }

      return [];
    })
    .slice(0, 8);
}

function modeInstruction(mode: CopilotMode) {
  switch (mode) {
    case "brief":
      return "أعطني إحاطة تنفيذية: أين المشروع الآن، ما أهم 3 نقاط يجب معرفتها، وما الذي يحتاج قرارًا.";
    case "risks":
      return "حلّل المخاطر الحالية: التأخير، التعطل، الاعتمادات، غياب المسؤولية، وأي مخاطر تنفيذية واضحة.";
    case "next_steps":
      return "اقترح أفضل خطوات عملية للأيام القادمة مرتبة بالأولوية، مع مهام جديدة فقط إذا توجد فجوة حقيقية.";
    case "ask":
      return "أجب عن سؤال المستخدم بالاعتماد على سياق المشروع فقط.";
  }
}

export async function runProjectCopilot(input: {
  mode: CopilotMode;
  question: string;
  context: CopilotProjectContext;
}): Promise<
  | { ok: true; result: CopilotResult }
  | { ok: false; status: number; message: string }
> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      message: "خدمة الذكاء الاصطناعي غير مهيأة.",
    };
  }

  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

  const nodeIds = new Set(input.context.items.map((item) => item.id));
  const boardIds = new Set(input.context.boards.map((board) => board.id));

  try {
    let streamError: unknown = null;
    const result = streamText({
      model: provider.responses(MODEL),
      system: SYSTEM,
      prompt: [
        `الوضع المطلوب: ${input.mode}`,
        modeInstruction(input.mode),
        input.question.trim()
          ? `سؤال/طلب المستخدم: ${input.question.trim()}`
          : "",
        "سياق المشروع (JSON):",
        JSON.stringify(input.context),
      ]
        .filter(Boolean)
        .join("\n\n"),
      onError: ({ error }) => {
        streamError = error;
      },
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const text = await result.text;
    if (streamError) throw streamError;

    const parsed = parseJson(text);
    if (!parsed) {
      return {
        ok: false,
        status: 422,
        message: "تعذر قراءة استجابة المساعد. حاول مرة أخرى.",
      };
    }

    const answer = clean(parsed.answer, 2400);
    const executiveSummary = clean(parsed.executive_summary, 1600);
    if (!answer && !executiveSummary) {
      return {
        ok: false,
        status: 422,
        message: "لم يُنتج المساعد تحليلًا قابلًا للاستخدام.",
      };
    }

    return {
      ok: true,
      result: {
        answer: answer || executiveSummary,
        executive_summary: executiveSummary || answer,
        insights: parseInsights(parsed.insights, nodeIds),
        actions: parseActions(parsed.actions, nodeIds, boardIds),
      },
    };
  } catch (error) {
    const status = APICallError.isInstance(error)
      ? (error.statusCode ?? 500)
      : 500;
    const message =
      status === 402
        ? "نفد رصيد الذكاء الاصطناعي في مساحة العمل."
        : status === 429
          ? "طلبات كثيرة الآن. حاول بعد قليل."
          : status === 403
            ? "تم رفض الطلب من خدمة الذكاء الاصطناعي."
            : "تعذر تشغيل مساعد المشروع حاليًا.";
    console.error("[ai-project-copilot]", status, error);
    return { ok: false, status, message };
  }
}
