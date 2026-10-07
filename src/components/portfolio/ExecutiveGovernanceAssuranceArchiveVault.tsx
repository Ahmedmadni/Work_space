import {
  Archive,
  BadgeCheck,
  CheckCircle2,
  ClipboardCopy,
  Fingerprint,
  Printer,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  useGovernanceAssuranceArchives,
  useVerifyGovernanceAssuranceArchive,
} from "@/hooks/use-governance-assurance";
import { arabicNumber } from "@/lib/format";
import type {
  GovernanceAssuranceArchive,
  GovernanceAssuranceArchiveVerification,
} from "@/types/governance-assurance";

const ARCHIVE_PRINT_STYLE = [
  "@media print {",
  "  body[data-print-mode='governance-archive-certificate'] * { visibility: hidden !important; }",
  "  body[data-print-mode='governance-archive-certificate'] [data-governance-archive-print],",
  "  body[data-print-mode='governance-archive-certificate'] [data-governance-archive-print] * { visibility: visible !important; }",
  "  body[data-print-mode='governance-archive-certificate'] [data-governance-archive-print] {",
  "    position: absolute !important;",
  "    inset: 0 auto auto 0 !important;",
  "    width: 100% !important;",
  "    margin: 0 !important;",
  "    border: 0 !important;",
  "    border-radius: 0 !important;",
  "    box-shadow: none !important;",
  "    background: white !important;",
  "    color: black !important;",
  "    print-color-adjust: exact;",
  "    -webkit-print-color-adjust: exact;",
  "  }",
  "  body[data-print-mode='governance-archive-certificate'] [data-archive-screen-only] { display: none !important; }",
  "  @page { size: A4 landscape; margin: 12mm; }",
  "}",
].join("\n");

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: value.length === 10 ? undefined : "short",
    calendar: "gregory",
  }).format(date);
}

function verificationItem(
  label: string,
  value: boolean,
  successText: string,
  failureText: string,
) {
  return (
    <div
      className={
        value
          ? "rounded-xl border border-success/20 bg-success/5 p-3"
          : "rounded-xl border border-danger/20 bg-danger/5 p-3"
      }
    >
      <div className="flex items-center gap-2">
        {value ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-danger" />
        )}
        <p className="text-[10px] font-semibold">{label}</p>
      </div>
      <p
        className={
          value
            ? "mt-1 text-[8px] leading-4 text-success"
            : "mt-1 text-[8px] leading-4 text-danger"
        }
      >
        {value ? successText : failureText}
      </p>
    </div>
  );
}

function ArchiveCertificate({
  archive,
  verification,
}: {
  archive: GovernanceAssuranceArchive;
  verification: GovernanceAssuranceArchiveVerification | null;
}) {
  const snapshot = archive.snapshot;
  const review = snapshot.review;
  const signoff = snapshot.signoff;
  const distribution = snapshot.distribution;
  const reservations = signoff.attestations.filter(
    (row) => row.status === "attested_with_reservation",
  ).length;
  const acknowledged = distribution.recipients.filter(
    (row) => row.status !== "pending",
  ).length;

  return (
    <div
      data-governance-archive-print
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-frost)]"
    >
      <header className="border-b border-border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Governance Assurance Archive Certificate
            </p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <Fingerprint className="h-5 w-5 text-brand" />
              {archive.certificate_code}
            </h3>
            <p className="mt-1 text-[8px] text-muted-foreground">
              Sealed {formatDate(archive.archived_at)}
              {" · "}Schema v{arabicNumber(archive.snapshot_schema_version)}
            </p>
          </div>
          <div className="text-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[9px] font-semibold text-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              Archived
            </span>
            {verification && (
              <p
                className={
                  verification.stored_integrity &&
                  verification.source_integrity &&
                  verification.version_match &&
                  verification.lifecycle_match
                    ? "mt-1 text-[8px] text-success"
                    : "mt-1 text-[8px] text-danger"
                }
              >
                Verified {formatDate(verification.verified_at)}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-3 border-b border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">Review</p>
          <p className="mt-1 text-[10px] font-semibold">
            {review.period_label}
          </p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            {formatDate(review.review_date)} · v{arabicNumber(archive.review_version)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">Sign-off</p>
          <p className="mt-1 text-[10px] font-semibold">{signoff.status}</p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            {arabicNumber(signoff.attestations.length)} signer(s)
            {" · "}{arabicNumber(reservations)} reservation(s)
            {" · v"}{arabicNumber(archive.signoff_version)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">Distribution</p>
          <p className="mt-1 text-[10px] font-semibold">
            {distribution.status}
          </p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            {arabicNumber(acknowledged)} /{" "}
            {arabicNumber(distribution.recipients.length)} acknowledged
            {" · v"}{arabicNumber(archive.distribution_version)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[8px] text-muted-foreground">
            Assurance Conclusion
          </p>
          <p className="mt-1 text-[10px] font-semibold">
            {review.assurance_conclusion}
          </p>
          <p className="mt-1 text-[8px] text-muted-foreground">
            Target v{arabicNumber(review.target_version)}
          </p>
        </div>
      </section>

      <section className="border-b border-border p-5">
        <p className="text-xs font-semibold">SHA-256 Integrity Seal</p>
        <p className="mt-2 break-all rounded-xl border border-border bg-background p-3 font-mono text-[8px] leading-4">
          {archive.snapshot_sha256}
        </p>
        <p className="mt-2 text-[8px] leading-4 text-muted-foreground">
          This hash seals the archived Review + Sign-off + Distribution
          snapshot. Verification recomputes both the stored certificate
          snapshot and the current source lifecycle independently.
        </p>
      </section>

      {verification && (
        <section className="grid gap-3 border-b border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
          {verificationItem(
            "Certificate Integrity",
            verification.stored_integrity,
            "Stored archive snapshot matches its sealed SHA-256.",
            "Stored archive snapshot no longer matches the sealed SHA-256.",
          )}
          {verificationItem(
            "Source Integrity",
            verification.source_integrity,
            "Current source lifecycle matches the archived snapshot.",
            "Current source lifecycle differs from the archived snapshot.",
          )}
          {verificationItem(
            "Version Match",
            verification.version_match,
            "Review, Sign-off and Distribution versions still match.",
            "At least one source version differs from the archived version.",
          )}
          {verificationItem(
            "Lifecycle Match",
            verification.lifecycle_match,
            "Review is Finalized, Sign-off Completed and Distribution Closed.",
            "The current lifecycle state no longer matches the archived closure.",
          )}
        </section>
      )}

      <section className="grid gap-4 p-5 lg:grid-cols-3">
        <div>
          <p className="text-xs font-semibold">Review Summary</p>
          <p className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-muted-foreground">
            {review.summary}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold">Signatories</p>
          <div className="mt-2 space-y-2">
            {signoff.attestations.map((item) => (
              <div key={item.id} className="text-[8px] leading-4">
                <strong>
                  {item.role === "prepared_by"
                    ? "Prepared"
                    : item.role === "reviewed_by"
                      ? "Reviewed"
                      : "Approved"}
                  :
                </strong>{" "}
                {item.assignee_name_snapshot} · {item.status}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold">Distribution Closure</p>
          <p className="mt-2 text-[8px] leading-4 text-muted-foreground">
            Distributed {formatDate(distribution.distributed_at)}
            <br />
            Closed {formatDate(distribution.closed_at)}
            <br />
            Recipients {arabicNumber(distribution.recipients.length)}
            <br />
            Acknowledged {arabicNumber(acknowledged)}
          </p>
        </div>
      </section>

      <footer className="border-t border-border p-4 text-[8px] leading-4 text-muted-foreground">
        Certificate ID: <strong>{archive.certificate_code}</strong>
        {" · "}Archive ID: {archive.id}
      </footer>
    </div>
  );
}

export function ExecutiveGovernanceAssuranceArchiveVault() {
  const archives = useGovernanceAssuranceArchives();
  const verify = useVerifyGovernanceAssuranceArchive();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verification, setVerification] =
    useState<GovernanceAssuranceArchiveVerification | null>(null);

  const selected = useMemo(
    () =>
      archives.data?.archives.find((row) => row.id === selectedId) ??
      archives.data?.archives[0] ??
      null,
    [archives.data?.archives, selectedId],
  );

  if (archives.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Archive className="h-4 w-4 animate-pulse text-brand" />
          جاري تحميل Assurance Archive Vault…
        </div>
      </section>
    );
  }

  const rows = archives.data?.archives ?? [];

  function printCertificate() {
    if (!selected) return;
    document.body.dataset.printMode = "governance-archive-certificate";
    const cleanup = () => {
      delete document.body.dataset.printMode;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  async function copyHash() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.snapshot_sha256);
      toast.success("تم نسخ SHA-256.");
    } catch {
      toast.error("تعذر نسخ SHA-256.");
    }
  }

  return (
    <section className="space-y-4">
      <style>{ARCHIVE_PRINT_STYLE}</style>

      <div
        data-archive-screen-only
        className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="h-4 w-4 text-brand" />
              Governance Assurance Archive Vault
            </h3>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
              كل Distribution مغلقة تُختم تلقائيًا بشهادة ثابتة وSHA-256.
              Verify يفحص الشهادة نفسها ثم يقارنها بالمصادر الحالية بشكل مستقل.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[9px] text-muted-foreground">
              {arabicNumber(rows.length)} archived cycle(s)
            </span>
          </div>
        </div>

        {!rows.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            لا توجد Archive Certificates بعد. يتم إنشاء الشهادة تلقائيًا عند
            إغلاق Distribution Register.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              {rows.map((archive) => (
                <button
                  key={archive.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(archive.id);
                    setVerification(null);
                  }}
                  className={
                    selected?.id === archive.id
                      ? "w-full rounded-xl border border-brand/30 bg-brand/[0.04] p-3 text-start"
                      : "w-full rounded-xl border border-border bg-background p-3 text-start hover:bg-muted/30"
                  }
                >
                  <div className="flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-success" />
                    <p className="truncate text-[10px] font-semibold">
                      {archive.certificate_code}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-[9px] text-muted-foreground">
                    {archive.snapshot.review.period_label}
                  </p>
                  <p className="mt-1 text-[8px] text-muted-foreground">
                    {formatDate(archive.archived_at)}
                  </p>
                </button>
              ))}
            </div>

            {selected && (
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[9px] text-muted-foreground">
                      Selected Certificate
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {selected.certificate_code}
                    </p>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      {selected.snapshot.review.period_label}
                      {" · "}{formatDate(selected.archived_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={verify.isPending}
                      onClick={() =>
                        verify.mutate(selected.id, {
                          onSuccess: setVerification,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                    >
                      <RefreshCw
                        className={
                          verify.isPending
                            ? "h-3.5 w-3.5 animate-spin"
                            : "h-3.5 w-3.5"
                        }
                      />
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={copyHash}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      Copy SHA
                    </button>
                    <button
                      type="button"
                      onClick={printCertificate}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print Certificate
                    </button>
                  </div>
                </div>

                <p className="mt-3 break-all rounded-lg border border-border p-3 font-mono text-[8px] leading-4 text-muted-foreground">
                  {selected.snapshot_sha256}
                </p>

                {verification && verification.archive.id === selected.id && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {verificationItem(
                      "Certificate Integrity",
                      verification.stored_integrity,
                      "Valid stored seal",
                      "Stored seal mismatch",
                    )}
                    {verificationItem(
                      "Source Integrity",
                      verification.source_integrity,
                      "Live source still matches",
                      "Live source differs",
                    )}
                    {verificationItem(
                      "Version Match",
                      verification.version_match,
                      "Versions match archive",
                      "Version mismatch detected",
                    )}
                    {verificationItem(
                      "Lifecycle Match",
                      verification.lifecycle_match,
                      "Lifecycle remains closed",
                      "Lifecycle state mismatch",
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <ArchiveCertificate
          archive={selected}
          verification={
            verification?.archive.id === selected.id
              ? verification
              : null
          }
        />
      )}
    </section>
  );
}
