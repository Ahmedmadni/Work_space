import {
  BadgeCheck,
  CircleSlash2,
  ClipboardSignature,
  LockKeyhole,
  Save,
  ShieldCheck,
  UserCheck,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  useActOnGovernanceAssuranceAttestation,
  useGovernanceAssuranceSignoffs,
  useSaveGovernanceAssuranceSignoffPlan,
} from "@/hooks/use-governance-assurance";
import { arabicNumber } from "@/lib/format";
import { buildGovernanceAssuranceSignatoryCandidates } from "@/services/governance-assurance.service";
import type { ExecutiveMeetingGovernanceData } from "@/types/executive-meetings";
import type {
  ExecutiveGovernanceReviewsData,
  GovernanceAssuranceAttestationInboxItem,
  GovernanceAssuranceAttestationRole,
  GovernanceAssuranceAttestationStatus,
  GovernanceAssuranceSignoff,
} from "@/types/governance-assurance";

const ROLE_LABELS: Record<GovernanceAssuranceAttestationRole, string> = {
  prepared_by: "Prepared By",
  reviewed_by: "Reviewed By",
  approved_by: "Approved By",
};

const STATUS_LABELS: Record<GovernanceAssuranceAttestationStatus, string> = {
  pending: "Pending",
  attested: "Attested",
  attested_with_reservation: "Attested with Reservation",
  declined: "Declined",
};

const ROLE_ORDER: GovernanceAssuranceAttestationRole[] = [
  "prepared_by",
  "reviewed_by",
  "approved_by",
];

interface PlanDraft {
  prepared_by: string;
  reviewed_by: string;
  approved_by: string;
}

interface ActionDraft {
  attestation_id: string;
  decision: "attested" | "attested_with_reservation" | "declined";
  statement: string;
  reservation: string;
}

function emptyPlan(): PlanDraft {
  return {
    prepared_by: "",
    reviewed_by: "",
    approved_by: "",
  };
}

function statusTone(status: GovernanceAssuranceAttestationStatus) {
  if (status === "attested") return "bg-success/10 text-success";
  if (status === "attested_with_reservation") {
    return "bg-warning/10 text-warning";
  }
  if (status === "declined") return "bg-danger/10 text-danger";
  return "bg-muted text-muted-foreground";
}

function signoffTone(status: GovernanceAssuranceSignoff["status"]) {
  if (status === "completed") return "bg-success/10 text-success";
  if (status === "declined") return "bg-danger/10 text-danger";
  return "bg-info/10 text-info";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    calendar: "gregory",
  }).format(date);
}

function signoffFromPlan(
  signoff: GovernanceAssuranceSignoff | null,
): PlanDraft {
  const draft = emptyPlan();
  if (!signoff) return draft;
  for (const item of signoff.attestations) {
    draft[item.role] = item.assignee_user_id;
  }
  return draft;
}

export function ExecutiveGovernanceAssuranceSignoff({
  reviewData,
  meetingData,
}: {
  reviewData: ExecutiveGovernanceReviewsData;
  meetingData: ExecutiveMeetingGovernanceData;
}) {
  const signoffs = useGovernanceAssuranceSignoffs();
  const savePlan = useSaveGovernanceAssuranceSignoffPlan();
  const act = useActOnGovernanceAssuranceAttestation();

  const finalizedReviews = useMemo(
    () =>
      reviewData.reviews
        .filter((row) => row.status === "finalized")
        .slice()
        .sort(
          (a, b) =>
            b.review_date.localeCompare(a.review_date) ||
            (b.finalized_at ?? b.updated_at).localeCompare(
              a.finalized_at ?? a.updated_at,
            ),
        ),
    [reviewData.reviews],
  );

  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const selectedReview =
    finalizedReviews.find((row) => row.id === selectedReviewId) ??
    finalizedReviews[0] ??
    null;

  const ownedSignoff =
    signoffs.data?.owned.find(
      (row) => row.review.id === selectedReview?.id,
    )?.signoff ?? null;

  const candidates = useMemo(
    () =>
      selectedReview
        ? buildGovernanceAssuranceSignatoryCandidates(
            selectedReview,
            meetingData,
          )
        : [],
    [selectedReview, meetingData],
  );

  const [plan, setPlan] = useState<PlanDraft>(emptyPlan());
  const [planSource, setPlanSource] = useState<string | null>(null);
  const planKey = selectedReview
    ? selectedReview.id + ":" + (ownedSignoff?.version ?? "new")
    : "none";

  useEffect(() => {
    if (planSource === planKey) return;
    setPlan(signoffFromPlan(ownedSignoff));
    setPlanSource(planKey);
  }, [planKey, planSource, ownedSignoff]);

  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);

  if (signoffs.isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardSignature className="h-4 w-4 animate-pulse text-brand" />
          جاري تحميل Assurance Sign-off…
        </div>
      </section>
    );
  }

  const signoffData = signoffs.data ?? { owned: [], inbox: [] };
  const assignmentsLocked =
    !!ownedSignoff &&
    (ownedSignoff.status !== "open" ||
      ownedSignoff.attestations.some((row) => row.status !== "pending"));

  const selectedIds = ROLE_ORDER.map((role) => plan[role]).filter(Boolean);
  const canSavePlan =
    !!selectedReview &&
    candidates.length >= 3 &&
    selectedIds.length === 3 &&
    new Set(selectedIds).size === 3 &&
    !assignmentsLocked;

  const candidateMap = new Map(
    candidates.map((candidate) => [candidate.user_id, candidate] as const),
  );

  const inboxPending = signoffData.inbox.filter(
    (row) => row.attestation.status === "pending",
  );

  function startAction(item: GovernanceAssuranceAttestationInboxItem) {
    setActionDraft({
      attestation_id: item.attestation.id,
      decision: "attested",
      statement: "",
      reservation: "",
    });
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardSignature className="h-4 w-4 text-brand" />
              Governance Assurance Attestation & Sign-off
            </h3>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-muted-foreground">
              Prepared → Reviewed → Approved. كل خطوة مرتبطة بحساب مستخدم فعلي،
              والتعيينات تُقفل بمجرد تنفيذ أول Attestation.
            </p>
          </div>

          {!!finalizedReviews.length && (
            <label className="w-full text-[9px] text-muted-foreground lg:max-w-md">
              Finalized Review
              <select
                value={selectedReview?.id ?? ""}
                onChange={(event) => {
                  setSelectedReviewId(event.target.value);
                  setPlanSource(null);
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                {finalizedReviews.map((review) => (
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
            يلزم Finalized Review قبل إنشاء Sign-off Plan.
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[9px]">
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                {selectedReview.period_label}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                Review {formatDate(selectedReview.review_date)}
              </span>
              {ownedSignoff && (
                <span
                  className={
                    "rounded-full px-2.5 py-1 font-semibold " +
                    signoffTone(ownedSignoff.status)
                  }
                >
                  Sign-off {ownedSignoff.status}
                </span>
              )}
            </div>

            {candidates.length < 3 && !ownedSignoff && (
              <div className="mt-3 rounded-xl border border-warning/20 bg-warning/5 p-3 text-[9px] leading-5 text-muted-foreground">
                لا يوجد 3 مستخدمين موثقين مختلفين في اجتماعات المصدر حتى الآن.
                أضف مستخدمين فعليين كحضور/رئيس في الاجتماعات المصدرية ثم أنشئ
                Sign-off Plan. لا يقبل النظام أسماء نصية بدل حسابات فعلية.
              </div>
            )}

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {ROLE_ORDER.map((role, index) => {
                const currentAttestation = ownedSignoff?.attestations.find(
                  (row) => row.role === role,
                );
                const selectedCandidate = candidateMap.get(plan[role]);
                return (
                  <div
                    key={role}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand/10 text-[9px] font-bold text-brand">
                        {arabicNumber(index + 1)}
                      </span>
                      <p className="text-xs font-semibold">
                        {ROLE_LABELS[role]}
                      </p>
                    </div>

                    {assignmentsLocked || ownedSignoff?.status !== "open" ? (
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold">
                          {currentAttestation?.assignee_name_snapshot ?? "—"}
                        </p>
                        <p className="mt-1 text-[8px] text-muted-foreground">
                          {currentAttestation?.assignee_email_snapshot ?? "—"}
                        </p>
                      </div>
                    ) : (
                      <select
                        value={plan[role]}
                        onChange={(event) =>
                          setPlan({ ...plan, [role]: event.target.value })
                        }
                        className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-[10px]"
                      >
                        <option value="">اختر المستخدم</option>
                        {candidates.map((candidate) => (
                          <option
                            key={candidate.user_id}
                            value={candidate.user_id}
                          >
                            {candidate.display_name}
                            {candidate.email ? " · " + candidate.email : ""}
                          </option>
                        ))}
                      </select>
                    )}

                    {selectedCandidate && !currentAttestation && (
                      <p className="mt-2 text-[8px] text-muted-foreground">
                        Source: {selectedCandidate.source}
                      </p>
                    )}

                    {currentAttestation && (
                      <div className="mt-3 border-t border-border pt-3">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[8px] " +
                            statusTone(currentAttestation.status)
                          }
                        >
                          {STATUS_LABELS[currentAttestation.status]}
                        </span>
                        {currentAttestation.acted_at && (
                          <p className="mt-2 text-[8px] text-muted-foreground">
                            {formatDate(currentAttestation.acted_at)}
                          </p>
                        )}
                        {currentAttestation.statement && (
                          <p className="mt-2 whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">
                            {currentAttestation.statement}
                          </p>
                        )}
                        {currentAttestation.reservation && (
                          <div className="mt-2 rounded-lg border border-warning/20 bg-warning/5 p-2 text-[8px] leading-4 text-warning">
                            Reservation: {currentAttestation.reservation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!assignmentsLocked && (
              <button
                type="button"
                disabled={!canSavePlan || savePlan.isPending}
                onClick={() => {
                  if (!selectedReview) return;
                  savePlan.mutate({
                    review_id: selectedReview.id,
                    expected_signoff_version: ownedSignoff?.version ?? null,
                    assignments: ROLE_ORDER.map((role) => {
                      const candidate = candidateMap.get(plan[role])!;
                      return {
                        role,
                        assignee_user_id: candidate.user_id,
                        assignee_name: candidate.display_name,
                        assignee_email: candidate.email,
                      };
                    }),
                  });
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" />
                {ownedSignoff ? "تحديث Sign-off Plan" : "إنشاء Sign-off Plan"}
              </button>
            )}

            {assignmentsLocked && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 p-3 text-[9px] leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                بدأت سلسلة الاعتماد، لذلك تم قفل التعيينات. أي Statement أو
                Reservation أصبحت جزءًا من سجل الاعتماد لهذه Finalized Review.
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-frost)]">
        <div className="flex items-center gap-2">
          <UserRoundCheck className="h-4 w-4 text-brand" />
          <div>
            <h3 className="text-sm font-semibold">My Attestation Inbox</h3>
            <p className="text-[9px] text-muted-foreground">
              يظهر هنا فقط ما أُسند إلى حسابك الحالي.
            </p>
          </div>
          {!!inboxPending.length && (
            <span className="ms-auto rounded-full bg-brand/10 px-2.5 py-1 text-[9px] font-semibold text-brand">
              {arabicNumber(inboxPending.length)} Pending
            </span>
          )}
        </div>

        {!signoffData.inbox.length ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            لا توجد Attestations مسندة إلى حسابك.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {signoffData.inbox.map((item) => (
              <div
                key={item.attestation.id}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold">
                        {item.review.period_label}
                      </p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                        {ROLE_LABELS[item.attestation.role]}
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[8px] " +
                          statusTone(item.attestation.status)
                        }
                      >
                        {STATUS_LABELS[item.attestation.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-[8px] text-muted-foreground">
                      Finalized Review {formatDate(item.review.review_date)}
                      {" · "}Step {arabicNumber(item.attestation.sequence_no)} / 3
                    </p>
                    {!item.can_act &&
                      item.attestation.status === "pending" &&
                      item.signoff.status === "open" && (
                        <p className="mt-2 text-[8px] text-warning">
                          بانتظار إكمال الخطوة السابقة.
                        </p>
                      )}
                  </div>

                  {item.can_act && (
                    <button
                      type="button"
                      onClick={() => startAction(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[9px] font-semibold text-primary-foreground"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      تنفيذ Attestation
                    </button>
                  )}
                </div>

                {item.attestation.statement && (
                  <p className="mt-3 whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">
                    {item.attestation.statement}
                  </p>
                )}
                {item.attestation.reservation && (
                  <div className="mt-2 rounded-lg border border-warning/20 bg-warning/5 p-2 text-[8px] leading-4 text-warning">
                    Reservation: {item.attestation.reservation}
                  </div>
                )}

                {actionDraft?.attestation_id === item.attestation.id && (
                  <div className="mt-3 rounded-xl border border-brand/20 bg-card p-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      {[
                        ["attested", "Attest", BadgeCheck],
                        [
                          "attested_with_reservation",
                          "Attest with Reservation",
                          ShieldCheck,
                        ],
                        ["declined", "Decline", CircleSlash2],
                      ].map(([value, label, Icon]) => (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() =>
                            setActionDraft({
                              ...actionDraft,
                              decision: value as ActionDraft["decision"],
                            })
                          }
                          className={
                            actionDraft.decision === value
                              ? "inline-flex items-center justify-center gap-1 rounded-lg border border-brand bg-brand/10 px-3 py-2 text-[9px] font-semibold text-brand"
                              : "inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-[9px] text-muted-foreground hover:bg-muted"
                          }
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={4}
                      maxLength={8000}
                      value={actionDraft.statement}
                      onChange={(event) =>
                        setActionDraft({
                          ...actionDraft,
                          statement: event.target.value,
                        })
                      }
                      placeholder="Attestation Statement — مطلوب"
                      className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
                    />

                    {actionDraft.decision ===
                      "attested_with_reservation" && (
                      <textarea
                        rows={3}
                        maxLength={8000}
                        value={actionDraft.reservation}
                        onChange={(event) =>
                          setActionDraft({
                            ...actionDraft,
                            reservation: event.target.value,
                          })
                        }
                        placeholder="Reservation — مطلوب"
                        className="mt-2 w-full resize-y rounded-lg border border-warning/30 bg-background px-3 py-2 text-xs"
                      />
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          act.isPending ||
                          !actionDraft.statement.trim() ||
                          (actionDraft.decision ===
                            "attested_with_reservation" &&
                            !actionDraft.reservation.trim())
                        }
                        onClick={() =>
                          act.mutate(
                            {
                              attestation_id: item.attestation.id,
                              expected_version: item.attestation.version,
                              decision: actionDraft.decision,
                              statement: actionDraft.statement,
                              reservation:
                                actionDraft.decision ===
                                "attested_with_reservation"
                                  ? actionDraft.reservation
                                  : null,
                            },
                            { onSuccess: () => setActionDraft(null) },
                          )
                        }
                        className="rounded-lg bg-brand px-3 py-2 text-[9px] font-semibold text-primary-foreground disabled:opacity-40"
                      >
                        تسجيل القرار
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionDraft(null)}
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
