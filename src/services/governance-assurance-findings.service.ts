import { isSupabaseBackend } from "@/lib/backend-config";
import {
  listGovernanceAssuranceArchives,
} from "@/services/governance-assurance.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  GovernanceAssuranceArchive,
  GovernanceAssuranceSignatoryCandidate,
} from "@/types/governance-assurance";
import type {
  ActOnGovernanceAssuranceFindingActionInput,
  ActOnGovernanceAssuranceFindingVerificationInput,
  AddGovernanceAssuranceFindingEvidenceInput,
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingAction,
  GovernanceAssuranceFindingActionRow,
  GovernanceAssuranceFindingActionStatus,
  GovernanceAssuranceFindingData,
  GovernanceAssuranceFindingEvidence,
  GovernanceAssuranceFindingEvidenceType,
  GovernanceAssuranceArchiveRemediationSummary,
  GovernanceAssuranceFindingResponsibleCandidate,
  GovernanceAssuranceFindingRow,
  GovernanceAssuranceFindingRootCauseCategory,
  GovernanceAssuranceFindingSeverity,
  GovernanceAssuranceFindingSourceCandidate,
  GovernanceAssuranceFindingSourceType,
  GovernanceAssuranceFindingStatus,
  GovernanceAssuranceFindingSummary,
  GovernanceAssuranceFindingTaxonomyCategory,
  GovernanceAssuranceFindingVerificationStatus,
  GovernanceAssuranceRecurrenceGroup,
  GovernanceAssuranceRecurrenceOccurrence,
  GovernanceAssuranceRemediationAnalytics,
  GovernanceAssuranceRemediationAgingBucket,
  GovernanceAssuranceSeverityEffectivenessSummary,
  RequestGovernanceAssuranceFindingVerificationInput,
  SaveGovernanceAssuranceFindingActionInput,
  SaveGovernanceAssuranceFindingInput,
} from "@/types/governance-assurance-findings";

const LOCAL_KEY = "projectflow.executive-governance-assurance-findings.v1";

interface LocalStore {
  version: 1;
  findings: GovernanceAssuranceFinding[];
  evidence: GovernanceAssuranceFindingEvidence[];
  actions: GovernanceAssuranceFindingAction[];
}

function intOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Math.trunc(Number(value));
  }
  return null;
}

function sourceType(
  value: unknown,
): GovernanceAssuranceFindingSourceType | null {
  return value === "manual" ||
    value === "signoff_reservation" ||
    value === "recipient_acknowledgement"
    ? value
    : null;
}

function severity(
  value: unknown,
): GovernanceAssuranceFindingSeverity | null {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
    ? value
    : null;
}

function status(
  value: unknown,
): GovernanceAssuranceFindingStatus | null {
  return value === "open" ||
    value === "in_progress" ||
    value === "resolved" ||
    value === "accepted"
    ? value
    : null;
}

function taxonomyCategory(
  value: unknown,
): GovernanceAssuranceFindingTaxonomyCategory | null {
  return value === "control_design" ||
    value === "control_execution" ||
    value === "process" ||
    value === "data_quality" ||
    value === "access_security" ||
    value === "compliance" ||
    value === "documentation" ||
    value === "third_party" ||
    value === "governance" ||
    value === "other"
    ? value
    : null;
}

function rootCauseCategory(
  value: unknown,
): GovernanceAssuranceFindingRootCauseCategory | null {
  return value === "people" ||
    value === "process" ||
    value === "system" ||
    value === "data" ||
    value === "governance" ||
    value === "third_party" ||
    value === "external" ||
    value === "unknown" ||
    value === "other"
    ? value
    : null;
}

function verificationStatus(
  value: unknown,
): GovernanceAssuranceFindingVerificationStatus | null {
  return value === "not_requested" ||
    value === "pending" ||
    value === "effective" ||
    value === "partially_effective" ||
    value === "ineffective"
    ? value
    : null;
}

function evidenceType(
  value: unknown,
): GovernanceAssuranceFindingEvidenceType | null {
  return value === "note" || value === "link" || value === "reference"
    ? value
    : null;
}

function normalizeEvidence(
  value: unknown,
): GovernanceAssuranceFindingEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const type = evidenceType(row.evidence_type);
  if (
    typeof row.id !== "string" ||
    typeof row.finding_id !== "string" ||
    typeof row.archive_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.detail !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    !type
  ) {
    return null;
  }
  return {
    id: row.id,
    finding_id: row.finding_id,
    archive_id: row.archive_id,
    owner_user_id: row.owner_user_id,
    evidence_type: type,
    title: row.title,
    detail: row.detail,
    reference_url:
      typeof row.reference_url === "string" ? row.reference_url : null,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

function actionStatus(
  value: unknown,
): GovernanceAssuranceFindingActionStatus | null {
  return value === "planned" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "cancelled"
    ? value
    : null;
}

function normalizeFindingAction(
  value: unknown,
): GovernanceAssuranceFindingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const findingActionStatus = actionStatus(row.status);
  const version = intOrNull(row.version);
  if (
    typeof row.id !== "string" ||
    typeof row.finding_id !== "string" ||
    typeof row.archive_id !== "string" ||
    typeof row.finding_owner_user_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.description !== "string" ||
    typeof row.action_owner_user_id !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !findingActionStatus ||
    version == null
  ) {
    return null;
  }
  return {
    id: row.id,
    finding_id: row.finding_id,
    archive_id: row.archive_id,
    finding_owner_user_id: row.finding_owner_user_id,
    title: row.title,
    description: row.description,
    action_owner_user_id: row.action_owner_user_id,
    action_owner_name_snapshot:
      typeof row.action_owner_name_snapshot === "string"
        ? row.action_owner_name_snapshot
        : null,
    action_owner_email_snapshot:
      typeof row.action_owner_email_snapshot === "string"
        ? row.action_owner_email_snapshot
        : null,
    status: findingActionStatus,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
    reminder_date:
      typeof row.reminder_date === "string" ? row.reminder_date : null,
    closure_note:
      typeof row.closure_note === "string" ? row.closure_note : null,
    version,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
    cancelled_at:
      typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeFinding(value: unknown): GovernanceAssuranceFinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const findingSource = sourceType(row.source_type);
  const findingSeverity = severity(row.severity);
  const findingStatus = status(row.status);
  const findingVerificationStatus =
    verificationStatus(row.verification_status) ?? "not_requested";
  const version = intOrNull(row.version);

  if (
    typeof row.id !== "string" ||
    typeof row.archive_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.description !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !findingSource ||
    !findingSeverity ||
    !findingStatus ||
    version == null
  ) {
    return null;
  }

  return {
    id: row.id,
    archive_id: row.archive_id,
    owner_user_id: row.owner_user_id,
    source_type: findingSource,
    source_ref_id:
      typeof row.source_ref_id === "string" ? row.source_ref_id : null,
    title: row.title,
    description: row.description,
    severity: findingSeverity,
    status: findingStatus,
    responsible_user_id:
      typeof row.responsible_user_id === "string"
        ? row.responsible_user_id
        : null,
    responsible_name_snapshot:
      typeof row.responsible_name_snapshot === "string"
        ? row.responsible_name_snapshot
        : null,
    responsible_email_snapshot:
      typeof row.responsible_email_snapshot === "string"
        ? row.responsible_email_snapshot
        : null,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
    reminder_date:
      typeof row.reminder_date === "string" ? row.reminder_date : null,
    corrective_action:
      typeof row.corrective_action === "string"
        ? row.corrective_action
        : null,
    resolution_note:
      typeof row.resolution_note === "string"
        ? row.resolution_note
        : null,
    taxonomy_category: taxonomyCategory(row.taxonomy_category),
    root_cause_category: rootCauseCategory(row.root_cause_category),
    root_cause_note:
      typeof row.root_cause_note === "string" ? row.root_cause_note : null,
    control_reference:
      typeof row.control_reference === "string"
        ? row.control_reference
        : null,
    recurrence_key:
      typeof row.recurrence_key === "string" ? row.recurrence_key : null,
    verification_status: findingVerificationStatus,
    verifier_user_id:
      typeof row.verifier_user_id === "string" ? row.verifier_user_id : null,
    verifier_name_snapshot:
      typeof row.verifier_name_snapshot === "string"
        ? row.verifier_name_snapshot
        : null,
    verifier_email_snapshot:
      typeof row.verifier_email_snapshot === "string"
        ? row.verifier_email_snapshot
        : null,
    verification_requested_at:
      typeof row.verification_requested_at === "string"
        ? row.verification_requested_at
        : null,
    verified_at: typeof row.verified_at === "string" ? row.verified_at : null,
    effectiveness_note:
      typeof row.effectiveness_note === "string"
        ? row.effectiveness_note
        : null,
    version,
    resolved_at:
      typeof row.resolved_at === "string" ? row.resolved_at : null,
    accepted_at:
      typeof row.accepted_at === "string" ? row.accepted_at : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function emptySummary(): GovernanceAssuranceFindingSummary {
  return {
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    accepted: 0,
    critical_active: 0,
    high_active: 0,
    overdue_active: 0,
    unassigned_active: 0,
    assigned_to_me_active: 0,
    verification_pending: 0,
    ineffective_active: 0,
    open_actions: 0,
    overdue_actions: 0,
    actions_assigned_to_me: 0,
  };
}

function normalizeSummary(value: unknown): GovernanceAssuranceFindingSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptySummary();
  }
  const row = value as Record<string, unknown>;
  const read = (key: keyof GovernanceAssuranceFindingSummary) =>
    intOrNull(row[key]) ?? 0;
  return {
    total: read("total"),
    open: read("open"),
    in_progress: read("in_progress"),
    resolved: read("resolved"),
    accepted: read("accepted"),
    critical_active: read("critical_active"),
    high_active: read("high_active"),
    overdue_active: read("overdue_active"),
    unassigned_active: read("unassigned_active"),
    assigned_to_me_active: read("assigned_to_me_active"),
    verification_pending: read("verification_pending"),
    ineffective_active: read("ineffective_active"),
    open_actions: read("open_actions"),
    overdue_actions: read("overdue_actions"),
    actions_assigned_to_me: read("actions_assigned_to_me"),
  };
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") {
    return { version: 1, findings: [], evidence: [], actions: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalStore>;
    return {
      version: 1,
      findings: Array.isArray(parsed.findings)
        ? parsed.findings
            .map(normalizeFinding)
            .filter(
              (item): item is GovernanceAssuranceFinding => !!item,
            )
        : [],
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence
            .map(normalizeEvidence)
            .filter(
              (item): item is GovernanceAssuranceFindingEvidence => !!item,
            )
        : [],
      actions: Array.isArray(parsed.actions)
        ? parsed.actions
            .map(normalizeFindingAction)
            .filter(
              (item): item is GovernanceAssuranceFindingAction => !!item,
            )
        : [],
    };
  } catch {
    return { version: 1, findings: [], evidence: [], actions: [] };
  }
}

function writeLocal(store: LocalStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildSummary(
  findings: GovernanceAssuranceFinding[],
): GovernanceAssuranceFindingSummary {
  const today = todayKey();
  const active = findings.filter(
    (row) => row.status === "open" || row.status === "in_progress",
  );
  return {
    total: findings.length,
    open: findings.filter((row) => row.status === "open").length,
    in_progress: findings.filter((row) => row.status === "in_progress")
      .length,
    resolved: findings.filter((row) => row.status === "resolved").length,
    accepted: findings.filter((row) => row.status === "accepted").length,
    critical_active: active.filter((row) => row.severity === "critical")
      .length,
    high_active: active.filter((row) => row.severity === "high").length,
    overdue_active: active.filter(
      (row) => !!row.due_date && row.due_date < today,
    ).length,
    unassigned_active: active.filter((row) => !row.responsible_user_id)
      .length,
    assigned_to_me_active: active.filter(
      (row) => row.responsible_user_id === "local-user",
    ).length,
    verification_pending: findings.filter(
      (row) => row.verification_status === "pending",
    ).length,
    ineffective_active: active.filter(
      (row) =>
        row.verification_status === "partially_effective" ||
        row.verification_status === "ineffective",
    ).length,
    open_actions: 0,
    overdue_actions: 0,
    actions_assigned_to_me: 0,
  };
}

function validateInput(input: SaveGovernanceAssuranceFindingInput) {
  if (!input.archive_id) {
    throw new Error("Archive Certificate مطلوبة.");
  }
  if (!input.title.trim() || input.title.trim().length > 240) {
    throw new Error("Finding Title مطلوبة وبحد أقصى 240 حرفًا.");
  }
  if (!input.description.trim() || input.description.trim().length > 12000) {
    throw new Error("Finding Description مطلوبة وبحد أقصى 12000 حرف.");
  }
  if ((input.corrective_action?.length ?? 0) > 12000) {
    throw new Error("Corrective Action طويلة جدًا.");
  }
  if ((input.resolution_note?.length ?? 0) > 12000) {
    throw new Error("Resolution Note طويلة جدًا.");
  }
  if (
    input.reminder_date &&
    (!input.due_date || input.reminder_date > input.due_date)
  ) {
    throw new Error("Reminder Date تتطلب Due Date ولا يمكن أن تكون بعدها.");
  }
  if ((input.root_cause_note?.length ?? 0) > 12000) {
    throw new Error("Root Cause Note طويلة جدًا.");
  }
  if ((input.control_reference?.length ?? 0) > 240) {
    throw new Error("Control Reference طويلة جدًا.");
  }
  if ((input.recurrence_key?.trim().length ?? 0) > 160) {
    throw new Error("Recurrence Key طويلة جدًا.");
  }
  if (
    input.recurrence_key?.trim() &&
    (!input.taxonomy_category || !input.root_cause_category)
  ) {
    throw new Error(
      "Recurrence Key تتطلب Finding Category وRoot Cause Category.",
    );
  }
  if (
    (input.status === "resolved" || input.status === "accepted") &&
    !input.resolution_note?.trim()
  ) {
    throw new Error("Resolution Note مطلوبة للحالة المختارة.");
  }
  if (
    input.source_type === "manual" &&
    input.source_ref_id != null
  ) {
    throw new Error("Manual Finding لا تستخدم Source Reference.");
  }
  if (
    input.source_type !== "manual" &&
    !input.source_ref_id
  ) {
    throw new Error("Source Reference مطلوبة.");
  }
}

export function buildGovernanceAssuranceFindingSourceCandidates(
  archive: GovernanceAssuranceArchive,
): GovernanceAssuranceFindingSourceCandidate[] {
  const rows: GovernanceAssuranceFindingSourceCandidate[] = [];

  for (const attestation of archive.snapshot.signoff.attestations) {
    if (
      attestation.status === "attested_with_reservation" &&
      attestation.reservation?.trim()
    ) {
      rows.push({
        type: "signoff_reservation",
        ref_id: attestation.id,
        label:
          "Reservation · " +
          (attestation.role === "prepared_by"
            ? "Prepared By"
            : attestation.role === "reviewed_by"
              ? "Reviewed By"
              : "Approved By"),
        detail: attestation.reservation.trim(),
      });
    }
  }

  for (const recipient of archive.snapshot.distribution.recipients) {
    if (
      recipient.status === "acknowledged_with_note" &&
      recipient.acknowledgement_note?.trim()
    ) {
      rows.push({
        type: "recipient_acknowledgement",
        ref_id: recipient.id,
        label: "Acknowledgement · " + recipient.recipient_name_snapshot,
        detail: recipient.acknowledgement_note.trim(),
      });
    }
  }

  return rows;
}

export function buildGovernanceAssuranceFindingResponsibleCandidates(
  archive: GovernanceAssuranceArchive,
): GovernanceAssuranceFindingResponsibleCandidate[] {
  const map = new Map<string, GovernanceAssuranceSignatoryCandidate>();

  const add = (
    userId: string,
    displayName: string,
    email: string | null,
    source: GovernanceAssuranceSignatoryCandidate["source"],
  ) => {
    if (!userId) return;
    const existing = map.get(userId);
    if (!existing) {
      map.set(userId, {
        user_id: userId,
        display_name: displayName.trim() || userId,
        email,
        source,
      });
    } else {
      map.set(userId, {
        ...existing,
        display_name:
          existing.display_name === existing.user_id &&
          displayName.trim() &&
          displayName.trim() !== userId
            ? displayName.trim()
            : existing.display_name,
        email: existing.email ?? email,
      });
    }
  };

  add(
    archive.owner_user_id,
    "Archive Owner",
    null,
    "creator",
  );

  for (const attestation of archive.snapshot.signoff.attestations) {
    add(
      attestation.assignee_user_id,
      attestation.assignee_name_snapshot,
      attestation.assignee_email_snapshot,
      "attendee",
    );
  }

  for (const recipient of archive.snapshot.distribution.recipients) {
    add(
      recipient.recipient_user_id,
      recipient.recipient_name_snapshot,
      recipient.recipient_email_snapshot,
      "attendee",
    );
  }

  return [...map.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ar"),
  );
}

export async function listGovernanceAssuranceFindings(): Promise<GovernanceAssuranceFindingData> {
  const archiveDataPromise = listGovernanceAssuranceArchives();

  if (isSupabaseBackend()) {
    const [raw, archives] = await Promise.all([
      supabaseRest<Record<string, unknown>>(
        "rpc/list_executive_governance_assurance_findings",
        { method: "POST", body: {} },
      ),
      archiveDataPromise,
    ]);
    const archiveMap = new Map(
      archives.archives.map((archive) => [archive.id, archive] as const),
    );

    const findings: GovernanceAssuranceFindingRow[] = Array.isArray(
      raw.findings,
    )
      ? raw.findings.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return [];
          }
          const row = item as Record<string, unknown>;
          const finding = normalizeFinding(row.finding);
          if (!finding) return [];
          const archive = archiveMap.get(finding.archive_id);
          if (!archive) return [];
          return [
            {
              finding,
              archive,
              can_manage: row.can_manage === true,
              is_responsible: row.is_responsible === true,
              can_verify: row.can_verify === true,
              evidence: Array.isArray(row.evidence)
                ? row.evidence
                    .map(normalizeEvidence)
                    .filter(
                      (item): item is GovernanceAssuranceFindingEvidence =>
                        !!item,
                    )
                : [],
              actions: Array.isArray(row.actions)
                ? row.actions.flatMap((value) => {
                    if (
                      !value ||
                      typeof value !== "object" ||
                      Array.isArray(value)
                    ) {
                      return [];
                    }
                    const actionRow = value as Record<string, unknown>;
                    const action = normalizeFindingAction(actionRow.action);
                    if (!action) return [];
                    return [{
                      action,
                      can_manage: actionRow.can_manage === true,
                      is_action_owner: actionRow.is_action_owner === true,
                    }];
                  })
                : [],
            },
          ];
        })
      : [];

    return {
      findings,
      manageable_archive_ids: Array.isArray(raw.manageable_archive_ids)
        ? raw.manageable_archive_ids.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      summary: normalizeSummary(raw.summary),
    };
  }

  const archives = await archiveDataPromise;
  const archiveMap = new Map(
    archives.archives.map((archive) => [archive.id, archive] as const),
  );
  const localStore = readLocal();
  const findings = localStore.findings
    .filter((finding) => archiveMap.has(finding.archive_id))
    .map((finding) => ({
      finding,
      archive: archiveMap.get(finding.archive_id)!,
      can_manage: true,
      is_responsible: finding.responsible_user_id === "local-user",
      can_verify:
        finding.verifier_user_id === "local-user" &&
        finding.verification_status === "pending" &&
        finding.status === "resolved",
      evidence: localStore.evidence.filter(
        (row) => row.finding_id === finding.id,
      ),
      actions: localStore.actions
        .filter((row) => row.finding_id === finding.id)
        .map((action) => ({
          action,
          can_manage: true,
          is_action_owner: action.action_owner_user_id === "local-user",
        })),
    }));

  const summary = buildSummary(findings.map((row) => row.finding));
  const today = todayKey();
  const actions = findings.flatMap((row) => row.actions.map((item) => item.action));
  summary.open_actions = actions.filter(
    (row) => row.status === "planned" || row.status === "in_progress",
  ).length;
  summary.overdue_actions = actions.filter(
    (row) =>
      (row.status === "planned" || row.status === "in_progress") &&
      !!row.due_date &&
      row.due_date < today,
  ).length;
  summary.actions_assigned_to_me = actions.filter(
    (row) =>
      (row.status === "planned" || row.status === "in_progress") &&
      row.action_owner_user_id === "local-user",
  ).length;

  return {
    findings,
    manageable_archive_ids: archives.archives.map((archive) => archive.id),
    summary,
  };
}

export async function saveGovernanceAssuranceFinding(
  input: SaveGovernanceAssuranceFindingInput,
): Promise<GovernanceAssuranceFinding> {
  validateInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_executive_governance_assurance_finding",
      {
        method: "POST",
        body: {
          p_finding_id: input.id ?? null,
          p_expected_version: input.expected_version ?? null,
          p_archive_id: input.archive_id,
          p_source_type: input.source_type,
          p_source_ref_id: input.source_ref_id ?? null,
          p_title: input.title,
          p_description: input.description,
          p_severity: input.severity,
          p_status: input.status,
          p_responsible_user_id: input.responsible_user_id ?? null,
          p_due_date: input.due_date ?? null,
          p_reminder_date: input.reminder_date ?? null,
          p_corrective_action: input.corrective_action ?? null,
          p_resolution_note: input.resolution_note ?? null,
          p_taxonomy_category: input.taxonomy_category ?? null,
          p_root_cause_category: input.root_cause_category ?? null,
          p_root_cause_note: input.root_cause_note ?? null,
          p_control_reference: input.control_reference ?? null,
          p_recurrence_key: input.recurrence_key ?? null,
        },
      },
    );
    const finding = normalizeFinding(raw);
    if (!finding) {
      throw new Error("عاد الخادم بـAssurance Finding غير صالح.");
    }
    return finding;
  }

  const archives = await listGovernanceAssuranceArchives();
  const archive = archives.archives.find(
    (row) => row.id === input.archive_id,
  );
  if (!archive) throw new Error("Archive Certificate غير موجودة.");

  const sourceCandidates =
    buildGovernanceAssuranceFindingSourceCandidates(archive);
  if (input.source_type !== "manual") {
    const source = sourceCandidates.find(
      (row) =>
        row.type === input.source_type &&
        row.ref_id === input.source_ref_id,
    );
    if (!source) {
      throw new Error("Finding Source غير موجود داخل Archive snapshot.");
    }
  }

  const responsibleCandidates =
    buildGovernanceAssuranceFindingResponsibleCandidates(archive);
  const responsible = input.responsible_user_id
    ? responsibleCandidates.find(
        (row) => row.user_id === input.responsible_user_id,
      )
    : null;
  if (input.responsible_user_id && !responsible) {
    throw new Error("Responsible user ليس ضمن دورة الـArchive.");
  }

  const store = readLocal();
  const existing = input.id
    ? store.findings.find((row) => row.id === input.id)
    : null;

  if (input.id && !existing) {
    throw new Error("Assurance Finding غير موجود.");
  }
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل Finding. حدّث البيانات وأعد المحاولة.");
  }
  if (!existing && input.expected_version != null) {
    throw new Error("تم تعديل Finding. حدّث البيانات وأعد المحاولة.");
  }
  if (existing && existing.archive_id !== archive.id) {
    throw new Error("Archive الخاصة بالـFinding لا يمكن تغييرها.");
  }
  if (existing?.verification_status === "pending") {
    throw new Error(
      "Finding مقفلة أثناء Effectiveness Review حتى يسجل Verifier النتيجة.",
    );
  }

  if (!existing && input.status === "resolved") {
    throw new Error("أضف Closure Evidence قبل تحويل Finding إلى Resolved.");
  }
  if (
    existing &&
    input.status === "resolved" &&
    existing.status !== "resolved" &&
    !store.evidence.some((row) => row.finding_id === existing.id)
  ) {
    throw new Error("أضف Closure Evidence قبل تحويل Finding إلى Resolved.");
  }
  if (
    existing &&
    input.status === "resolved" &&
    store.actions.some(
      (row) =>
        row.finding_id === existing.id &&
        (row.status === "planned" || row.status === "in_progress"),
    )
  ) {
    throw new Error(
      "لا يمكن تحويل Finding إلى Resolved مع وجود Corrective Actions مفتوحة.",
    );
  }

  const now = new Date().toISOString();
  const reopeningVerifiedFinding =
    !!existing &&
    existing.status === "resolved" &&
    input.status !== "resolved" &&
    existing.verification_status !== "pending";
  const resolvingNewCycle =
    !!existing &&
    input.status === "resolved" &&
    existing.status !== "resolved";

  const finding: GovernanceAssuranceFinding = {
    id: existing?.id ?? crypto.randomUUID(),
    archive_id: archive.id,
    owner_user_id: archive.owner_user_id,
    source_type: input.source_type,
    source_ref_id:
      input.source_type === "manual"
        ? null
        : input.source_ref_id ?? null,
    title: input.title.trim(),
    description: input.description.trim(),
    severity: input.severity,
    status: input.status,
    responsible_user_id: responsible?.user_id ?? null,
    responsible_name_snapshot: responsible?.display_name ?? null,
    responsible_email_snapshot: responsible?.email ?? null,
    due_date: input.due_date || null,
    reminder_date: input.reminder_date || null,
    corrective_action: input.corrective_action?.trim() || null,
    resolution_note: input.resolution_note?.trim() || null,
    taxonomy_category: input.taxonomy_category ?? null,
    root_cause_category: input.root_cause_category ?? null,
    root_cause_note: input.root_cause_note?.trim() || null,
    control_reference: input.control_reference?.trim() || null,
    recurrence_key: input.recurrence_key?.trim().toLowerCase() || null,
    verification_status:
      resolvingNewCycle || reopeningVerifiedFinding
        ? "not_requested"
        : existing?.verification_status ?? "not_requested",
    verifier_user_id:
      resolvingNewCycle || reopeningVerifiedFinding
        ? null
        : existing?.verifier_user_id ?? null,
    verifier_name_snapshot:
      resolvingNewCycle || reopeningVerifiedFinding
        ? null
        : existing?.verifier_name_snapshot ?? null,
    verifier_email_snapshot:
      resolvingNewCycle || reopeningVerifiedFinding
        ? null
        : existing?.verifier_email_snapshot ?? null,
    verification_requested_at:
      resolvingNewCycle || reopeningVerifiedFinding
        ? null
        : existing?.verification_requested_at ?? null,
    verified_at:
      resolvingNewCycle || reopeningVerifiedFinding
        ? null
        : existing?.verified_at ?? null,
    effectiveness_note:
      resolvingNewCycle || reopeningVerifiedFinding
        ? null
        : existing?.effectiveness_note ?? null,
    version: existing ? existing.version + 1 : 1,
    resolved_at:
      input.status === "resolved"
        ? existing?.resolved_at ?? now
        : null,
    accepted_at:
      input.status === "accepted"
        ? existing?.accepted_at ?? now
        : null,
    created_by: existing?.created_by ?? archive.owner_user_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  store.findings = [
    finding,
    ...store.findings.filter((row) => row.id !== finding.id),
  ];
  writeLocal(store);
  return finding;
}


function validateActionInput(
  input: SaveGovernanceAssuranceFindingActionInput,
) {
  if (!input.finding_id) throw new Error("Finding مطلوبة.");
  if (!input.title.trim() || input.title.trim().length > 240) {
    throw new Error("Action Title مطلوبة وبحد أقصى 240 حرفًا.");
  }
  if ((input.description?.length ?? 0) > 12000) {
    throw new Error("Action Description طويلة جدًا.");
  }
  if (!input.action_owner_user_id) {
    throw new Error("Action Owner مطلوبة.");
  }
  if ((input.closure_note?.length ?? 0) > 12000) {
    throw new Error("Closure Note طويلة جدًا.");
  }
  if (
    (input.status === "completed" || input.status === "cancelled") &&
    !input.closure_note?.trim()
  ) {
    throw new Error("Closure Note مطلوبة لإغلاق Action.");
  }
  if (
    input.reminder_date &&
    (!input.due_date || input.reminder_date > input.due_date)
  ) {
    throw new Error("Action Reminder تتطلب Due Date ولا يمكن أن تكون بعدها.");
  }
}

export async function saveGovernanceAssuranceFindingAction(
  input: SaveGovernanceAssuranceFindingActionInput,
): Promise<GovernanceAssuranceFindingAction> {
  validateActionInput(input);

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_executive_governance_assurance_finding_action",
      {
        method: "POST",
        body: {
          p_action_id: input.id ?? null,
          p_expected_version: input.expected_version ?? null,
          p_finding_id: input.finding_id,
          p_title: input.title,
          p_description: input.description ?? "",
          p_action_owner_user_id: input.action_owner_user_id,
          p_status: input.status,
          p_due_date: input.due_date ?? null,
          p_reminder_date: input.reminder_date ?? null,
          p_closure_note: input.closure_note ?? null,
        },
      },
    );
    const action = normalizeFindingAction(raw);
    if (!action) throw new Error("عاد الخادم بـCorrective Action غير صالح.");
    return action;
  }

  const store = readLocal();
  const finding = store.findings.find((row) => row.id === input.finding_id);
  if (
    !finding ||
    (finding.status !== "open" && finding.status !== "in_progress") ||
    finding.verification_status === "pending"
  ) {
    throw new Error("Finding غير متاحة لتعديل Corrective Actions.");
  }
  const archives = await listGovernanceAssuranceArchives();
  const archive = archives.archives.find((row) => row.id === finding.archive_id);
  if (!archive) throw new Error("Archive Certificate غير موجودة.");
  const owner = buildGovernanceAssuranceFindingResponsibleCandidates(
    archive,
  ).find((row) => row.user_id === input.action_owner_user_id);
  if (!owner) throw new Error("Action Owner ليست ضمن دورة الـArchive.");

  const existing = input.id
    ? store.actions.find((row) => row.id === input.id)
    : null;
  if (input.id && !existing) throw new Error("Corrective Action غير موجودة.");
  if (
    existing &&
    (
      existing.version !== input.expected_version ||
      existing.finding_id !== finding.id
    )
  ) {
    throw new Error("تم تعديل Corrective Action. حدّث البيانات وأعد المحاولة.");
  }
  if (!existing && input.expected_version != null) {
    throw new Error("تم تعديل Corrective Action. حدّث البيانات وأعد المحاولة.");
  }

  const now = new Date().toISOString();
  const action: GovernanceAssuranceFindingAction = {
    id: existing?.id ?? crypto.randomUUID(),
    finding_id: finding.id,
    archive_id: finding.archive_id,
    finding_owner_user_id: finding.owner_user_id,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    action_owner_user_id: owner.user_id,
    action_owner_name_snapshot: owner.display_name,
    action_owner_email_snapshot: owner.email,
    status: input.status,
    due_date: input.due_date || null,
    reminder_date: input.reminder_date || null,
    closure_note: input.closure_note?.trim() || null,
    version: existing ? existing.version + 1 : 1,
    completed_at:
      input.status === "completed"
        ? existing?.completed_at ?? now
        : null,
    cancelled_at:
      input.status === "cancelled"
        ? existing?.cancelled_at ?? now
        : null,
    created_by: existing?.created_by ?? finding.owner_user_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store.actions = [
    action,
    ...store.actions.filter((row) => row.id !== action.id),
  ];
  writeLocal(store);
  return action;
}

export async function actOnGovernanceAssuranceFindingAction(
  input: ActOnGovernanceAssuranceFindingActionInput,
): Promise<GovernanceAssuranceFindingAction> {
  if (
    input.status === "completed" &&
    !input.closure_note?.trim()
  ) {
    throw new Error("Closure Note مطلوبة عند إكمال Action.");
  }
  if ((input.closure_note?.length ?? 0) > 12000) {
    throw new Error("Closure Note طويلة جدًا.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/act_on_executive_governance_assurance_finding_action",
      {
        method: "POST",
        body: {
          p_action_id: input.action_id,
          p_expected_version: input.expected_version,
          p_status: input.status,
          p_closure_note: input.closure_note ?? null,
        },
      },
    );
    const action = normalizeFindingAction(raw);
    if (!action) throw new Error("تعذر قراءة Corrective Action.");
    return action;
  }

  const store = readLocal();
  const action = store.actions.find((row) => row.id === input.action_id);
  if (
    !action ||
    action.action_owner_user_id !== "local-user" ||
    action.version !== input.expected_version ||
    action.status === "completed" ||
    action.status === "cancelled"
  ) {
    throw new Error("Corrective Action ليست جاهزة لهذا المستخدم.");
  }
  const finding = store.findings.find((row) => row.id === action.finding_id);
  if (
    !finding ||
    (finding.status !== "open" && finding.status !== "in_progress") ||
    finding.verification_status === "pending"
  ) {
    throw new Error("Finding غير متاحة لتحديث Corrective Action.");
  }

  const now = new Date().toISOString();
  const updated: GovernanceAssuranceFindingAction = {
    ...action,
    status: input.status,
    closure_note:
      input.status === "completed"
        ? input.closure_note?.trim() || null
        : action.closure_note,
    completed_at: input.status === "completed" ? now : null,
    cancelled_at: null,
    version: action.version + 1,
    updated_at: now,
  };
  store.actions = store.actions.map((row) =>
    row.id === updated.id ? updated : row,
  );
  writeLocal(store);
  return updated;
}

export async function refreshGovernanceAssuranceFindingActionNotifications() {
  if (!isSupabaseBackend()) return 0;
  const raw = await supabaseRest<unknown>(
    "rpc/refresh_assurance_finding_action_notifications",
    { method: "POST", body: {} },
  );
  return typeof raw === "number" ? raw : Number(raw ?? 0) || 0;
}

export async function addGovernanceAssuranceFindingEvidence(
  input: AddGovernanceAssuranceFindingEvidenceInput,
): Promise<GovernanceAssuranceFindingEvidence> {
  if (!input.title.trim() || input.title.trim().length > 240) {
    throw new Error("Evidence Title مطلوبة وبحد أقصى 240 حرفًا.");
  }
  if (!input.detail.trim() || input.detail.trim().length > 12000) {
    throw new Error("Evidence Detail مطلوبة وبحد أقصى 12000 حرف.");
  }
  if ((input.reference_url?.length ?? 0) > 2000) {
    throw new Error("Evidence URL طويلة جدًا.");
  }
  if (
    input.reference_url?.trim() &&
    !/^https?:\/\//i.test(input.reference_url.trim())
  ) {
    throw new Error("Evidence URL يجب أن تبدأ بـ http:// أو https://.");
  }
  if (input.evidence_type === "link" && !input.reference_url?.trim()) {
    throw new Error("Link Evidence تتطلب URL.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/add_executive_governance_assurance_finding_evidence",
      {
        method: "POST",
        body: {
          p_finding_id: input.finding_id,
          p_evidence_type: input.evidence_type,
          p_title: input.title,
          p_detail: input.detail,
          p_reference_url: input.reference_url ?? null,
        },
      },
    );
    const evidence = normalizeEvidence(raw);
    if (!evidence) throw new Error("عاد الخادم بـEvidence غير صالحة.");
    return evidence;
  }

  const store = readLocal();
  const finding = store.findings.find((row) => row.id === input.finding_id);
  if (!finding) throw new Error("Assurance Finding غير موجود.");
  if (finding.verification_status === "pending") {
    throw new Error(
      "Closure Evidence مقفلة أثناء Effectiveness Review.",
    );
  }
  const now = new Date().toISOString();
  const evidence: GovernanceAssuranceFindingEvidence = {
    id: crypto.randomUUID(),
    finding_id: finding.id,
    archive_id: finding.archive_id,
    owner_user_id: finding.owner_user_id,
    evidence_type: input.evidence_type,
    title: input.title.trim(),
    detail: input.detail.trim(),
    reference_url: input.reference_url?.trim() || null,
    created_by: finding.owner_user_id,
    created_at: now,
  };
  store.evidence = [evidence, ...store.evidence];
  writeLocal(store);
  return evidence;
}

export async function requestGovernanceAssuranceFindingVerification(
  input: RequestGovernanceAssuranceFindingVerificationInput,
): Promise<GovernanceAssuranceFinding> {
  if (!input.verifier_user_id) throw new Error("Verifier مطلوبة.");

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/request_executive_governance_assurance_finding_verification",
      {
        method: "POST",
        body: {
          p_finding_id: input.finding_id,
          p_expected_version: input.expected_version,
          p_verifier_user_id: input.verifier_user_id,
        },
      },
    );
    const finding = normalizeFinding(raw);
    if (!finding) throw new Error("تعذر قراءة Verification Request.");
    return finding;
  }

  const store = readLocal();
  const finding = store.findings.find((row) => row.id === input.finding_id);
  if (!finding) throw new Error("Assurance Finding غير موجود.");
  if (
    finding.version !== input.expected_version ||
    finding.status !== "resolved" ||
    finding.verification_status === "pending"
  ) {
    throw new Error("Finding ليست جاهزة لطلب Verification.");
  }
  if (!store.evidence.some((row) => row.finding_id === finding.id)) {
    throw new Error("Closure Evidence مطلوبة قبل Verification.");
  }

  const archives = await listGovernanceAssuranceArchives();
  const archive = archives.archives.find((row) => row.id === finding.archive_id);
  if (!archive) throw new Error("Archive Certificate غير موجودة.");
  const candidate = buildGovernanceAssuranceFindingResponsibleCandidates(
    archive,
  ).find((row) => row.user_id === input.verifier_user_id);
  if (
    !candidate ||
    candidate.user_id === finding.responsible_user_id
  ) {
    throw new Error("Verifier يجب أن تكون مستقلة عن Responsible.");
  }

  const now = new Date().toISOString();
  const updated: GovernanceAssuranceFinding = {
    ...finding,
    verification_status: "pending",
    verifier_user_id: candidate.user_id,
    verifier_name_snapshot: candidate.display_name,
    verifier_email_snapshot: candidate.email,
    verification_requested_at: now,
    verified_at: null,
    effectiveness_note: null,
    version: finding.version + 1,
    updated_at: now,
  };
  store.findings = store.findings.map((row) =>
    row.id === updated.id ? updated : row,
  );
  writeLocal(store);
  return updated;
}

export async function actOnGovernanceAssuranceFindingVerification(
  input: ActOnGovernanceAssuranceFindingVerificationInput,
): Promise<GovernanceAssuranceFinding> {
  if (
    !input.effectiveness_note.trim() ||
    input.effectiveness_note.trim().length > 12000
  ) {
    throw new Error("Effectiveness Note مطلوبة وبحد أقصى 12000 حرف.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/act_on_executive_governance_assurance_finding_verification",
      {
        method: "POST",
        body: {
          p_finding_id: input.finding_id,
          p_expected_version: input.expected_version,
          p_decision: input.decision,
          p_effectiveness_note: input.effectiveness_note,
        },
      },
    );
    const finding = normalizeFinding(raw);
    if (!finding) throw new Error("تعذر قراءة Verification Result.");
    return finding;
  }

  const store = readLocal();
  const finding = store.findings.find((row) => row.id === input.finding_id);
  if (
    !finding ||
    finding.verifier_user_id !== "local-user" ||
    finding.verification_status !== "pending" ||
    finding.status !== "resolved" ||
    finding.version !== input.expected_version
  ) {
    throw new Error("Verification ليست جاهزة لهذا المستخدم.");
  }

  const now = new Date().toISOString();
  const updated: GovernanceAssuranceFinding = {
    ...finding,
    verification_status: input.decision,
    verified_at: now,
    effectiveness_note: input.effectiveness_note.trim(),
    status: input.decision === "effective" ? "resolved" : "in_progress",
    resolved_at: input.decision === "effective" ? finding.resolved_at : null,
    version: finding.version + 1,
    updated_at: now,
  };
  store.findings = store.findings.map((row) =>
    row.id === updated.id ? updated : row,
  );
  writeLocal(store);
  return updated;
}

export async function refreshGovernanceAssuranceFindingNotifications() {
  if (!isSupabaseBackend()) return 0;
  const raw = await supabaseRest<unknown>(
    "rpc/refresh_assurance_finding_notifications",
    { method: "POST", body: {} },
  );
  return typeof raw === "number" ? raw : Number(raw ?? 0) || 0;
}


function normalizeRecurrenceOccurrence(
  value: unknown,
): GovernanceAssuranceRecurrenceOccurrence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const findingSeverity = severity(row.severity);
  const findingStatus = status(row.status);
  if (
    typeof row.finding_id !== "string" ||
    typeof row.archive_id !== "string" ||
    typeof row.certificate_code !== "string" ||
    typeof row.period_label !== "string" ||
    typeof row.title !== "string" ||
    typeof row.created_at !== "string" ||
    !findingSeverity ||
    !findingStatus
  ) {
    return null;
  }
  return {
    finding_id: row.finding_id,
    archive_id: row.archive_id,
    certificate_code: row.certificate_code,
    period_label: row.period_label,
    title: row.title,
    severity: findingSeverity,
    status: findingStatus,
    taxonomy_category: taxonomyCategory(row.taxonomy_category),
    root_cause_category: rootCauseCategory(row.root_cause_category),
    control_reference:
      typeof row.control_reference === "string"
        ? row.control_reference
        : null,
    created_at: row.created_at,
  };
}

function normalizeRecurrenceGroup(
  value: unknown,
): GovernanceAssuranceRecurrenceGroup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.recurrence_key !== "string" ||
    typeof row.first_seen_at !== "string" ||
    typeof row.last_seen_at !== "string"
  ) {
    return null;
  }
  return {
    recurrence_key: row.recurrence_key,
    finding_count: intOrNull(row.finding_count) ?? 0,
    archive_count: intOrNull(row.archive_count) ?? 0,
    active_count: intOrNull(row.active_count) ?? 0,
    critical_high_active: intOrNull(row.critical_high_active) ?? 0,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    taxonomy_consistent: row.taxonomy_consistent === true,
    root_cause_consistent: row.root_cause_consistent === true,
    occurrences: Array.isArray(row.occurrences)
      ? row.occurrences
          .map(normalizeRecurrenceOccurrence)
          .filter(
            (item): item is GovernanceAssuranceRecurrenceOccurrence => !!item,
          )
      : [],
  };
}

export async function listGovernanceAssuranceRecurrenceGroups(): Promise<
  GovernanceAssuranceRecurrenceGroup[]
> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/list_executive_governance_assurance_recurrence",
      { method: "POST", body: {} },
    );
    return Array.isArray(raw)
      ? raw
          .map(normalizeRecurrenceGroup)
          .filter(
            (item): item is GovernanceAssuranceRecurrenceGroup => !!item,
          )
      : [];
  }

  const data = await listGovernanceAssuranceFindings();
  const groups = new Map<string, GovernanceAssuranceFindingRow[]>();
  for (const row of data.findings) {
    const key = row.finding.recurrence_key?.trim().toLowerCase();
    if (!key) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .flatMap(([key, rows]) => {
      const archiveIds = new Set(rows.map((row) => row.finding.archive_id));
      if (archiveIds.size < 2) return [];
      const occurrences: GovernanceAssuranceRecurrenceOccurrence[] = rows
        .map((row) => ({
          finding_id: row.finding.id,
          archive_id: row.finding.archive_id,
          certificate_code: row.archive.certificate_code,
          period_label: row.archive.snapshot.review.period_label,
          title: row.finding.title,
          severity: row.finding.severity,
          status: row.finding.status,
          taxonomy_category: row.finding.taxonomy_category,
          root_cause_category: row.finding.root_cause_category,
          control_reference: row.finding.control_reference,
          created_at: row.finding.created_at,
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      return [{
        recurrence_key: key,
        finding_count: rows.length,
        archive_count: archiveIds.size,
        active_count: rows.filter((row) => findingIsActive(row.finding)).length,
        critical_high_active: rows.filter(
          (row) =>
            findingIsActive(row.finding) &&
            (row.finding.severity === "critical" ||
              row.finding.severity === "high"),
        ).length,
        first_seen_at: [...occurrences]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
          .created_at,
        last_seen_at: occurrences[0].created_at,
        taxonomy_consistent:
          new Set(
            rows.map((row) => row.finding.taxonomy_category).filter(Boolean),
          ).size <= 1,
        root_cause_consistent:
          new Set(
            rows.map((row) => row.finding.root_cause_category).filter(Boolean),
          ).size <= 1,
        occurrences,
      }];
    })
    .sort(
      (a, b) =>
        b.critical_high_active - a.critical_high_active ||
        b.active_count - a.active_count ||
        b.archive_count - a.archive_count ||
        b.last_seen_at.localeCompare(a.last_seen_at),
    );
}

function dateDiffDays(start: string, end: string) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

function findingIsActive(finding: GovernanceAssuranceFinding) {
  return finding.status === "open" || finding.status === "in_progress";
}

function findingIsOverdue(
  finding: GovernanceAssuranceFinding,
  today: string,
) {
  return (
    findingIsActive(finding) &&
    !!finding.due_date &&
    finding.due_date < today
  );
}

function activeAgeDays(finding: GovernanceAssuranceFinding, nowIso: string) {
  return dateDiffDays(finding.created_at, nowIso) ?? 0;
}

function buildAgingBuckets(
  findings: GovernanceAssuranceFinding[],
  nowIso: string,
): GovernanceAssuranceRemediationAgingBucket[] {
  const active = findings.filter(findingIsActive);
  const buckets: GovernanceAssuranceRemediationAgingBucket[] = [
    { key: "0_7", label: "0–7 days", min_days: 0, max_days: 7, count: 0 },
    { key: "8_30", label: "8–30 days", min_days: 8, max_days: 30, count: 0 },
    { key: "31_60", label: "31–60 days", min_days: 31, max_days: 60, count: 0 },
    { key: "61_plus", label: "61+ days", min_days: 61, max_days: null, count: 0 },
  ];

  for (const finding of active) {
    const age = activeAgeDays(finding, nowIso);
    const bucket =
      age <= 7
        ? buckets[0]
        : age <= 30
          ? buckets[1]
          : age <= 60
            ? buckets[2]
            : buckets[3];
    bucket.count += 1;
  }

  return buckets;
}

function buildArchiveSummaries(
  rows: GovernanceAssuranceFindingRow[],
  today: string,
): GovernanceAssuranceArchiveRemediationSummary[] {
  const groups = new Map<string, GovernanceAssuranceFindingRow[]>();
  for (const row of rows) {
    const current = groups.get(row.archive.id) ?? [];
    current.push(row);
    groups.set(row.archive.id, current);
  }

  return [...groups.entries()]
    .map(([archiveId, group]) => {
      const archive = group[0].archive;
      const findings = group.map((row) => row.finding);
      const active = findings.filter(findingIsActive);
      return {
        archive_id: archiveId,
        certificate_code: archive.certificate_code,
        period_label: archive.snapshot.review.period_label,
        archived_at: archive.archived_at,
        total: findings.length,
        active: active.length,
        critical_high_active: active.filter(
          (row) => row.severity === "critical" || row.severity === "high",
        ).length,
        overdue_active: findings.filter((row) =>
          findingIsOverdue(row, today),
        ).length,
        resolved: findings.filter((row) => row.status === "resolved").length,
        accepted: findings.filter((row) => row.status === "accepted").length,
        verification_pending: findings.filter(
          (row) => row.verification_status === "pending",
        ).length,
        effective: findings.filter(
          (row) => row.verification_status === "effective",
        ).length,
        partially_effective: findings.filter(
          (row) => row.verification_status === "partially_effective",
        ).length,
        ineffective: findings.filter(
          (row) => row.verification_status === "ineffective",
        ).length,
      };
    })
    .sort(
      (a, b) =>
        b.archived_at.localeCompare(a.archived_at) ||
        a.certificate_code.localeCompare(b.certificate_code),
    );
}

function buildSeverityEffectiveness(
  findings: GovernanceAssuranceFinding[],
): GovernanceAssuranceSeverityEffectivenessSummary[] {
  const severities: GovernanceAssuranceFindingSeverity[] = [
    "critical",
    "high",
    "medium",
    "low",
  ];
  return severities.map((level) => {
    const rows = findings.filter((row) => row.severity === level);
    const effective = rows.filter(
      (row) => row.verification_status === "effective",
    ).length;
    const partiallyEffective = rows.filter(
      (row) => row.verification_status === "partially_effective",
    ).length;
    const ineffective = rows.filter(
      (row) => row.verification_status === "ineffective",
    ).length;
    return {
      severity: level,
      total_findings: rows.length,
      completed_verifications:
        effective + partiallyEffective + ineffective,
      effective,
      partially_effective: partiallyEffective,
      ineffective,
    };
  });
}

export function buildGovernanceAssuranceRemediationAnalytics(
  data: GovernanceAssuranceFindingData,
  now = new Date(),
): GovernanceAssuranceRemediationAnalytics {
  const nowIso = now.toISOString();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const findings = data.findings.map((row) => row.finding);
  const active = findings.filter(findingIsActive);
  const closed = findings.filter(
    (row) => row.status === "resolved" || row.status === "accepted",
  );
  const effective = findings.filter(
    (row) => row.verification_status === "effective",
  ).length;
  const partiallyEffective = findings.filter(
    (row) => row.verification_status === "partially_effective",
  ).length;
  const ineffective = findings.filter(
    (row) => row.verification_status === "ineffective",
  ).length;
  const completedVerifications =
    effective + partiallyEffective + ineffective;

  const resolutionDays = findings.flatMap((row) => {
    if (!row.resolved_at) return [];
    const days = dateDiffDays(row.created_at, row.resolved_at);
    return days == null ? [] : [days];
  });
  const acceptanceDays = findings.flatMap((row) => {
    if (!row.accepted_at) return [];
    const days = dateDiffDays(row.created_at, row.accepted_at);
    return days == null ? [] : [days];
  });

  return {
    generated_at: nowIso,
    total_findings: findings.length,
    active_findings: active.length,
    closed_findings: closed.length,
    overdue_active: findings.filter((row) => findingIsOverdue(row, today))
      .length,
    unassigned_active: active.filter((row) => !row.responsible_user_id).length,
    verification_pending: findings.filter(
      (row) => row.verification_status === "pending",
    ).length,
    completed_verifications: completedVerifications,
    effective_verifications: effective,
    partially_effective_verifications: partiallyEffective,
    ineffective_verifications: ineffective,
    effectiveness_rate_pct:
      completedVerifications > 0
        ? Math.round((effective / completedVerifications) * 1000) / 10
        : null,
    median_resolution_days: median(resolutionDays),
    median_acceptance_days: median(acceptanceDays),
    reopened_by_effectiveness: findings.filter(
      (row) =>
        findingIsActive(row) &&
        (
          row.verification_status === "partially_effective" ||
          row.verification_status === "ineffective"
        ),
    ).length,
    active_aging: buildAgingBuckets(findings, nowIso),
    by_archive: buildArchiveSummaries(data.findings, today),
    by_severity: buildSeverityEffectiveness(findings),
  };
}

function csvCell(value: string | number | null) {
  if (value == null) return "";
  const text = String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

function csvRow(values: Array<string | number | null>) {
  return values.map(csvCell).join(",");
}

export function governanceAssuranceRemediationAnalyticsCsv(
  analytics: GovernanceAssuranceRemediationAnalytics,
) {
  const lines = [
    csvRow(["Governance Assurance Remediation Analytics"]),
    csvRow(["Generated At", analytics.generated_at]),
    csvRow(["Total Findings", analytics.total_findings]),
    csvRow(["Active Findings", analytics.active_findings]),
    csvRow(["Closed Findings", analytics.closed_findings]),
    csvRow(["Overdue Active", analytics.overdue_active]),
    csvRow(["Unassigned Active", analytics.unassigned_active]),
    csvRow(["Verification Pending", analytics.verification_pending]),
    csvRow(["Completed Verifications", analytics.completed_verifications]),
    csvRow(["Effective", analytics.effective_verifications]),
    csvRow([
      "Partially Effective",
      analytics.partially_effective_verifications,
    ]),
    csvRow(["Ineffective", analytics.ineffective_verifications]),
    csvRow(["Effectiveness Rate %", analytics.effectiveness_rate_pct]),
    csvRow(["Median Resolution Days", analytics.median_resolution_days]),
    csvRow(["Median Acceptance Days", analytics.median_acceptance_days]),
    csvRow(["Reopened By Effectiveness", analytics.reopened_by_effectiveness]),
    "",
    csvRow(["Active Aging", "Count"]),
    ...analytics.active_aging.map((row) => csvRow([row.label, row.count])),
    "",
    csvRow([
      "Archive Certificate",
      "Period",
      "Archived At",
      "Total",
      "Active",
      "Critical/High Active",
      "Overdue Active",
      "Resolved",
      "Accepted",
      "Verification Pending",
      "Effective",
      "Partially Effective",
      "Ineffective",
    ]),
    ...analytics.by_archive.map((row) =>
      csvRow([
        row.certificate_code,
        row.period_label,
        row.archived_at,
        row.total,
        row.active,
        row.critical_high_active,
        row.overdue_active,
        row.resolved,
        row.accepted,
        row.verification_pending,
        row.effective,
        row.partially_effective,
        row.ineffective,
      ]),
    ),
    "",
    csvRow([
      "Severity",
      "Total Findings",
      "Completed Verifications",
      "Effective",
      "Partially Effective",
      "Ineffective",
    ]),
    ...analytics.by_severity.map((row) =>
      csvRow([
        row.severity,
        row.total_findings,
        row.completed_verifications,
        row.effective,
        row.partially_effective,
        row.ineffective,
      ]),
    ),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadGovernanceAssuranceRemediationAnalyticsCsv(
  analytics: GovernanceAssuranceRemediationAnalytics,
) {
  const blob = new Blob(
    [governanceAssuranceRemediationAnalyticsCsv(analytics)],
    { type: "text/csv;charset=utf-8" },
  );
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "governance-assurance-remediation-analytics.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
