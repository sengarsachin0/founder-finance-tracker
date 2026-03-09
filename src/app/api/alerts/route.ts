import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType = "runway" | "large_payment" | "overdue_receivable";

export type AppAlert = {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
};

function inrFmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function dateFmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: accounts }, { data: expenses }, { data: revenue }] =
    await Promise.all([
      supabase.from("bank_accounts").select("*").eq("user_id", user.id),
      supabase.from("expenses").select("*").eq("user_id", user.id),
      supabase.from("revenue").select("*").eq("user_id", user.id),
    ]);

  const alerts: AppAlert[] = [];
  const now = new Date();

  // ── 1. Runway alert ─────────────────────────────────────────────────────────
  const totalCash = (accounts ?? []).reduce(
    (s, a) => s + Number(a.balance_in_inr),
    0
  );

  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const last3Paid = (expenses ?? []).filter((e) => {
    if (!e.is_paid) return false;
    const d = e.paid_date ?? e.created_at;
    if (!d) return false;
    const date = new Date(d);
    return date >= cutoff && date < thisMonthStart;
  });
  const monthlyBurn =
    last3Paid.length > 0
      ? last3Paid.reduce((s, e) => s + Math.abs(Number(e.amount_in_inr)), 0) / 3
      : 0;
  const runway = monthlyBurn > 0 ? totalCash / monthlyBurn : null;

  const RUNWAY_WARN_THRESHOLD = 6; // months
  if (runway !== null && runway < RUNWAY_WARN_THRESHOLD) {
    alerts.push({
      id: "runway",
      type: "runway",
      severity: runway < 3 ? "critical" : "warning",
      title: `Runway: ${runway.toFixed(1)} months`,
      description: `Burn ${inrFmt(monthlyBurn)}/mo with ${inrFmt(totalCash)} cash on hand.`,
    });
  }

  // ── 2. Large upcoming payments (> ₹1L due within 7 days) ───────────────────
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const LARGE_PAYMENT_THRESHOLD = 100_000;
  const largeUpcoming = (expenses ?? []).filter((e) => {
    if (e.is_paid || !e.due_date) return false;
    const due = new Date(e.due_date);
    return due <= in7Days && Math.abs(Number(e.amount_in_inr)) > LARGE_PAYMENT_THRESHOLD;
  });

  for (const e of largeUpcoming) {
    const due = new Date(e.due_date);
    const isOverdue = due < now;
    alerts.push({
      id: `payment-${e.id}`,
      type: "large_payment",
      severity: isOverdue ? "critical" : "warning",
      title: `${isOverdue ? "Overdue" : "Large payment due"}: ${e.name}`,
      description: `${inrFmt(Math.abs(Number(e.amount_in_inr)))} ${isOverdue ? "was" : "due"} ${dateFmt(e.due_date)}`,
    });
  }

  // ── 3. Overdue receivables ──────────────────────────────────────────────────
  const overdueRevenue = (revenue ?? []).filter((r) => {
    if (r.archived || r.stage === "received") return false;
    if (!r.expected_date) return false;
    return new Date(r.expected_date) < now;
  });

  for (const r of overdueRevenue) {
    alerts.push({
      id: `receivable-${r.id}`,
      type: "overdue_receivable",
      severity: "warning",
      title: `Overdue receivable: ${r.client_name}`,
      description: `${inrFmt(Number(r.amount_in_inr))} expected on ${dateFmt(r.expected_date)}`,
    });
  }

  return NextResponse.json(alerts);
}
