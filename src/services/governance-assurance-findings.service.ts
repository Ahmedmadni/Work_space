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
  ClassifyGovernanceAssuranceFindingInput,
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingAction,
  GovernanceAssuranceFindingActionStatus,
  GovernanceAssuranceFindingActionType,
  GovernanceAssuranceFindingCategory,
  GovernanceAssuranceFindingClosureReadiness,
  GovernanceAssuranceFindingData,
  GovernanceAssuranceFindingEvidence,
  GovernanceAssuranceFindingEvidenceType,
  GovernanceAssuranceArchiveRemediationSummary,
  GovernanceAssuranceFindingResponsibleCandidate,
  GovernanceAssuranceFindingRow,
  GovernanceAssuranceRecurrenceCandidate,
  GovernanceAssuranceFindingSeverity,
  GovernanceAssuranceFindingSourceCandidate,
  GovernanceAssuranceFindingSourceType,
  GovernanceAssuranceFindingStatus,
  GovernanceAssuranceFindingSummary,
  GovernanceAssuranceFindingVerificationStatus,
  GovernanceAssuranceRemediationAnalytics,
  GovernanceAssuranceRemediationAgingBucket,
  GovernanceAssuranceRootCauseCategory,
  GovernanceAssuranceSeverityEffectivenessSummary,
  GovernanceAssuranceTaxonomyAnalyticsRow,
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

function findingCategory(
  value: unknown,
): GovernanceAssuranceFindingCategory | null {
  return value === "control_design" ||
    value === "control_operation" ||
    value === "process_gap" ||
    value === "data_quality" ||
    value === "compliance" ||
    value === "governance" ||
    value === "security_access" ||
    value === "documentation" ||
    value === "execution" ||
    value === "third_party" ||
    value === "other"
    ? value
    : null;
}

function rootCauseCategory(
  value: unknown,
): GovernanceAssuranceRootCauseCategory | null {
  return value === "people" ||
    value === "process" ||
    value === "technology" ||
    value === "data" ||
    value === "governance" ||
    value === "third_party" ||
    value === "external" ||
    value === "unknown" ||
    value === "other"
    ? value
    : null;
}

function actionType(
  value: unknown,
): GovernanceAssuranceFindingActionType | null {
  return value === "corrective" || value === "preventive" ? value : null;
}

function actionStatus(
  value: unknown,
): GovernanceAssuranceFindingActionStatus | null {
  return value === "open" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "cancelled"
    ? value
    : null;
}

function normalizeAction(
  value: unknown,
): GovernanceAssuranceFindingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const type = actionType(row.action_type);
  const status = actionStatus(row.status);
  const version = intOrNull(row.version);
  if (
    typeof row.id !== "string" ||
    typeof row.finding_id !== "string" ||
    typeof row.archive_id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.description !== "string" ||
    typeof row.created_by !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !type ||
    !status ||
    version == null
  ) {
    return null;
  }
  return {
    id: row.id,
    finding_id: row.finding_id,
    archive_id: row.archive_id,
    owner_user_id: row.owner_user_id,
    action_type: type,
    title: row.title,
    description: row.description,
    status,
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
    outcome_note:
      typeof row.outcome_note === "string" ? row.outcome_note : null,
    version,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
    cancelled_at:
      typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    can_manage: row.can_manage === true,
    is_responsible: row.is_responsible === true,
  };
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

function normalizeFinding(value: unknown): GovernanceAssuranceFinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const findingSource = sourceType(row.source_type);
  const findingSeverity = severity(row.severity);
  const findingStatus = status(row.status);
  const findingVerificationStatus =
    verificationStatus(row.verification_status) ?? "not_requested";
  const normalizedFindingCategory = findingCategory(row.finding_category);
  const normalizedRootCauseCategory = rootCauseCategory(
    row.root_cause_category,
  );
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
    finding_category: normalizedFindingCategory,
    root_cause_category: normalizedRootCauseCategory,
    root_cause_detail:
      typeof row.root_cause_detail === "string" ? row.root_cause_detail : null,
    recurrence_parent_finding_id:
      typeof row.recurrence_parent_finding_id === "string"
        ? row.recurrence_parent_finding_id
        : null,
    recurrence_root_finding_id:
      typeof row.recurrence_root_finding_id === "string"
        ? row.recurrence_root_finding_id
        : null,
    recurrence_sequence: intOrNull(row.recurrence_sequence) ?? 1,
    recurrence_reason:
      typeof row.recurrence_reason === "string" ? row.recurrence_reason : null,
    taxonomy_version: intOrNull(row.taxonomy_version) ?? 1,
    classified_by:
      typeof row.classified_by === "string" ? row.classified_by : null,
    classified_at:
      typeof row.classified_at === "string" ? row.classified_at : null,
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
            .map(normalizeAction)
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
    const [raw, actionRows, archives] = await Promise.all([
      supabaseRest<Record<string, unknown>>(
        "rpc/list_executive_governance_assurance_findings",
        { method: "POST", body: {} },
      ),
      supabaseRest<unknown[]>(
        "rpc/list_executive_governance_assurance_finding_actions",
        { method: "POST", body: {} },
      ),
      archiveDataPromise,
    ]);
    const actionsByFinding = new Map<
      string,
      GovernanceAssuranceFindingAction[]
    >();
    for (const item of actionRows) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const wrapper = item as Record<string, unknown>;
      const action = normalizeAction(wrapper.action);
      if (!action) continue;
      const scopedAction: GovernanceAssuranceFindingAction = {
        ...action,
        can_manage: wrapper.can_manage === true,
        is_responsible: wrapper.is_responsible === true,
      };
      const current = actionsByFinding.get(action.finding_id) ?? [];
      current.push(scopedAction);
      actionsByFinding.set(action.finding_id, current);
    }
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
              actions: actionsByFinding.get(finding.id) ?? [],
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
        .map((row) => ({
          ...row,
          can_manage: true,
          is_responsible: row.responsible_user_id === "local-user",
        }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    }));

  return {
    findings,
    manageable_archive_ids: archives.archives.map((archive) => archive.id),
    summary: buildSummary(findings.map((row) => row.finding)),
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
    finding_category: existing?.finding_category ?? null,
    root_cause_category: existing?.root_cause_category ?? null,
    root_cause_detail: existing?.root_cause_detail ?? null,
    recurrence_parent_finding_id:
      existing?.recurrence_parent_finding_id ?? null,
    recurrence_root_finding_id:
      existing?.recurrence_root_finding_id ?? null,
    recurrence_sequence: existing?.recurrence_sequence ?? 1,
    recurrence_reason: existing?.recurrence_reason ?? null,
    taxonomy_version: existing?.taxonomy_version ?? 1,
    classified_by: existing?.classified_by ?? null,
    classified_at: existing?.classified_at ?? null,
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


export function buildGovernanceAssuranceFindingClosureReadiness(
  row: GovernanceAssuranceFindingRow,
): GovernanceAssuranceFindingClosureReadiness {
  const activeCapa = row.actions.filter(
    (action) => action.status === "open" || action.status === "in_progress",
  ).length;
  const preventiveRequired =
    !!row.finding.recurrence_parent_finding_id;
  const hasCompletedPreventive = row.actions.some(
    (action) =>
      action.action_type === "preventive" &&
      action.status === "completed",
  );
  const hasEvidence = row.evidence.length > 0;
  const reasons: GovernanceAssuranceFindingClosureReadiness["reasons"] = [];

  if (!hasEvidence) reasons.push("evidence_required");
  if (activeCapa > 0) reasons.push("active_capa_actions");
  if (preventiveRequired && !hasCompletedPreventive) {
    reasons.push("completed_preventive_required");
  }

  return {
    ready: reasons.length === 0,
    has_evidence: hasEvidence,
    active_capa_actions: activeCapa,
    has_completed_preventive_action: hasCompletedPreventive,
    preventive_required: preventiveRequired,
    reasons,
  };
}

export async function actOnGovernanceAssuranceFindingAction(
  input: ActOnGovernanceAssuranceFindingActionInput,
): Promise<GovernanceAssuranceFindingAction> {
  if (
    input.status === "completed" &&
    !input.outcome_note?.trim()
  ) {
    throw new Error("Outcome Note مطلوبة عند إكمال CAPA Action.");
  }
  if (
    input.status === "in_progress" &&
    input.outcome_note?.trim()
  ) {
    throw new Error("Outcome Note تستخدم فقط عند الإكمال.");
  }
  if ((input.outcome_note?.length ?? 0) > 12000) {
    throw new Error("Outcome Note طويلة جدًا.");
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
          p_outcome_note: input.outcome_note ?? null,
        },
      },
    );
    const action = normalizeAction(raw);
    if (!action) throw new Error("تعذر قراءة CAPA Action بعد التحديث.");
    return action;
  }

  const store = readLocal();
  const action = store.actions.find((row) => row.id === input.action_id);
  if (!action || action.responsible_user_id !== "local-user") {
    throw new Error("CAPA Action غير مسندة لهذا المستخدم.");
  }
  if (action.version !== input.expected_version) {
    throw new Error("تم تعديل CAPA Action. حدّث البيانات وأعد المحاولة.");
  }
  const finding = store.findings.find((row) => row.id === action.finding_id);
  if (!finding) throw new Error("Assurance Finding غير موجود.");
  if (finding.verification_status === "pending") {
    throw new Error("CAPA Plan مقفلة أثناء Effectiveness Review.");
  }
  const validTransition =
    (action.status === "open" &&
      (input.status === "in_progress" || input.status === "completed")) ||
    (action.status === "in_progress" && input.status === "completed");
  if (!validTransition) {
    throw new Error("انتقال حالة CAPA Action غير مسموح للمسؤول.");
  }

  const now = new Date().toISOString();
  const updated: GovernanceAssuranceFindingAction = {
    ...action,
    status: input.status,
    outcome_note:
      input.status === "completed" ? input.outcome_note?.trim() || null : null,
    completed_at: input.status === "completed" ? now : null,
    cancelled_at: null,
    version: action.version + 1,
    updated_at: now,
    can_manage: action.can_manage,
    is_responsible: true,
  };
  store.actions = store.actions.map((row) =>
    row.id === updated.id ? updated : row,
  );
  writeLocal(store);
  return updated;
}

export async function refreshGovernanceAssuranceCapaNotifications() {
  if (!isSupabaseBackend()) return 0;
  const raw = await supabaseRest<unknown>(
    "rpc/refresh_assurance_capa_action_notifications",
    { method: "POST", body: {} },
  );
  return typeof raw === "number" ? raw : Number(raw ?? 0) || 0;
}

export async function saveGovernanceAssuranceFindingAction(
  input: SaveGovernanceAssuranceFindingActionInput,
): Promise<GovernanceAssuranceFindingAction> {
  if (!input.title.trim() || input.title.trim().length > 240) {
    throw new Error("CAPA Action Title مطلوبة وبحد أقصى 240 حرفًا.");
  }
  if (
    !input.description.trim() ||
    input.description.trim().length > 12000
  ) {
    throw new Error("CAPA Action Description مطلوبة وبحد أقصى 12000 حرف.");
  }
  if ((input.outcome_note?.length ?? 0) > 12000) {
    throw new Error("Outcome Note طويلة جدًا.");
  }
  if (
    (input.status === "completed" || input.status === "cancelled") &&
    !input.outcome_note?.trim()
  ) {
    throw new Error("Outcome Note مطلوبة للحالة النهائية.");
  }
  if (
    (input.status === "open" || input.status === "in_progress") &&
    input.outcome_note?.trim()
  ) {
    throw new Error("Outcome Note تستخدم فقط مع Completed أو Cancelled.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/save_executive_governance_assurance_finding_action",
      {
        method: "POST",
        body: {
          p_action_id: input.id ?? null,
          p_expected_version: input.expected_version ?? null,
          p_finding_id: input.finding_id,
          p_action_type: input.action_type,
          p_title: input.title,
          p_description: input.description,
          p_status: input.status,
          p_responsible_user_id: input.responsible_user_id ?? null,
          p_due_date: input.due_date ?? null,
          p_outcome_note: input.outcome_note ?? null,
        },
      },
    );
    const action = normalizeAction(raw);
    if (!action) throw new Error("عاد الخادم بـCAPA Action غير صالحة.");
    return action;
  }

  const store = readLocal();
  const finding = store.findings.find((row) => row.id === input.finding_id);
  if (!finding) throw new Error("Assurance Finding غير موجود.");
  if (finding.verification_status === "pending") {
    throw new Error("CAPA Plan مقفلة أثناء Effectiveness Review.");
  }

  const archives = await listGovernanceAssuranceArchives();
  const archive = archives.archives.find(
    (row) => row.id === finding.archive_id,
  );
  if (!archive) throw new Error("Archive Certificate غير موجودة.");

  const responsible = input.responsible_user_id
    ? buildGovernanceAssuranceFindingResponsibleCandidates(archive).find(
        (row) => row.user_id === input.responsible_user_id,
      )
    : null;
  if (input.responsible_user_id && !responsible) {
    throw new Error("CAPA Responsible ليست ضمن دورة الـArchive.");
  }

  const existing = input.id
    ? store.actions.find((row) => row.id === input.id)
    : null;
  if (input.id && !existing) {
    throw new Error("CAPA Action غير موجودة.");
  }
  if (
    existing &&
    (
      input.expected_version == null ||
      existing.version !== input.expected_version
    )
  ) {
    throw new Error("تم تعديل CAPA Action. حدّث البيانات وأعد المحاولة.");
  }
  if (!existing && input.expected_version != null) {
    throw new Error("تم تعديل CAPA Action. حدّث البيانات وأعد المحاولة.");
  }
  if (existing && existing.finding_id !== finding.id) {
    throw new Error("Finding الخاصة بـCAPA Action لا يمكن تغييرها.");
  }

  const now = new Date().toISOString();
  const action: GovernanceAssuranceFindingAction = {
    id: existing?.id ?? crypto.randomUUID(),
    finding_id: finding.id,
    archive_id: finding.archive_id,
    owner_user_id: finding.owner_user_id,
    action_type: input.action_type,
    title: input.title.trim(),
    description: input.description.trim(),
    status: input.status,
    responsible_user_id: responsible?.user_id ?? null,
    responsible_name_snapshot: responsible?.display_name ?? null,
    responsible_email_snapshot: responsible?.email ?? null,
    due_date: input.due_date || null,
    outcome_note:
      input.status === "completed" || input.status === "cancelled"
        ? input.outcome_note?.trim() || null
        : null,
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

export function buildGovernanceAssuranceRecurrenceCandidates(
  data: GovernanceAssuranceFindingData,
  findingId: string,
  category: GovernanceAssuranceFindingCategory | null,
  rootCause: GovernanceAssuranceRootCauseCategory | null,
): GovernanceAssuranceRecurrenceCandidate[] {
  const current = data.findings.find((row) => row.finding.id === findingId);
  if (!current) return [];

  const priority = {
    exact_taxonomy: 0,
    same_category: 1,
    other: 2,
  } as const;

  return data.findings
    .filter(
      (row) =>
        row.finding.id !== findingId &&
        row.finding.owner_user_id === current.finding.owner_user_id &&
        row.archive.id !== current.archive.id &&
        row.archive.archived_at < current.archive.archived_at,
    )
    .map((row): GovernanceAssuranceRecurrenceCandidate => {
      const exact =
        !!category &&
        !!rootCause &&
        row.finding.finding_category === category &&
        row.finding.root_cause_category === rootCause;
      const sameCategory =
        !!category && row.finding.finding_category === category;
      return {
        finding_id: row.finding.id,
        archive_id: row.archive.id,
        certificate_code: row.archive.certificate_code,
        period_label: row.archive.snapshot.review.period_label,
        archived_at: row.archive.archived_at,
        title: row.finding.title,
        severity: row.finding.severity,
        status: row.finding.status,
        finding_category: row.finding.finding_category,
        root_cause_category: row.finding.root_cause_category,
        recurrence_sequence: row.finding.recurrence_sequence,
        match: exact
          ? "exact_taxonomy"
          : sameCategory
            ? "same_category"
            : "other",
      };
    })
    .sort(
      (a, b) =>
        priority[a.match] - priority[b.match] ||
        b.archived_at.localeCompare(a.archived_at) ||
        a.title.localeCompare(b.title, "ar"),
    );
}

export async function classifyGovernanceAssuranceFinding(
  input: ClassifyGovernanceAssuranceFindingInput,
): Promise<GovernanceAssuranceFinding> {
  if (
    input.root_cause_category &&
    !input.finding_category
  ) {
    throw new Error("Root Cause تتطلب Finding Category.");
  }
  if (
    input.root_cause_detail?.trim() &&
    !input.root_cause_category
  ) {
    throw new Error("Root Cause Detail تتطلب Root Cause Category.");
  }
  if ((input.root_cause_detail?.length ?? 0) > 4000) {
    throw new Error("Root Cause Detail طويلة جدًا.");
  }
  if ((input.recurrence_reason?.length ?? 0) > 4000) {
    throw new Error("Recurrence Reason طويلة جدًا.");
  }
  if (
    input.recurrence_parent_finding_id &&
    !input.recurrence_reason?.trim()
  ) {
    throw new Error("Recurrence Reason مطلوبة عند ربط Finding سابقة.");
  }
  if (
    !input.recurrence_parent_finding_id &&
    input.recurrence_reason?.trim()
  ) {
    throw new Error("اختر Previous Finding أو امسح Recurrence Reason.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/classify_executive_governance_assurance_finding",
      {
        method: "POST",
        body: {
          p_finding_id: input.finding_id,
          p_expected_version: input.expected_version,
          p_finding_category: input.finding_category,
          p_root_cause_category: input.root_cause_category,
          p_root_cause_detail: input.root_cause_detail ?? null,
          p_recurrence_parent_finding_id:
            input.recurrence_parent_finding_id ?? null,
          p_recurrence_reason: input.recurrence_reason ?? null,
        },
      },
    );
    const finding = normalizeFinding(raw);
    if (!finding) throw new Error("تعذر قراءة Finding Classification.");
    return finding;
  }

  const store = readLocal();
  const finding = store.findings.find((row) => row.id === input.finding_id);
  if (!finding) throw new Error("Assurance Finding غير موجود.");
  if (finding.version !== input.expected_version) {
    throw new Error("تم تعديل Finding. حدّث البيانات وأعد المحاولة.");
  }
  if (finding.verification_status === "pending") {
    throw new Error(
      "Finding مقفلة أثناء Effectiveness Review.",
    );
  }
  if (
    (input.recurrence_parent_finding_id ?? null) !==
      finding.recurrence_parent_finding_id &&
    store.findings.some(
      (row) => row.recurrence_parent_finding_id === finding.id,
    )
  ) {
    throw new Error(
      "لا يمكن تغيير Recurrence Parent لأن Finding لها عناصر لاحقة في السلسلة.",
    );
  }

  const archives = await listGovernanceAssuranceArchives();
  const archiveMap = new Map(
    archives.archives.map((archive) => [archive.id, archive] as const),
  );
  const currentArchive = archiveMap.get(finding.archive_id);
  if (!currentArchive) throw new Error("Archive Certificate غير موجودة.");

  let recurrenceRoot: string | null = null;
  let recurrenceSequence = 1;
  if (input.recurrence_parent_finding_id) {
    const parent = store.findings.find(
      (row) => row.id === input.recurrence_parent_finding_id,
    );
    if (
      !parent ||
      parent.id === finding.id ||
      parent.owner_user_id !== finding.owner_user_id
    ) {
      throw new Error("Previous Finding غير صالحة.");
    }
    const parentArchive = archiveMap.get(parent.archive_id);
    if (
      !parentArchive ||
      parent.archive_id === finding.archive_id ||
      parentArchive.archived_at >= currentArchive.archived_at
    ) {
      throw new Error(
        "Recurrence يجب أن ترتبط بـFinding من Archive أقدم.",
      );
    }
    recurrenceRoot = parent.recurrence_root_finding_id ?? parent.id;
    recurrenceSequence = Math.max(2, parent.recurrence_sequence + 1);
  }

  const now = new Date().toISOString();
  const updated: GovernanceAssuranceFinding = {
    ...finding,
    finding_category: input.finding_category,
    root_cause_category: input.root_cause_category,
    root_cause_detail: input.root_cause_detail?.trim() || null,
    recurrence_parent_finding_id:
      input.recurrence_parent_finding_id ?? null,
    recurrence_root_finding_id: recurrenceRoot,
    recurrence_sequence: recurrenceSequence,
    recurrence_reason: input.recurrence_parent_finding_id
      ? input.recurrence_reason?.trim() || null
      : null,
    taxonomy_version: 1,
    classified_by: "local-user",
    classified_at: now,
    version: finding.version + 1,
    updated_at: now,
  };
  store.findings = store.findings.map((row) =>
    row.id === updated.id ? updated : row,
  );
  writeLocal(store);
  return updated;
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
    finding.verification_status !== "not_requested"
  ) {
    throw new Error("Finding ليست جاهزة لطلب Verification.");
  }
  if (!store.evidence.some((row) => row.finding_id === finding.id)) {
    throw new Error("Closure Evidence مطلوبة قبل Verification.");
  }
  const findingActions = store.actions.filter(
    (row) => row.finding_id === finding.id,
  );
  if (
    findingActions.some(
      (row) => row.status === "open" || row.status === "in_progress",
    )
  ) {
    throw new Error(
      "أكمل CAPA Actions النشطة قبل طلب Effectiveness Review.",
    );
  }
  if (
    finding.recurrence_parent_finding_id &&
    !findingActions.some(
      (row) =>
        row.action_type === "preventive" &&
        row.status === "completed",
    )
  ) {
    throw new Error(
      "Recurring Finding تتطلب Preventive Action مكتملة قبل Verification.",
    );
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

function buildTaxonomyAnalytics(
  findings: GovernanceAssuranceFinding[],
  getKey: (finding: GovernanceAssuranceFinding) => string | null,
): GovernanceAssuranceTaxonomyAnalyticsRow[] {
  const groups = new Map<string, GovernanceAssuranceFinding[]>();
  for (const finding of findings) {
    const key = getKey(finding);
    if (!key) continue;
    const current = groups.get(key) ?? [];
    current.push(finding);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      total: rows.length,
      active: rows.filter(findingIsActive).length,
      recurring: rows.filter(
        (row) => !!row.recurrence_parent_finding_id,
      ).length,
      effective: rows.filter(
        (row) => row.verification_status === "effective",
      ).length,
      partially_effective: rows.filter(
        (row) => row.verification_status === "partially_effective",
      ).length,
      ineffective: rows.filter(
        (row) => row.verification_status === "ineffective",
      ).length,
    }))
    .sort(
      (a, b) =>
        b.active - a.active ||
        b.total - a.total ||
        a.key.localeCompare(b.key),
    );
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
  const actions = data.findings.flatMap((row) => row.actions);
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
  const activeActions = actions.filter(
    (row) => row.status === "open" || row.status === "in_progress",
  );
  const overdueActions = activeActions.filter(
    (row) => !!row.due_date && row.due_date < today,
  );
  const recurringRows = data.findings.filter(
    (row) => !!row.finding.recurrence_parent_finding_id,
  );
  const recurringWithPreventive = recurringRows.filter((row) =>
    row.actions.some(
      (action) =>
        action.action_type === "preventive" &&
        action.status !== "cancelled",
    ),
  ).length; = findings.flatMap((row) => {
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
    classified_findings: findings.filter(
      (row) => !!row.finding_category,
    ).length,
    unclassified_findings: findings.filter(
      (row) => !row.finding_category,
    ).length,
    recurring_findings: findings.filter(
      (row) => !!row.recurrence_parent_finding_id,
    ).length,
    recurring_active: active.filter(
      (row) => !!row.recurrence_parent_finding_id,
    ).length,
    recurrence_chains: new Set(
      findings.flatMap((row) =>
        row.recurrence_root_finding_id
          ? [row.recurrence_root_finding_id]
          : [],
      ),
    ).size,
    total_capa_actions: actions.length,
    active_capa_actions: activeActions.length,
    overdue_capa_actions: overdueActions.length,
    preventive_actions: actions.filter(
      (row) =>
        row.action_type === "preventive" &&
        row.status !== "cancelled",
    ).length,
    recurring_with_preventive_action: recurringWithPreventive,
    recurring_without_preventive_action:
      recurringRows.length - recurringWithPreventive,
    preventive_coverage_pct:
      recurringRows.length > 0
        ? Math.round(
            (recurringWithPreventive / recurringRows.length) * 1000,
          ) / 10
        : null,
    active_aging: buildAgingBuckets(findings, nowIso),
    by_archive: buildArchiveSummaries(data.findings, today),
    by_severity: buildSeverityEffectiveness(findings),
    by_category: buildTaxonomyAnalytics(
      findings,
      (row) => row.finding_category,
    ),
    by_root_cause: buildTaxonomyAnalytics(
      findings,
      (row) => row.root_cause_category,
    ),
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
    csvRow(["Classified Findings", analytics.classified_findings]),
    csvRow(["Unclassified Findings", analytics.unclassified_findings]),
    csvRow(["Recurring Findings", analytics.recurring_findings]),
    csvRow(["Recurring Active", analytics.recurring_active]),
    csvRow(["Recurrence Chains", analytics.recurrence_chains]),
    csvRow(["Total CAPA Actions", analytics.total_capa_actions]),
    csvRow(["Active CAPA Actions", analytics.active_capa_actions]),
    csvRow(["Overdue CAPA Actions", analytics.overdue_capa_actions]),
    csvRow(["Preventive Actions", analytics.preventive_actions]),
    csvRow([
      "Recurring With Preventive Action",
      analytics.recurring_with_preventive_action,
    ]),
    csvRow([
      "Recurring Without Preventive Action",
      analytics.recurring_without_preventive_action,
    ]),
    csvRow([
      "Preventive Coverage %",
      analytics.preventive_coverage_pct,
    ]),
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
    "",
    csvRow([
      "Finding Category",
      "Total",
      "Active",
      "Recurring",
      "Effective",
      "Partially Effective",
      "Ineffective",
    ]),
    ...analytics.by_category.map((row) =>
      csvRow([
        row.key,
        row.total,
        row.active,
        row.recurring,
        row.effective,
        row.partially_effective,
        row.ineffective,
      ]),
    ),
    "",
    csvRow([
      "Root Cause",
      "Total",
      "Active",
      "Recurring",
      "Effective",
      "Partially Effective",
      "Ineffective",
    ]),
    ...analytics.by_root_cause.map((row) =>
      csvRow([
        row.key,
        row.total,
        row.active,
        row.recurring,
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
