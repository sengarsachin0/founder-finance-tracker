import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export async function GET(request: Request) {
  // Verify cron secret (set CRON_SECRET env var in Vercel)
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Get all users with a notification email configured
  const { data: settings } = await supabase
    .from("user_settings")
    .select("user_id, notification_email, runway_warning_months, large_payment_threshold")
    .not("notification_email", "is", null);

  if (!settings?.length) {
    return NextResponse.json({ message: "No recipients configured" });
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in7Str = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);

  // Fetch shared data once
  const [{ data: accounts }, { data: expenses }, { data: revenue }, { data: monthlyLogs }] = await Promise.all([
    supabase.from("bank_accounts").select("balance_in_inr"),
    supabase.from("expenses").select("name, amount_in_inr, due_date, is_paid, is_recurring, recurrence"),
    supabase.from("revenue_entries").select("client_name, amount_in_inr, expected_date, stage, archived"),
    supabase.from("revenue_monthly_logs")
      .select("mtd_revenue, month, year")
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear()),
  ]);

  const totalCash = (accounts ?? []).reduce((s, a) => s + Number(a.balance_in_inr), 0);

  // Monthly burn (recurring)
  const in30 = new Date(now.getTime() + 30 * 864e5);
  let monthlyBurn = 0;
  for (const e of expenses ?? []) {
    const amt = Math.abs(Number(e.amount_in_inr));
    if (e.is_recurring) {
      if (e.recurrence === "monthly") monthlyBurn += amt;
      else if (e.recurrence === "annual") monthlyBurn += amt / 12;
      else if (e.recurrence === "quarterly") monthlyBurn += amt / 3;
    } else if (!e.is_paid && e.due_date && new Date(e.due_date) <= in30) {
      monthlyBurn += amt;
    }
  }

  // MTD revenue
  const mtdRevenue = (monthlyLogs ?? []).reduce((s, l) => s + Number(l.mtd_revenue), 0);
  const daysElapsed = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedRevenue = daysElapsed > 0 ? (mtdRevenue / daysElapsed) * totalDays : 0;
  const netBurn = monthlyBurn - projectedRevenue;
  const runway = netBurn > 0 ? totalCash / netBurn : (monthlyBurn > 0 ? totalCash / monthlyBurn : null);

  // Due today
  const dueToday = (expenses ?? []).filter((e) => !e.is_paid && e.due_date === todayStr);

  // Overdue receivables
  const overdueReceivables = (revenue ?? []).filter(
    (r) => !r.archived && r.stage !== "received" && r.expected_date && r.expected_date < todayStr
  );

  // Large payments due in 7 days
  const largeSoonPayments = (expenses ?? []).filter(
    (e) => !e.is_paid && e.due_date && e.due_date >= todayStr && e.due_date <= in7Str
  );

  const sendResults = await Promise.allSettled(
    settings.map(async (s) => {
      if (!s.notification_email) return;
      const runwayWarning = s.runway_warning_months ?? 6;
      const largeThreshold = s.large_payment_threshold ?? 100000;

      const alerts: string[] = [];
      if (runway !== null && runway < runwayWarning) {
        alerts.push(`⚠️ Runway below ${runwayWarning} months: <strong>${runway.toFixed(1)} months</strong>`);
      }
      if (overdueReceivables.length > 0) {
        alerts.push(`⚠️ ${overdueReceivables.length} overdue receivable${overdueReceivables.length !== 1 ? "s" : ""}`);
      }
      const largePayments = largeSoonPayments.filter((e) => Math.abs(Number(e.amount_in_inr)) >= largeThreshold);
      if (largePayments.length > 0) {
        alerts.push(`⚠️ ${largePayments.length} large payment${largePayments.length !== 1 ? "s" : ""} due within 7 days`);
      }

      const dueTodayRows = dueToday.length > 0
        ? dueToday.map((e) => `<tr><td style="padding:4px 8px">${e.name}</td><td style="padding:4px 8px;text-align:right">${formatINR(Math.abs(Number(e.amount_in_inr)))}</td></tr>`).join("")
        : `<tr><td colspan="2" style="padding:4px 8px;color:#6b7280">Nothing due today</td></tr>`;

      const overdueRows = overdueReceivables.slice(0, 5).length > 0
        ? overdueReceivables.slice(0, 5).map((r) => `<tr><td style="padding:4px 8px">${r.client_name}</td><td style="padding:4px 8px;text-align:right">${formatINR(Number(r.amount_in_inr))}</td><td style="padding:4px 8px;color:#dc2626">${r.expected_date}</td></tr>`).join("")
        : `<tr><td colspan="3" style="padding:4px 8px;color:#6b7280">No overdue receivables</td></tr>`;

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
  <h2 style="color:#4f46e5;margin-bottom:4px">Finance Command Center</h2>
  <p style="color:#6b7280;margin-top:0">Daily digest · ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
    <tr><td style="padding:12px 16px;font-size:13px;color:#6b7280">Total Cash</td><td style="padding:12px 16px;text-align:right;font-weight:600;font-size:16px">${formatINR(totalCash)}</td></tr>
    <tr style="border-top:1px solid #e5e7eb"><td style="padding:12px 16px;font-size:13px;color:#6b7280">MTD Revenue</td><td style="padding:12px 16px;text-align:right;font-weight:600;color:#16a34a">${formatINR(mtdRevenue)}</td></tr>
    <tr style="border-top:1px solid #e5e7eb"><td style="padding:12px 16px;font-size:13px;color:#6b7280">Monthly Burn</td><td style="padding:12px 16px;text-align:right;font-weight:600">${formatINR(monthlyBurn)}</td></tr>
    <tr style="border-top:1px solid #e5e7eb"><td style="padding:12px 16px;font-size:13px;color:#6b7280">Net Burn</td><td style="padding:12px 16px;text-align:right;font-weight:600;color:${netBurn > 0 ? "#dc2626" : "#16a34a"}">${formatINR(Math.abs(netBurn))}${netBurn <= 0 ? " (positive)" : ""}</td></tr>
    <tr style="border-top:1px solid #e5e7eb"><td style="padding:12px 16px;font-size:13px;color:#6b7280">Runway</td><td style="padding:12px 16px;text-align:right;font-weight:600;color:${runway === null ? "#6b7280" : runway >= 12 ? "#16a34a" : runway >= 6 ? "#d97706" : "#dc2626"}">${runway === null ? "—" : runway >= 120 ? "10y+" : `${runway.toFixed(1)} months`}</td></tr>
  </table>

  ${alerts.length > 0 ? `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0">
    <p style="margin:0 0 8px;font-weight:600;color:#dc2626">Alerts</p>
    ${alerts.map((a) => `<p style="margin:4px 0;font-size:14px">${a}</p>`).join("")}
  </div>` : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:16px 0"><p style="margin:0;color:#16a34a;font-size:14px">✅ All clear — no active alerts</p></div>`}

  <h3 style="font-size:14px;margin:20px 0 8px">Due Today</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left;font-weight:500;color:#6b7280">Expense</th><th style="padding:6px 8px;text-align:right;font-weight:500;color:#6b7280">Amount</th></tr></thead>
    <tbody>${dueTodayRows}</tbody>
  </table>

  <h3 style="font-size:14px;margin:20px 0 8px">Overdue Receivables</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left;font-weight:500;color:#6b7280">Client</th><th style="padding:6px 8px;text-align:right;font-weight:500;color:#6b7280">Amount</th><th style="padding:6px 8px;text-align:left;font-weight:500;color:#6b7280">Expected</th></tr></thead>
    <tbody>${overdueRows}</tbody>
  </table>

  <p style="margin-top:32px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">
    Finance Command Center · <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app"}" style="color:#4f46e5">Open Dashboard</a>
  </p>
</body>
</html>`;

      await resend.emails.send({
        from: "Finance CC <digest@yourdomain.com>",
        to: s.notification_email,
        subject: `Finance Digest · ${now.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · Cash: ${formatINR(totalCash)}`,
        html,
      });
    })
  );

  const sent = sendResults.filter((r) => r.status === "fulfilled").length;
  const failed = sendResults.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ sent, failed });
}
