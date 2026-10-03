import { isSupabaseBackend } from "@/lib/backend-config";
import { CURRENT_USER } from "@/services/local-db";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ProjectActionCenterData,
  ProjectActionCenterSummary,
  ProjectDecision,
  ProjectDecisionStatus,
  ProjectRisk,
  ProjectRiskSeverity,
  ProjectRiskStatus,
  SaveProjectDecisionInput,
  SaveProjectRiskInput,
} from "@/types/action-center";
import type {
  PortfolioActionCenterData,
  PortfolioDecision,
  PortfolioRisk,
} from "@/types/portfolio-actions";

const LOCAL_KEY = "projectflow.action-center.v1";

interface LocalActionProject {
  risks: ProjectRisk[];
  decisions: ProjectDecision[];
}
interface LocalActionStore {
  version: 1;
  projects: Record<string, LocalActionProject>;
}

function emptyProject(): LocalActionProject {
  return { risks: [], decisions: [] };
}

function readLocal(): LocalActionStore {
  if (typeof window === "undefined") return { version: 1, projects: {} };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalActionStore>;
    return parsed.projects && typeof parsed.projects === "object"
      ? { version: 1, projects: parsed.projects }
      : { version: 1, projects: {} };
  } catch {
    return { version: 1, projects: {} };
  }
}

function writeLocal(store: LocalActionStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function riskSeverity(value: unknown): ProjectRiskSeverity {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
    ? value
    : "medium";
}

function riskStatus(value: unknown): ProjectRiskStatus {
  return value === "open" ||
    value === "mitigating" ||
    value === "accepted" ||
    value === "closed"
    ? value
    : "open";
}

function decisionStatus(value: unknown): ProjectDecisionStatus {
  return value === "proposed" ||
    value === "decided" ||
    value === "superseded" ||
    value === "cancelled"
    ? value
    : "proposed";
}

function normalizeRisk(value: unknown): ProjectRisk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.title !== "string"
  ) return null;

  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: stringOrNull(row.description),
    severity: riskSeverity(row.severity),
    status: riskStatus(row.status),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    mitigation: stringOrNull(row.mitigation),
    due_date: stringOrNull(row.due_date),
    board_id: stringOrNull(row.board_id),
    board_name: stringOrNull(row.board_name),
    node_id: stringOrNull(row.node_id),
    node_title: stringOrNull(row.node_title),
    version: numberValue(row.version),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizeDecision(value: unknown): ProjectDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.decision !== "string"
  ) return null;

  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    decision: row.decision,
    rationale: stringOrNull(row.rationale),
    status: decisionStatus(row.status),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    decided_at: stringOrNull(row.decided_at),
    board_id: stringOrNull(row.board_id),
    board_name: stringOrNull(row.board_name),
    node_id: stringOrNull(row.node_id),
    node_title: stringOrNull(row.node_title),
    version: numberValue(row.version),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function summaryFrom(
  risks: ProjectRisk[],
  decisions: ProjectDecision[],
): ProjectActionCenterSummary {
  const today = [
    new Date().getFullYear(),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    String(new Date().getDate()).padStart(2, "0"),
  ].join("-");
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    active_risks: risks.filter(
      (risk) => risk.status === "open" || risk.status === "mitigating",
    ).length,
    critical_high_risks: risks.filter(
      (risk) =>
        (risk.status === "open" || risk.status === "mitigating") &&
        (risk.severity === "critical" || risk.severity === "high"),
    ).length,
    overdue_mitigations: risks.filter(
      (risk) =>
        (risk.status === "open" || risk.status === "mitigating") &&
        !!risk.due_date &&
        risk.due_date < today,
    ).length,
    accepted_risks: risks.filter((risk) => risk.status === "accepted").length,
    pending_decisions: decisions.filter(
      (decision) => decision.status === "proposed",
    ).length,
    decided_30d: decisions.filter(
      (decision) =>
        decision.status === "decided" &&
        !!decision.decided_at &&
        new Date(decision.decided_at).getTime() >= cutoff,
    ).length,
  };
}

function normalizeActionCenter(raw: unknown): ProjectActionCenterData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      risks: [],
      decisions: [],
      summary: summaryFrom([], []),
    };
  }
  const row = raw as Record<string, unknown>;
  const risks = Array.isArray(row.risks)
    ? row.risks.map(normalizeRisk).filter((item): item is ProjectRisk => !!item)
    : [];
  const decisions = Array.isArray(row.decisions)
    ? row.decisions
        .map(normalizeDecision)
        .filter((item): item is ProjectDecision => !!item)
    : [];

  const summary =
    row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
      ? (row.summary as Record<string, unknown>)
      : {};

  return {
    risks,
    decisions,
    summary: {
      active_risks: numberValue(summary.active_risks, summaryFrom(risks, decisions).active_risks),
      critical_high_risks: numberValue(
        summary.critical_high_risks,
        summaryFrom(risks, decisions).critical_high_risks,
      ),
      overdue_mitigations: numberValue(
        summary.overdue_mitigations,
        summaryFrom(risks, decisions).overdue_mitigations,
      ),
      accepted_risks: numberValue(
        summary.accepted_risks,
        summaryFrom(risks, decisions).accepted_risks,
      ),
      pending_decisions: numberValue(
        summary.pending_decisions,
        summaryFrom(risks, decisions).pending_decisions,
      ),
      decided_30d: numberValue(
        summary.decided_30d,
        summaryFrom(risks, decisions).decided_30d,
      ),
    },
  };
}

export async function listProjectActionCenter(
  projectId: string,
): Promise<ProjectActionCenterData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>("rpc/list_project_action_center", {
      method: "POST",
      body: { p_project_id: projectId },
    });
    return normalizeActionCenter(raw);
  }

  const project = readLocal().projects[projectId] ?? emptyProject();
  return {
    risks: [...project.risks],
    decisions: [...project.decisions],
    summary: summaryFrom(project.risks, project.decisions),
  };
}

export async function saveProjectRisk(
  projectId: string,
  input: SaveProjectRiskInput,
): Promise<ProjectRisk> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>("rpc/save_project_risk", {
      method: "POST",
      body: {
        p_project_id: projectId,
        p_risk_id: input.id ?? null,
        p_expected_version: input.expected_version ?? null,
        p_title: input.title,
        p_description: input.description ?? null,
        p_severity: input.severity,
        p_status: input.status,
        p_owner_user_id: input.owner_user_id ?? null,
        p_mitigation: input.mitigation ?? null,
        p_due_date: input.due_date ?? null,
        p_board_id: input.board_id ?? null,
        p_node_id: input.node_id ?? null,
      },
    });
    const risk = normalizeRisk(raw);
    if (!risk) throw new Error("عاد الخادم بسجل مخاطر غير صالح.");
    return risk;
  }

  const store = readLocal();
  const project = store.projects[projectId] ?? emptyProject();
  const now = new Date().toISOString();
  const existing = input.id
    ? project.risks.find((risk) => risk.id === input.id)
    : null;

  if (input.id && !existing) throw new Error("سجل الخطر غير موجود.");
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل سجل الخطر. حدّث البيانات وأعد المحاولة.");
  }

  const risk: ProjectRisk = {
    id: existing?.id ?? crypto.randomUUID(),
    project_id: projectId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    severity: input.severity,
    status: input.status,
    owner_user_id: input.owner_user_id ?? null,
    owner_name:
      input.owner_user_id === CURRENT_USER.id
        ? CURRENT_USER.full_name
        : input.owner_name ?? null,
    mitigation: input.mitigation?.trim() || null,
    due_date: input.due_date ?? null,
    board_id: input.board_id ?? null,
    board_name: existing?.board_name ?? null,
    node_id: input.node_id ?? null,
    node_title: existing?.node_title ?? null,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  project.risks = existing
    ? project.risks.map((row) => (row.id === risk.id ? risk : row))
    : [risk, ...project.risks];
  store.projects[projectId] = project;
  writeLocal(store);
  return risk;
}

export async function saveProjectDecision(
  projectId: string,
  input: SaveProjectDecisionInput,
): Promise<ProjectDecision> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>("rpc/save_project_decision", {
      method: "POST",
      body: {
        p_project_id: projectId,
        p_decision_id: input.id ?? null,
        p_expected_version: input.expected_version ?? null,
        p_title: input.title,
        p_decision: input.decision,
        p_rationale: input.rationale ?? null,
        p_status: input.status,
        p_owner_user_id: input.owner_user_id ?? null,
        p_board_id: input.board_id ?? null,
        p_node_id: input.node_id ?? null,
      },
    });
    const decision = normalizeDecision(raw);
    if (!decision) throw new Error("عاد الخادم بسجل قرار غير صالح.");
    return decision;
  }

  const store = readLocal();
  const project = store.projects[projectId] ?? emptyProject();
  const now = new Date().toISOString();
  const existing = input.id
    ? project.decisions.find((decision) => decision.id === input.id)
    : null;

  if (input.id && !existing) throw new Error("سجل القرار غير موجود.");
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل سجل القرار. حدّث البيانات وأعد المحاولة.");
  }

  const decision: ProjectDecision = {
    id: existing?.id ?? crypto.randomUUID(),
    project_id: projectId,
    title: input.title.trim(),
    decision: input.decision.trim(),
    rationale: input.rationale?.trim() || null,
    status: input.status,
    owner_user_id: input.owner_user_id ?? null,
    owner_name:
      input.owner_user_id === CURRENT_USER.id
        ? CURRENT_USER.full_name
        : input.owner_name ?? null,
    decided_at:
      input.status === "decided"
        ? existing?.status === "decided"
          ? existing.decided_at ?? now
          : now
        : input.status === "proposed"
          ? null
          : existing?.decided_at ?? null,
    board_id: input.board_id ?? null,
    board_name: existing?.board_name ?? null,
    node_id: input.node_id ?? null,
    node_title: existing?.node_title ?? null,
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  project.decisions = existing
    ? project.decisions.map((row) =>
        row.id === decision.id ? decision : row,
      )
    : [decision, ...project.decisions];
  store.projects[projectId] = project;
  writeLocal(store);
  return decision;
}


function normalizePortfolioRisk(value: unknown): PortfolioRisk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const risk = normalizeRisk(value);
  if (!risk || typeof row.project_name !== "string") return null;
  return { ...risk, project_name: row.project_name };
}

function normalizePortfolioDecision(value: unknown): PortfolioDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const decision = normalizeDecision(value);
  if (!decision || typeof row.project_name !== "string") return null;
  return { ...decision, project_name: row.project_name };
}

export async function listPortfolioActionCenter(
  projectIds: string[],
): Promise<PortfolioActionCenterData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_portfolio_action_center",
      {
        method: "POST",
        body: {},
      },
    );
    return {
      risks: Array.isArray(raw.risks)
        ? raw.risks
            .map(normalizePortfolioRisk)
            .filter((item): item is PortfolioRisk => !!item)
        : [],
      decisions: Array.isArray(raw.decisions)
        ? raw.decisions
            .map(normalizePortfolioDecision)
            .filter((item): item is PortfolioDecision => !!item)
        : [],
    };
  }

  const entries = await Promise.all(
    projectIds.map(async (projectId) => [
      projectId,
      await listProjectActionCenter(projectId),
    ] as const),
  );

  const names = new Map<string, string>();
  // Local mode has no canonical project names in this store. Callers may map
  // project_id to the project catalog for display; keep a stable fallback.
  for (const [projectId] of entries) names.set(projectId, "المشروع");

  return {
    risks: entries.flatMap(([projectId, data]) =>
      data.risks.map((risk) => ({
        ...risk,
        project_name: names.get(projectId) ?? "المشروع",
      })),
    ),
    decisions: entries.flatMap(([projectId, data]) =>
      data.decisions.map((decision) => ({
        ...decision,
        project_name: names.get(projectId) ?? "المشروع",
      })),
    ),
  };
}

export async function refreshRiskEscalationNotifications(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  const count = await supabaseRest<unknown>(
    "rpc/refresh_risk_escalation_notifications",
    {
      method: "POST",
      body: {},
    },
  );
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}
