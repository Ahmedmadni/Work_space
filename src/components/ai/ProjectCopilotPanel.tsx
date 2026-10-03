import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addReviewedCopilotTask,
  askProjectCopilot,
  buildCopilotProjectContext,
} from "@/services/ai-copilot.service";
import type {
  BoardWithContext,
  CanvasPriority,
  Project,
  ProjectExecutionSummary,
} from "@/types";
import type { ProjectCollaborator } from "@/types/collaboration";
import type { ProjectActionCenterData } from "@/types/action-center";
import type {
  CopilotAction,
  CopilotCreateTaskAction,
  CopilotMode,
  CopilotResult,
} from "@/types/copilot";

const MODE_OPTIONS: Array<{
  value: CopilotMode;
  label: string;
  prompt: string;
}> = [
  {
    value: "brief",
    label: "إحاطة تنفيذية",
    prompt: "أعطني إحاطة تنفيذية عن حالة المشروع الآن.",
  },
  {
    value: "risks",
    label: "حلّل المخاطر",
    prompt: "ما أهم المخاطر الحالية وما الذي يحتاج تدخلًا؟",
  },
  {
    value: "next_steps",
    label: "الخطوات التالية",
    prompt: "ما أفضل خطوات العمل التالية مرتبة بالأولوية؟",
  },
];

const PRIORITY_LABELS: Record<CanvasPriority, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

const INSIGHT_TONE = {
  critical: "border-danger/20 bg-danger/5 text-danger",
  warning: "border-warning/20 bg-warning/5 text-warning",
  info: "border-info/20 bg-info/5 text-info",
} as const;

function CreateTaskCard({
  projectId,
  action,
  boards,
  canEdit,
  onApplied,
}: {
  projectId: string;
  action: CopilotCreateTaskAction;
  boards: BoardWithContext[];
  canEdit: boolean;
  onApplied: () => void;
}) {
  const queryClient = useQueryClient();
  const suggestedBoard = action.board_id ?? boards[0]?.id ?? "";
  const [boardId, setBoardId] = useState(suggestedBoard);
  const [title, setTitle] = useState(action.title);
  const [description, setDescription] = useState(action.description);
  const [priority, setPriority] = useState<CanvasPriority>(action.priority);

  const apply = useMutation({
    mutationFn: () =>
      addReviewedCopilotTask({
        projectId,
        boardId,
        title,
        description,
        priority,
      }),
    onSuccess: () => {
      toast.success("تمت إضافة المهمة إلى اللوحة.");
      void queryClient.invalidateQueries();
      onApplied();
    },
    onError: () => toast.error("تعذر إضافة المهمة إلى اللوحة."),
  });

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-brand" />
        <span className="text-[10px] font-medium text-brand">
          مهمة مقترحة
        </span>
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={!canEdit || apply.isPending}
        className="mt-2 w-full bg-transparent text-sm font-semibold outline-none disabled:opacity-70"
        aria-label="عنوان المهمة المقترحة"
      />

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        disabled={!canEdit || apply.isPending}
        rows={2}
        className="mt-1 w-full resize-y bg-transparent text-xs leading-5 text-muted-foreground outline-none disabled:opacity-70"
        aria-label="وصف المهمة المقترحة"
      />

      <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
        السبب: {action.reason}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
        <select
          value={boardId}
          onChange={(event) => setBoardId(event.target.value)}
          disabled={!canEdit || apply.isPending}
          className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
          aria-label="اللوحة المستهدفة"
        >
          <option value="">اختر لوحة</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(event) =>
            setPriority(event.target.value as CanvasPriority)
          }
          disabled={!canEdit || apply.isPending}
          className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
          aria-label="أولوية المهمة"
        >
          {(Object.keys(PRIORITY_LABELS) as CanvasPriority[]).map(
            (value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ),
          )}
        </select>

        <button
          type="button"
          disabled={
            !canEdit ||
            apply.isPending ||
            !boardId ||
            title.trim().length < 2
          }
          onClick={() => apply.mutate()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {apply.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          إضافة بعد المراجعة
        </button>
      </div>
    </div>
  );
}

function RecommendationCard({ action }: { action: CopilotAction }) {
  if (action.type !== "recommendation") return null;
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-info" />
        <span className="text-[10px] font-medium text-info">توصية</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{action.title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {action.description}
      </p>
      <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
        السبب: {action.reason}
      </p>
    </div>
  );
}

export function ProjectCopilotPanel({
  project,
  execution,
  boards,
  collaborators,
  canEdit,
  actionCenter,
}: {
  project: Project;
  execution: ProjectExecutionSummary;
  boards: BoardWithContext[];
  collaborators: ProjectCollaborator[];
  canEdit: boolean;
  actionCenter: ProjectActionCenterData | null;
}) {
  const context = useMemo(
    () =>
      buildCopilotProjectContext({
        project,
        execution,
        boards,
        collaborators,
        actionCenter,
      }),
    [project, execution, boards, collaborators, actionCenter],
  );

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [appliedIndexes, setAppliedIndexes] = useState<Set<number>>(
    () => new Set(),
  );

  const copilot = useMutation({
    mutationFn: (input: { mode: CopilotMode; question: string }) =>
      askProjectCopilot({
        ...input,
        context,
      }),
    onSuccess: (data) => {
      setResult(data);
      setAppliedIndexes(new Set());
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تشغيل مساعد المشروع.",
      ),
  });

  const runMode = (mode: CopilotMode, prompt: string) => {
    copilot.mutate({
      mode,
      question: mode === "ask" ? question.trim() : prompt,
    });
  };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-brand/20 bg-card shadow-[var(--shadow-frost)]">
      <header className="border-b border-border bg-brand/[0.03] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              مساعد المشروع الذكي
              <Sparkles className="h-4 w-4 text-brand" />
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              يحلل بيانات التنفيذ الحالية ويقترح قرارات وخطوات ومهام. لا يطبق
              أي تغيير على المشروع بدون مراجعتك.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={copilot.isPending}
              onClick={() => runMode(option.value, option.prompt)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium hover:border-brand/40 hover:bg-brand/5 disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <MessageSquareText className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={2500}
              rows={2}
              placeholder="اسأل مثلًا: ما الذي يؤخر المشروع؟ ما المهام التي يجب أن أركز عليها هذا الأسبوع؟"
              className="w-full resize-y rounded-xl border border-border bg-background py-2.5 pe-3 ps-9 text-xs leading-5 outline-none focus:border-brand"
            />
          </div>
          <button
            type="button"
            disabled={copilot.isPending || question.trim().length < 3}
            onClick={() => runMode("ask", question)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 md:self-end"
          >
            {copilot.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {copilot.isPending ? "جارٍ التحليل…" : "اسأل المساعد"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-1">
            {context.metrics.total} عنصر تنفيذي
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            {context.boards.length} لوحة
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            {context.team.length} عضو
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            {context.risks.length} خطر مسجل
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            {context.decisions.length} قرار موثق
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            الحد الأقصى للسياق: 80 عنصرًا مرتبة حسب الأهمية
          </span>
        </div>
      </header>

      {copilot.isPending && !result && (
        <div className="grid min-h-40 place-items-center p-6 text-center">
          <div>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand" />
            <p className="mt-3 text-sm font-medium">يتم تحليل المشروع…</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4 p-4 md:p-5">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-[10px] font-medium text-brand">
              الإجابة
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
              {result.answer}
            </p>
            {result.executive_summary !== result.answer && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground">
                  الملخص التنفيذي
                </p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  {result.executive_summary}
                </p>
              </div>
            )}
          </div>

          {!!result.insights.length && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">مؤشرات وتحليلات</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {result.insights.map((insight, index) => (
                  <div
                    key={insight.title + index}
                    className={`rounded-xl border p-3 ${INSIGHT_TONE[insight.severity]}`}
                  >
                    <div className="flex items-center gap-2">
                      {insight.severity === "critical" ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <p className="text-xs font-semibold">{insight.title}</p>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">
                      {insight.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!result.actions.length && (
            <div>
              <div className="mb-2">
                <h3 className="text-sm font-semibold">إجراءات مقترحة</h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  الاقتراحات لا تُنفذ تلقائيًا. راجع كل عنصر قبل إضافته أو العمل
                  به.
                </p>
              </div>

              <div className="grid gap-2 xl:grid-cols-2">
                {result.actions.map((action, index) => {
                  if (action.type === "create_task") {
                    if (appliedIndexes.has(index)) {
                      return (
                        <div
                          key={action.title + index}
                          className="rounded-xl border border-success/20 bg-success/5 p-3 text-xs text-success"
                        >
                          تم تطبيق هذه المهمة بعد المراجعة.
                        </div>
                      );
                    }
                    return (
                      <CreateTaskCard
                        key={action.title + index}
                        projectId={project.id}
                        action={action}
                        boards={boards.filter((board) => !board.archived_at)}
                        canEdit={canEdit}
                        onApplied={() =>
                          setAppliedIndexes((current) => {
                            const next = new Set(current);
                            next.add(index);
                            return next;
                          })
                        }
                      />
                    );
                  }

                  return (
                    <RecommendationCard
                      key={action.title + index}
                      action={action}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
