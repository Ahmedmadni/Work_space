import type {
  BenefitForecastWarning,
  ForecastEvidenceStrength,
  ObjectiveForecast,
  ObjectiveStrategyReview,
  PortfolioObjective,
  StrategyReviewData,
} from "@/types/strategy";

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 12));
}

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function progressOf(objective: PortfolioObjective) {
  if (!objective.key_results.length) return null;

  const totalWeight = objective.key_results.reduce(
    (sum, row) => sum + row.weight,
    0,
  );
  if (totalWeight <= 0) return null;

  return (
    objective.key_results.reduce((sum, row) => {
      const denominator =
        row.direction === "increase"
          ? row.target_value - row.baseline_value
          : row.baseline_value - row.target_value;
      const numerator =
        row.direction === "increase"
          ? row.current_value - row.baseline_value
          : row.baseline_value - row.current_value;

      const progress =
        denominator === 0
          ? row.direction === "increase"
            ? row.current_value >= row.target_value
              ? 100
              : 0
            : row.current_value <= row.target_value
              ? 100
              : 0
          : (numerator / denominator) * 100;

      return sum + clampProgress(progress) * row.weight;
    }, 0) / totalWeight
  );
}

function validReviews(
  objectiveId: string,
  reviews: ObjectiveStrategyReview[],
) {
  const rows = reviews
    .filter(
      (row) =>
        row.objective_id === objectiveId &&
        row.objective_progress_snapshot != null &&
        Number.isFinite(row.objective_progress_snapshot),
    )
    .slice()
    .sort((a, b) => {
      const byDate = a.review_date.localeCompare(b.review_date);
      return byDate !== 0
        ? byDate
        : a.created_at.localeCompare(b.created_at);
    });

  const byDate = new Map<string, ObjectiveStrategyReview>();
  for (const row of rows) byDate.set(row.review_date, row);

  return [...byDate.values()].slice(-6);
}

function linearDailyRate(rows: ObjectiveStrategyReview[]) {
  if (rows.length < 2) return null;

  const first = dateFromKey(rows[0]!.review_date);
  const points = rows.map((row) => ({
    x: diffDays(first, dateFromKey(row.review_date)),
    y: row.objective_progress_snapshot!,
  }));

  const meanX =
    points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY =
    points.reduce((sum, point) => sum + point.y, 0) / points.length;

  const numerator = points.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  );
  const denominator = points.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0,
  );

  if (denominator <= 0) return null;
  return numerator / denominator;
}

function evidenceStrength(
  count: number,
  historySpanDays: number,
): ForecastEvidenceStrength {
  if (count >= 4 && historySpanDays >= 30) return "high";
  if (count >= 3 && historySpanDays >= 14) return "medium";
  return "low";
}

export function buildObjectiveForecast(
  objective: PortfolioObjective,
  reviews: ObjectiveStrategyReview[],
  now = todayUtc(),
): ObjectiveForecast {
  const rows = validReviews(objective.id, reviews);
  const liveProgress = progressOf(objective);
  const latestReview = rows.at(-1) ?? null;
  const historySpanDays =
    rows.length >= 2
      ? diffDays(
          dateFromKey(rows[0]!.review_date),
          dateFromKey(rows.at(-1)!.review_date),
        )
      : 0;
  const rate = linearDailyRate(rows);
  const dueDate = objective.due_date
    ? dateFromKey(objective.due_date)
    : null;
  const daysToDue = dueDate ? diffDays(now, dueDate) : null;

  const points = rows.map((row) => ({
    review_id: row.id,
    review_date: row.review_date,
    progress: row.objective_progress_snapshot!,
  }));

  const achieved =
    objective.status === "achieved" ||
    (liveProgress != null && liveProgress >= 100);

  if (achieved) {
    return {
      objective_id: objective.id,
      status: "achieved",
      latest_progress: liveProgress,
      latest_review_date: latestReview?.review_date ?? null,
      review_count: rows.length,
      history_span_days: historySpanDays,
      daily_progress_rate: rate,
      projected_due_progress: 100,
      projected_completion_date: dateKey(now),
      days_to_due: daysToDue,
      evidence_strength: evidenceStrength(rows.length, historySpanDays),
      points,
    };
  }

  if (dueDate && daysToDue != null && daysToDue < 0) {
    return {
      objective_id: objective.id,
      status: "overdue",
      latest_progress: liveProgress,
      latest_review_date: latestReview?.review_date ?? null,
      review_count: rows.length,
      history_span_days: historySpanDays,
      daily_progress_rate: rate,
      projected_due_progress: liveProgress,
      projected_completion_date: null,
      days_to_due: daysToDue,
      evidence_strength: evidenceStrength(rows.length, historySpanDays),
      points,
    };
  }

  const hasTrend =
    rows.length >= 2 &&
    historySpanDays > 0 &&
    rate != null &&
    liveProgress != null;

  if (!hasTrend) {
    return {
      objective_id: objective.id,
      status: "insufficient_data",
      latest_progress: liveProgress,
      latest_review_date: latestReview?.review_date ?? null,
      review_count: rows.length,
      history_span_days: historySpanDays,
      daily_progress_rate: rate,
      projected_due_progress: null,
      projected_completion_date: null,
      days_to_due: daysToDue,
      evidence_strength: evidenceStrength(rows.length, historySpanDays),
      points,
    };
  }

  const projectedDueProgress =
    daysToDue == null
      ? null
      : clampProgress(liveProgress + rate * Math.max(0, daysToDue));

  const projectedCompletionDate =
    rate > 0 && liveProgress < 100
      ? dateKey(addDays(now, Math.ceil((100 - liveProgress) / rate)))
      : rate > 0
        ? dateKey(now)
        : null;

  if (rate <= 0) {
    return {
      objective_id: objective.id,
      status: "stalled",
      latest_progress: liveProgress,
      latest_review_date: latestReview?.review_date ?? null,
      review_count: rows.length,
      history_span_days: historySpanDays,
      daily_progress_rate: rate,
      projected_due_progress: projectedDueProgress,
      projected_completion_date: projectedCompletionDate,
      days_to_due: daysToDue,
      evidence_strength: evidenceStrength(rows.length, historySpanDays),
      points,
    };
  }

  if (!dueDate || daysToDue == null) {
    return {
      objective_id: objective.id,
      status: "insufficient_data",
      latest_progress: liveProgress,
      latest_review_date: latestReview?.review_date ?? null,
      review_count: rows.length,
      history_span_days: historySpanDays,
      daily_progress_rate: rate,
      projected_due_progress: projectedDueProgress,
      projected_completion_date: projectedCompletionDate,
      days_to_due: daysToDue,
      evidence_strength: evidenceStrength(rows.length, historySpanDays),
      points,
    };
  }

  const projectedCompletion = projectedCompletionDate
    ? dateFromKey(projectedCompletionDate)
    : null;
  const late =
    !projectedCompletion ||
    projectedCompletion.getTime() > dueDate.getTime() ||
    (projectedDueProgress != null && projectedDueProgress < 100);

  return {
    objective_id: objective.id,
    status: late ? "projected_late" : "projected_on_time",
    latest_progress: liveProgress,
    latest_review_date: latestReview?.review_date ?? null,
    review_count: rows.length,
    history_span_days: historySpanDays,
    daily_progress_rate: rate,
    projected_due_progress: projectedDueProgress,
    projected_completion_date: projectedCompletionDate,
    days_to_due: daysToDue,
    evidence_strength: evidenceStrength(rows.length, historySpanDays),
    points,
  };
}

export function buildPortfolioForecasts(
  objectives: PortfolioObjective[],
  reviewData: StrategyReviewData | undefined,
) {
  return objectives.map((objective) =>
    buildObjectiveForecast(objective, reviewData?.reviews ?? []),
  );
}

export function buildBenefitForecastWarnings(
  objectives: PortfolioObjective[],
  reviewData: StrategyReviewData | undefined,
  forecasts: ObjectiveForecast[],
): BenefitForecastWarning[] {
  if (!reviewData) return [];

  const today = dateKey(todayUtc());
  const forecastMap = new Map(
    forecasts.map((forecast) => [forecast.objective_id, forecast] as const),
  );
  const objectiveMap = new Map(
    objectives.map((objective) => [objective.id, objective] as const),
  );

  const warnings: BenefitForecastWarning[] = [];

  for (const benefit of reviewData.benefits) {
    if (
      benefit.status === "realized" ||
      benefit.status === "not_realized" ||
      !benefit.target_date
    ) {
      continue;
    }

    if (benefit.target_date < today) {
      warnings.push({
        benefit_id: benefit.id,
        objective_id: benefit.objective_id,
        severity: "critical",
        reason: "overdue",
      });
      continue;
    }

    const objective = objectiveMap.get(benefit.objective_id);
    const forecast = forecastMap.get(benefit.objective_id);
    if (!objective || !forecast) continue;

    const daysUntilBenefit = diffDays(
      todayUtc(),
      dateFromKey(benefit.target_date),
    );
    if (daysUntilBenefit > 30) continue;

    if (forecast.status === "stalled") {
      warnings.push({
        benefit_id: benefit.id,
        objective_id: benefit.objective_id,
        severity: "warning",
        reason: "objective_stalled",
      });
    } else if (
      forecast.status === "projected_late" ||
      forecast.status === "overdue"
    ) {
      warnings.push({
        benefit_id: benefit.id,
        objective_id: benefit.objective_id,
        severity: "warning",
        reason: "objective_projected_late",
      });
    }
  }

  return warnings;
}
