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
  ActOnGovernanceAssuranceFindingVerificationInput,
  AddGovernanceAssuranceFindingEvidenceInput,
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingData,
  GovernanceAssuranceFindingEvidence,
  GovernanceAssuranceFindingEvidenceType,
  GovernanceAssuranceFindingResponsibleCandidate,
  GovernanceAssuranceFindingRow,
  GovernanceAssuranceFindingSeverity,
  GovernanceAssuranceFindingSourceCandidate,
  GovernanceAssuranceFindingSourceType,
  GovernanceAssuranceFindingStatus,
  GovernanceAssuranceFindingSummary,
  GovernanceAssuranceFindingVerificationStatus,
  RequestGovernanceAssuranceFindingVerificationInput,
  SaveGovernanceAssuranceFindingInput,
} from "@/types/governance-assurance-findings";

const LOCAL_KEY = "projectflow.executive-governance-assurance-findings.v1";

interface LocalStore {
  version: 1;
  findings: GovernanceAssuranceFinding[];
  evidence: GovernanceAssuranceFindingEvidence[];
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
    return { version: 1, findings: [], evidence: [] };
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
    };
  } catch {
    return { version: 1, findings: [], evidence: [] };
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
  if (
    existing?.verification_status === "pending" &&
    (
      input.status !== existing.status ||
      (input.responsible_user_id ?? null) !==
        existing.responsible_user_id
    )
  ) {
    throw new Error(
      "لا يمكن تغيير Status أو Responsible أثناء Verification Pending.",
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
