"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Banknote, Flame, Clock, TrendingDown } from "lucide-react";
import type { BankAccount } from "@/lib/schemas/bank-account";
import type { Expense } from "@/lib/schemas/expense";
import type { RevenueEntry } from "@/lib/schemas/revenue";

// ── Formatters ────────────────────────────────────────────────────────────────
function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function shortINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(0)}k`;
  return `${sign}₹${abs}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type Scenario = "conservative" | "optimistic";
type Horizon = 3 | 6;

function getMonthKeys(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthLabel(key: string) {
  return new Date(key + "-01").toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}

function runwayClass(months: number | null) {
  if (months === null) return "text-muted-foreground";
  if (months > 12) return "text-emerald-600 dark:text-emerald-400";
  if (months >= 6) return "text-amber-500 dark:text-amber-400";
  return "text-destructive";
}

function runwayBadgeClass(months: number | null) {
  if (months === null) return "bg-muted text-muted-foreground";
  if (months > 12) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (months >= 6) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-xs space-y-1">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-semibold tabular-nums">{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ForecastPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenue, setRevenue] = useState<RevenueEntry[]>([]);
  const [mtdRevenue, setMtdRevenue] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario>("conservative");
  const [horizon, setHorizon] = useState<Horizon>(6);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    Promise.all([
      fetch("/api/bank-accounts", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/expenses", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/revenue", { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/daily-revenue/monthly-logs?year=${year}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([accts, exps, rev, logs]) => {
        if (Array.isArray(accts)) setAccounts(accts);
        if (Array.isArray(exps)) setExpenses(exps);
        if (Array.isArray(rev)) setRevenue(rev);
        if (Array.isArray(logs)) {
          const currentMonth = now.getMonth() + 1;
          const total = logs
            .filter((l: { month: number; mtd_revenue: number }) => l.month === currentMonth)
            .reduce((s: number, l: { mtd_revenue: number }) => s + Number(l.mtd_revenue), 0);
          setMtdRevenue(total);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalCash = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.balance_in_inr), 0),
    [accounts]
  );

  const monthlyBurn = useMemo(() => {
    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    let burn = 0;
    for (const e of expenses) {
      const amt = Math.abs(Number(e.amount_in_inr));
      if (e.is_recurring) {
        if (e.recurrence === "monthly") burn += amt;
        else if (e.recurrence === "annual") burn += amt / 12;
        else if (e.recurrence === "quarterly") burn += amt / 3;
      } else if (!e.is_paid && e.due_date && new Date(e.due_date) <= in30) {
        burn += amt;
      }
    }
    return Math.round(burn * 100) / 100;
  }, [expenses]);

  const projectedMonthlyRevenue = useMemo(() => {
    const now = new Date();
    const daysElapsed = now.getDate();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (daysElapsed === 0) return 0;
    return Math.round((mtdRevenue / daysElapsed) * totalDays * 100) / 100;
  }, [mtdRevenue]);

  const netBurn = Math.round((monthlyBurn - projectedMonthlyRevenue) * 100) / 100;
  const runway = monthlyBurn > 0 ? totalCash / (netBurn > 0 ? netBurn : monthlyBurn) : null;

  // Revenue inflows indexed by month key
  const revenueByMonth = useMemo(() => {
    const map: Record<string, { conservative: number; optimistic: number }> = {};
    revenue.forEach((r) => {
      if (r.archived) return;
      const dateStr = r.expected_date ?? r.created_at;
      if (!dateStr) return;
      const month = dateStr.slice(0, 7);
      if (!map[month]) map[month] = { conservative: 0, optimistic: 0 };
      const amt = Number(r.amount_in_inr);
      if (r.stage === "invoice_sent") {
        map[month].conservative += amt;
        map[month].optimistic += amt;
      } else if (r.stage === "expected") {
        map[month].optimistic += amt;
      }
    });
    return map;
  }, [revenue]);

  // Unpaid expense outflows indexed by month key
  const outflowsByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    expenses
      .filter((e) => !e.is_paid && e.due_date)
      .forEach((e) => {
        const month = e.due_date!.slice(0, 7);
        map[month] = (map[month] ?? 0) + Math.abs(Number(e.amount_in_inr));
      });
    return map;
  }, [expenses]);

  const monthKeys = useMemo(() => getMonthKeys(horizon), [horizon]);

  // Chart: both scenarios computed independently (sequential opening balance)
  const chartData = useMemo(() => {
    let openC = totalCash;
    let openO = totalCash;
    return monthKeys.map((key) => {
      const inflowC = revenueByMonth[key]?.conservative ?? 0;
      const inflowO = revenueByMonth[key]?.optimistic ?? 0;
      const outflow = outflowsByMonth[key] ?? 0;
      openC = openC + inflowC - outflow;
      openO = openO + inflowO - outflow;
      return {
        month: monthLabel(key),
        conservative: Math.round(openC),
        optimistic: Math.round(openO),
      };
    });
  }, [monthKeys, totalCash, revenueByMonth, outflowsByMonth]);

  // Table rows: sequential for selected scenario
  const tableRows = useMemo(() => {
    let opening = totalCash;
    return monthKeys.map((key) => {
      const inflowC = revenueByMonth[key]?.conservative ?? 0;
      const inflowO = revenueByMonth[key]?.optimistic ?? 0;
      const inflows = scenario === "conservative" ? inflowC : inflowO;
      const outflows = outflowsByMonth[key] ?? 0;
      const closing = opening + inflows - outflows;
      const row = {
        key,
        label: monthLabel(key),
        opening: Math.round(opening),
        inflows: Math.round(inflows),
        outflows: Math.round(outflows),
        closing: Math.round(closing),
      };
      opening = closing;
      return row;
    });
  }, [monthKeys, totalCash, revenueByMonth, outflowsByMonth, scenario]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const runwayDisplay =
    runway === null
      ? "—"
      : runway >= 120
      ? "10y+"
      : `${runway.toFixed(1)} mo`;

  const kpis = [
    {
      label: "Current Cash",
      value: loading ? "…" : formatINR(totalCash),
      sub: `${accounts.length} account${accounts.length !== 1 ? "s" : ""}`,
      icon: Banknote,
    },
    {
      label: "Monthly Burn",
      value: loading ? "…" : monthlyBurn > 0 ? formatINR(monthlyBurn) : "—",
      sub: "Recurring expenses",
      icon: Flame,
    },
    {
      label: "Net Burn",
      value: loading ? "…" : formatINR(Math.abs(netBurn)),
      sub: netBurn <= 0 ? "Cash flow positive" : `Proj. revenue: ${formatINR(projectedMonthlyRevenue)}`,
      icon: TrendingDown,
      colorClass: netBurn <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
    },
    {
      label: "Runway",
      value: loading ? "…" : runwayDisplay,
      sub: netBurn > 0 ? "At net burn rate" : "Cash flow positive",
      icon: Clock,
      colorClass: loading ? undefined : runwayClass(runway),
      badgeClass: loading ? undefined : runwayBadgeClass(runway),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cash Flow Forecast</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Project your future cash position and runway.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {kpi.label}
              </p>
              <kpi.icon className="h-4 w-4 text-primary" />
            </div>
            <p
              className={`text-2xl font-bold ${kpi.colorClass ?? ""}`}
            >
              {kpi.value}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{kpi.sub}</p>
              {kpi.label === "Runway" && runway !== null && (
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${kpi.badgeClass}`}
                >
                  {runway > 12 ? "Healthy" : runway >= 6 ? "Monitor" : "Critical"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Scenario toggle */}
        <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
          {(["conservative", "optimistic"] as Scenario[]).map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                scenario === s
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {scenario === "conservative"
            ? "Includes Invoice Sent revenue only"
            : "Includes all Expected + Invoice Sent revenue"}
        </p>

        {/* Horizon toggle */}
        <div className="ml-auto flex rounded-lg border bg-muted/40 p-0.5 text-xs">
          {([3, 6] as Horizon[]).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                horizon === h
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h}M
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-5 shadow-sm mb-4">
        <p className="text-sm font-semibold mb-4">Projected Cash Position</p>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradConservative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradOptimistic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={shortINR}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="conservative"
                name="Conservative"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#gradConservative)"
                dot={{ r: 3, fill: "#6366f1" }}
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="optimistic"
                name="Optimistic"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="5 3"
                fill="url(#gradOptimistic)"
                dot={{ r: 3, fill: "#22c55e" }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Projection Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <p className="text-sm font-semibold">
            Monthly Breakdown
            <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">
              ({scenario} scenario)
            </span>
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Month</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Opening Cash
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground text-emerald-600">
                  Inflows
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground text-destructive">
                  Outflows
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Closing Cash
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tableRows.map((row) => {
                const isNegative = row.closing < 0;
                return (
                  <tr key={row.key} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatINR(row.opening)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                      {row.inflows > 0 ? `+${formatINR(row.inflows)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive font-medium">
                      {row.outflows > 0 ? `-${formatINR(row.outflows)}` : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        isNegative ? "text-destructive" : ""
                      }`}
                    >
                      {formatINR(row.closing)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          Inflows: revenue with expected date in that month (filtered by scenario) · Outflows: unpaid
          expenses with due date in that month
        </div>
      </div>
    </div>
  );
}
