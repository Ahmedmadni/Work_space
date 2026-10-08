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
  GovernanceAssuranceFinding,
  GovernanceAssuranceFindingData,
  GovernanceAssuranceFindingResponsibleCandidate,
  GovernanceAssuranceFindingRow,
  GovernanceAssuranceFindingSeverity,
  GovernanceAssuranceFindingSourceCandidate,
  GovernanceAssuranceFindingSourceType,
  GovernanceAssuranceFindingStatus,
  GovernanceAssuranceFindingSummary,
  SaveGovernanceAssuranceFindingInput,
} from "@/types/governance-assurance-findings";

const LOCAL_KEY = "projectflow.executive-governance-assurance-findings.v1";

interface LocalStore {
  version: 1;
  findings: GovernanceAssuranceFinding[];
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

function normalizeFinding(value: unknown): GovernanceAssuranceFinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const findingSource = sourceType(row.source_type);
  const findingSeverity = severity(row.severity);
  const findingStatus = status(row.status);
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
    corrective_action:
      typeof row.corrective_action === "string"
        ? row.corrective_action
        : null,
    resolution_note:
      typeof row.resolution_note === "string"
        ? row.resolution_note
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
  };
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") {
    return { version: 1, findings: [] };
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
    };
  } catch {
    return { version: 1, findings: [] };
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
    archive.owner_user_id,
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
  const findings = readLocal().findings
    .filter((finding) => archiveMap.has(finding.archive_id))
    .map((finding) => ({
      finding,
      archive: archiveMap.get(finding.archive_id)!,
      can_manage: true,
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

  const now = new Date().toISOString();
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
    corrective_action: input.corrective_action?.trim() || null,
    resolution_note: input.resolution_note?.trim() || null,
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
