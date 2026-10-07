import {
  Archive,
  BadgeCheck,
  CheckCircle2,
  MailCheck,
  PackageCheck,
  Save,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  useAcknowledgeGovernanceAssuranceDistribution,
  useCloseGovernanceAssuranceDistribution,
  useDistributeGovernanceAssurancePack,
  useGovernanceAssuranceDistributions,
  useGovernanceAssuranceSignoffs,
  useSaveGovernanceAssuranceDistributionPlan,
} from "@/hooks/use-governance-assurance";
import { arabicNumber } from "@/lib/format";
import { buildGovernanceAssuranceSignatoryCandidates } from "@/services/governance-assurance.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  ExecutiveGovernanceReviewsData,
  GovernanceAssuranceDistribution,
  GovernanceAssuranceDistributionInboxItem,
  GovernanceAssuranceDistributionRecipientStatus,
} from "@/types/governance-assurance";

interface DistributionDraft {
  note: string;
  recipientIds: string[];
}

interface DistributionCandidate {
  user_id: string;
  display_name: string;
  email: string | null;
  source: "attendee" | "chair" | "creator" | "saved_distribution";
}

interface AckDraft {
  recipient_id: string;
  decision: "acknowledged" | "acknowledged_with_note";
  note: string;
}

const RECIPIENT_STATUS_LABELS: Record<
  GovernanceAssuranceDistributionRecipientStatus,
  string
> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  acknowledged_with_note: "Acknowledged with Note",
};

function statusTone(status: GovernanceAssuranceDistributionRecipientStatus) {
  if (status === "pending") return "bg-warning/10 text-warning";
  if (status === "acknowledged_with_note") {
    return "bg-info/10 text-info";
  }
  return "bg-success/10 text-success";
}

function distributionTone(status: GovernanceAssuranceDistribution["status"]) {
  if (status === "closed") return "bg-success/10 text-success";
  if (status === "distributed") return "bg-info/10 text-info";
  return "bg-muted text-muted-foreground";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(date);
}

export function ExecutiveGovernanceAssuranceDistribution({
  reviewData,
  meetingData,
}: {
  reviewData: ExecutiveGovernanceReviewsData;
  meetingData: ExecutiveMeetingGovernanceData;
}) {
  const distributions = useGovernanceAssuranceDistributions();
  const signoffs = useGovernanceAssuranceSignoffs();
  const savePlan = useSaveGovernanceAssuranceDistributionPlan();
  const distribute = useDistributeGovernanceAssurancePack();
  const acknowledge = useAcknowledgeGovernanceAssuranceDistribution();
  const close = useCloseGovernanceAssuranceDistribution();

  const eligibleReviews = useMemo(() => {
    const completedReviewIds = new Set(
      (signoffs.data?.owned ?? [])
        .filter((row) => row.signoff.status === "completed")
        .map((row) => row.review.id),
    );
    return reviewData.reviews
      .filter(
        (review) =>
          review.status === "finalized" &&
          completedReviewIds.has(review.id),
      )
      .slice()
      .sort(
        (a, b) =>
          b.review_date.localeCompare(a.review_date) ||
          (b.finalized_at ?? b.updated_at).localeCompare(
            a.finalized_at ?? a.updated_at,
          ),
      );
  }, [reviewData.reviews, signoffs.data?.owned]);

  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const selectedReview =
    eligibleReviews.find((row) => row.id === selectedReviewId) ??
    eligibleReviews[0] ??
    null;

  const ownedDistribution =
    distributions.data?.owned.find(
      (row) => row.review.id === selectedReview?.id,
    )?.distribution ?? null;

  const sourceCandidates = useMemo<DistributionCandidate[]>(
    () =>
      selectedReview
        ? buildGovernanceAssuranceSignatoryCandidates(
            selectedReview,
            meetingData,
          )
        : [],
    [selectedReview, meetingData],
  );

  const availableCandidates = useMemo<DistributionCandidate[]>(() => {
    const merged = new Map<string, DistributionCandidate>();

    for (const candidate of sourceCandidates) {
      merged.set(candidate.user_id, candidate);
    }

    for (const recipient of ownedDistribution?.recipients ?? []) {
      if (merged.has(recipient.recipient_user_id)) continue;
      merged.set(recipient.recipient_user_id, {
        user_id: recipient.recipient_user_id,
        display_name: recipient.recipient_name_snapshot,
        email: recipient.recipient_email_snapshot,
        source: "saved_distribution",
      });
    }

    return [...merged.values()].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "ar"),
    );
  }, [sourceCandidates, ownedDistribution?.recipients]);

  const [draft, setDraft] = useState<DistributionDraft>({
    note: "",
    recipientIds: [],
  });
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const draftKey = selectedReview
    ? selectedReview.id + ":" + (ownedDistribution?.version ?? "new")
    : "none";

  useEffect(() => {
    if (draftSource === draftKey) return;
    setDraft({
      note: ownedDistribution?.distribution_note ?? "",
      recipientIds:
        ownedDistribution?.recipients.map(
          (recipient) => recipient.recipient_user_id,
        ) ?? [],
    });
    setDraftSource(draftKey);
  }, [draftKey, draftSource, ownedDistribution]);

  const [ackDraft, setAckDraft] = useState<AckDraft | null>(null);

  if (distributions.isLoading || signoffs.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Send className="h-4 w-4 animate-pulse text-brand" />
          جاري تحميل Assurance Distribution Register…
        </div>
      </section>
    );
  }

  const distributionData = distributions.data ?? { owned: [], inbox: [] };
  const editable = !ownedDistribution || ownedDistribution.status === "draft";
  const selectedSet = new Set(draft.recipientIds);
  const availableCandidateMap = new Map(
    availableCandidates.map((candidate) => [
      candidate.user_id,
      candidate,
    ] as const),
  );
  const hasUnknownSelectedRecipients = draft.recipientIds.some(
    (userId) => !availableCandidateMap.has(userId),
  );
  const canSave =
    !!selectedReview &&
    editable &&
    draft.recipientIds.length >= 1 &&
    draft.recipientIds.length <= 100 &&
    new Set(draft.recipientIds).size === draft.recipientIds.length &&
    !hasUnknownSelectedRecipients;

  const pendingCount =
    ownedDistribution?.recipients.filter((row) => row.status === "pending")
      .length ?? 0;
  const acknowledgedCount =
    ownedDistribution?.recipients.filter((row) => row.status !== "pending")
      .length ?? 0;

  function toggleRecipient(userId: string) {
    setDraft((current) => ({
      ...current,
      recipientIds: current.recipientIds.includes(userId)
        ? current.recipientIds.filter((id) => id !== userId)
        : [...current.recipientIds, userId],
    }));
  }

  function startAcknowledgement(
    item: GovernanceAssuranceDistributionInboxItem,
  ) {
    setAckDraft({
      recipient_id: item.recipient.id,
      decision: "acknowledged",
      note: "",
    });
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <PackageCheck className="h-4 w-4 text-brand" />
              Assurance Closure & Distribution Register
            </h3>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
              Distribution لا تبدأ إلا بعد Completed Sign-off. بعد الإرسال تُقفل
              قائمة المستلمين، ويجب انتهاء كل Pending Acknowledgements قبل Closure.
            </p>
          </div>

          {!!eligibleReviews.length && (
            <label className="w-full text-[9px] text-muted-foreground lg:max-w-md">
              Completed Assurance Review
              <select
                value={selectedReview?.id ?? ""}
                onChange={(event) => {
                  setSelectedReviewId(event.target.value);
                  setDraftSource(null);
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {eligibleReviews.map((review) => (
                  <option key={review.id} value={review.id}>
                    {review.period_label} · {review.review_date}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!selectedReview ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            يلزم Finalized Review مع Completed Sign-off قبل إنشاء Distribution Register.
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-[8px] text-muted-foreground">
                {selectedReview.period_label}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[8px] text-muted-foreground">
                Review {formatDate(selectedReview.review_date)}
              </span>
              {ownedDistribution && (
                <span
                  className={
                    "rounded-full px-2.5 py-1 text-[8px] font-semibold " +
                    distributionTone(ownedDistribution.status)
                  }
                >
                  Distribution {ownedDistribution.status}
                </span>
              )}
            </div>

            {ownedDistribution && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Recipients</p>
                  <p className="mt-1 text-lg font-bold">
                    {arabicNumber(ownedDistribution.recipients.length)}
                  </p>
                </div>
                <div className="rounded-lg border border-warning/20 bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Pending</p>
                  <p className="mt-1 text-lg font-bold text-warning">
                    {arabicNumber(pendingCount)}
                  </p>
                </div>
                <div className="rounded-lg border border-success/20 bg-background p-3">
                  <p className="text-[8px] text-muted-foreground">Acknowledged</p>
                  <p className="mt-1 text-lg font-bold text-success">
                    {arabicNumber(acknowledgedCount)}
                  </p>
                </div>
              </div>
            )}

            <label className="mt-4 block text-[9px] text-muted-foreground">
              Distribution Note
              <textarea
                rows={3}
                maxLength={8000}
                disabled={!editable}
                value={draft.note}
                onChange={(event) =>
                  setDraft({ ...draft, note: event.target.value })
                }
                placeholder="ملاحظة التوزيع — اختياري"
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs disabled:opacity-60"
              />
            </label>

            <div className="mt-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand" />
                <p className="text-xs font-semibold">Recipients</p>
                <span className="text-[8px] text-muted-foreground">
                  {arabicNumber(draft.recipientIds.length)} selected
                </span>
              </div>

              {!availableCandidates.length ? (
                <div className="mt-2 rounded-xl border border-warning/20 bg-warning/5 p-3 text-[9px] text-muted-foreground">
                  لا توجد حسابات مستخدمين موثقة في اجتماعات المصدر لإضافتها إلى
                  Distribution Register.
                </div>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availableCandidates.map((candidate) => {
                    const checked = selectedSet.has(candidate.user_id);
                    const existingRecipient =
                      ownedDistribution?.recipients.find(
                        (row) =>
                          row.recipient_user_id === candidate.user_id,
                      );
                    return (
                      <label
                        key={candidate.user_id}
                        className={
                          checked
                            ? "flex cursor-pointer items-start gap-2 rounded-xl border border-brand/30 bg-brand/[0.04] p-3"
                            : "flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-background p-3"
                        }
                      >
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={checked}
                          onChange={() => toggleRecipient(candidate.user_id)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[10px] font-semibold">
                            {candidate.display_name}
                          </span>
                          <span className="mt-1 block truncate text-[8px] text-muted-foreground">
                            {candidate.email ??
                              (candidate.source === "saved_distribution"
                                ? "Saved recipient snapshot"
                                : candidate.source)}
                          </span>
                          {existingRecipient && (
                            <span
                              className={
                                "mt-2 inline-flex rounded-full px-2 py-0.5 text-[8px] " +
                                statusTone(existingRecipient.status)
                              }
                            >
                              {RECIPIENT_STATUS_LABELS[existingRecipient.status]}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {hasUnknownSelectedRecipients && (
              <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 p-3 text-[9px] leading-5 text-muted-foreground">
                يوجد Recipient ID محدد لا يمكن ربطه بقائمة المصدر الحالية أو
                بالـDistribution snapshot المحفوظ. أزل هذا الاختيار قبل الحفظ؛
                النظام لن يخمّن هوية المستلم.
              </div>
            )}

            {editable && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canSave || savePlan.isPending}
                  onClick={() => {
                    if (!selectedReview) return;
                    if (hasUnknownSelectedRecipients) return;
                    savePlan.mutate({
                      review_id: selectedReview.id,
                      expected_distribution_version:
                        ownedDistribution?.version ?? null,
                      distribution_note: draft.note || null,
                      recipients: draft.recipientIds.map((userId) => {
                        const candidate = availableCandidateMap.get(userId);
                        if (!candidate) {
                          throw new Error(
                            "تعذر ربط Recipient بالهوية المحفوظة.",
                          );
                        }
                        return {
                          recipient_user_id: candidate.user_id,
                          recipient_name: candidate.display_name,
                          recipient_email: candidate.email,
                        };
                      }),
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[10px] font-semibold hover:bg-muted disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" />
                  {ownedDistribution ? "تحديث Register" : "حفظ Register"}
                </button>

                {ownedDistribution?.status === "draft" && (
                  <button
                    type="button"
                    disabled={
                      distribute.isPending ||
                      ownedDistribution.recipients.length < 1
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Distribution سيقفل قائمة المستلمين. هل تريد المتابعة؟",
                        )
                      ) {
                        return;
                      }
                      distribute.mutate({
                        distributionId: ownedDistribution.id,
                        expectedVersion: ownedDistribution.version,
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Distribute & Lock
                  </button>
                )}
              </div>
            )}

            {ownedDistribution?.status === "distributed" && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-info/20 bg-info/5 p-3 md:flex-row md:items-center md:justify-between">
                <div className="text-[9px] leading-5 text-muted-foreground">
                  Distributed {formatDate(ownedDistribution.distributed_at)}.
                  {pendingCount > 0
                    ? " ما زالت هناك Pending Acknowledgements."
                    : " جميع المستلمين سجلوا Acknowledgement ويمكن إغلاق الدورة."}
                </div>
                <button
                  type="button"
                  disabled={pendingCount > 0 || close.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "سيتم إغلاق Distribution Register نهائيًا. هل تريد المتابعة؟",
                      )
                    ) {
                      return;
                    }
                    close.mutate({
                      distributionId: ownedDistribution.id,
                      expectedVersion: ownedDistribution.version,
                    });
                  }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-success px-3 py-2 text-[9px] font-semibold text-white disabled:opacity-40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Close Distribution
                </button>
              </div>
            )}

            {ownedDistribution?.status === "closed" && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-[9px] leading-5 text-muted-foreground">
                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                Distribution Register مغلق منذ{" "}
                {formatDate(ownedDistribution.closed_at)}، وقائمة المستلمين
                والـAcknowledgements أصبحت سجلًا نهائيًا لهذه الدورة.
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2">
          <MailCheck className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">My Distribution Inbox</h3>
            <p className="text-[9px] text-muted-foreground">
              Packs الموزعة على حسابك الحالي فقط.
            </p>
          </div>
        </div>

        {!distributionData.inbox.length ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            لا توجد Assurance Packs موزعة على حسابك.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {distributionData.inbox.map((item) => (
              <div
                key={item.recipient.id}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold">
                        {item.review.period_label}
                      </p>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[8px] " +
                          statusTone(item.recipient.status)
                        }
                      >
                        {RECIPIENT_STATUS_LABELS[item.recipient.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      Review {formatDate(item.review.review_date)}
                      {" · Distributed "}
                      {formatDate(item.distribution.distributed_at)}
                    </p>
                    {item.distribution.distribution_note && (
                      <p className="mt-2 whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">
                        {item.distribution.distribution_note}
                      </p>
                    )}
                  </div>

                  {item.can_acknowledge && (
                    <button
                      type="button"
                      onClick={() => startAcknowledgement(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[9px] font-semibold text-primary-foreground"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Acknowledge
                    </button>
                  )}
                </div>

                {item.recipient.acknowledgement_note && (
                  <div className="mt-2 rounded-lg border border-info/20 bg-info/5 p-2 text-[8px] leading-4 text-info">
                    Note: {item.recipient.acknowledgement_note}
                  </div>
                )}

                {ackDraft?.recipient_id === item.recipient.id && (
                  <div className="mt-3 rounded-xl border border-brand/20 bg-card p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setAckDraft({
                            ...ackDraft,
                            decision: "acknowledged",
                          })
                        }
                        className={
                          ackDraft.decision === "acknowledged"
                            ? "rounded-lg border border-brand bg-brand/10 px-3 py-2 text-[9px] font-semibold text-brand"
                            : "rounded-lg border border-border px-3 py-2 text-[9px] text-muted-foreground hover:bg-muted"
                        }
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAckDraft({
                            ...ackDraft,
                            decision: "acknowledged_with_note",
                          })
                        }
                        className={
                          ackDraft.decision === "acknowledged_with_note"
                            ? "rounded-lg border border-brand bg-brand/10 px-3 py-2 text-[9px] font-semibold text-brand"
                            : "rounded-lg border border-border px-3 py-2 text-[9px] text-muted-foreground hover:bg-muted"
                        }
                      >
                        Acknowledge with Note
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      maxLength={8000}
                      value={ackDraft.note}
                      onChange={(event) =>
                        setAckDraft({ ...ackDraft, note: event.target.value })
                      }
                      placeholder={
                        ackDraft.decision === "acknowledged_with_note"
                          ? "Acknowledgement Note — مطلوب"
                          : "ملاحظة — اختياري"
                      }
                      className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
                    />

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={
                          acknowledge.isPending ||
                          (ackDraft.decision ===
                            "acknowledged_with_note" &&
                            !ackDraft.note.trim())
                        }
                        onClick={() =>
                          acknowledge.mutate(
                            {
                              recipient_id: item.recipient.id,
                              expected_version: item.recipient.version,
                              decision: ackDraft.decision,
                              note: ackDraft.note || null,
                            },
                            { onSuccess: () => setAckDraft(null) },
                          )
                        }
                        className="rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                      >
                        تسجيل Acknowledgement
                      </button>
                      <button
                        type="button"
                        onClick={() => setAckDraft(null)}
                        className="rounded-lg border border-border px-3 py-2 text-[9px] hover:bg-muted"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
