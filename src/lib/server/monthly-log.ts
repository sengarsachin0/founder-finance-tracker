import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recomputes and upserts the revenue_monthly_logs row for a given vertical + month/year.
 * Call this after any create / update / delete of daily_revenue_entries.
 */
export async function upsertMonthlyLog(
  supabase: SupabaseClient,
  vertical_id: string,
  month: number,
  year: number
): Promise<void> {
  const m = String(month).padStart(2, "0");
  const startDate = `${year}-${m}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  // 1. Sum all daily entries for this vertical + month
  const { data: entries } = await supabase
    .from("daily_revenue_entries")
    .select("amount")
    .eq("vertical_id", vertical_id)
    .gte("date", startDate)
    .lte("date", endDate);

  const mtd = (entries ?? []).reduce((s, e) => s + Number(e.amount), 0);

  // 2. Get the monthly target (if set)
  const { data: targetRow } = await supabase
    .from("monthly_revenue_targets")
    .select("target_amount")
    .eq("vertical_id", vertical_id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  const target = targetRow ? Number(targetRow.target_amount) : null;

  // 3. Compute metrics
  const now = new Date();
  const totalDays = new Date(year, month, 0).getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const elapsed = isCurrentMonth ? now.getDate() : totalDays;
  const daysRemaining = isCurrentMonth ? totalDays - now.getDate() : 0;

  const targetTillDate = target != null ? Math.round((target / totalDays) * elapsed * 100) / 100 : null;
  const surplusOrDeficit = target != null ? Math.round((mtd - (targetTillDate ?? 0)) * 100) / 100 : null;
  const gapToTarget = target != null ? Math.round((target - mtd) * 100) / 100 : null;
  const pctAchieved = target != null && target > 0 ? Math.round((mtd / target) * 10000) / 100 : null;
  const dailyAvg = elapsed > 0 ? Math.round((mtd / elapsed) * 100) / 100 : null;
  const requiredDailyAvg =
    gapToTarget != null && daysRemaining > 0 && gapToTarget > 0
      ? Math.round((gapToTarget / daysRemaining) * 100) / 100
      : null;

  // 4. Upsert the log row
  await supabase.from("revenue_monthly_logs").upsert(
    {
      vertical_id,
      month,
      year,
      mtd_revenue: Math.round(mtd * 100) / 100,
      target_amount: target,
      target_till_date: targetTillDate,
      surplus_or_deficit: surplusOrDeficit,
      gap_to_target: gapToTarget,
      pct_target_achieved: pctAchieved,
      daily_avg_achieved: dailyAvg,
      required_daily_avg: requiredDailyAvg,
      pipeline_next_7_days: 0, // updated separately if needed
      updated_at: new Date().toISOString(),
    },
    { onConflict: "vertical_id,month,year" }
  );
}
