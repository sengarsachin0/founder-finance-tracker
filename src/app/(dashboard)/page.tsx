"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Banknote, Flame, Clock, TrendingUp, CreditCard, AlertCircle, TrendingDown } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import type { BankAccount } from "@/lib/schemas/bank-account";
import type { Expense } from "@/lib/schemas/expense";
import type { RevenueEntry } from "@/lib/schemas/revenue";
import { STAGE_LABELS } from "@/lib/schemas/revenue";

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
];

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function expenseDate(e: Expense): string | null {
  return e.paid_date ?? e.created_at ?? null;
}

function dateFmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenue, setRevenue] = useState<RevenueEntry[]>([]);
  const [mtdRevenue, setMtdRevenue] = useState<number>(0);
  const [loading, setLoading] = useState(true);

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

  // ── KPI computations ──────────────────────────────────────────────────────────

  const totalCash = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.balance_in_inr), 0),
    [accounts]
  );

  const activeRevenue = useMemo(
    () => revenue.filter((r) => !r.archived && r.stage !== "received"),
    [revenue]
  );

  const expectedRevenue = useMemo(
    () => activeRevenue.reduce((s, r) => s + Number(r.amount_in_inr), 0),
    [activeRevenue]
  );

  const upcomingExpensesList = useMemo(
    () =>
      expenses
        .filter((e) => !e.is_paid && e.due_date)
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        .slice(0, 5),
    [expenses]
  );

  const upcomingExpensesIn30 = useMemo(() => {
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    return expenses.filter(
      (e) => !e.is_paid && e.due_date && new Date(e.due_date) <= in30
    );
  }, [expenses]);

  const upcomingExpensesTotal = useMemo(
    () => upcomingExpensesIn30.reduce((s, e) => s + Math.abs(Number(e.amount_in_inr)), 0),
    [upcomingExpensesIn30]
  );

  const paidExpenses = useMemo(() => expenses.filter((e) => e.is_paid), [expenses]);

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

  // ── Overdue receivables table ─────────────────────────────────────────────────

  const overdueReceivables = useMemo(
    () =>
      revenue
        .filter(
          (r) =>
            !r.archived &&
            r.stage !== "received" &&
            r.expected_date &&
            new Date(r.expected_date) < new Date()
        )
        .sort((a, b) =>
          (a.expected_date ?? "").localeCompare(b.expected_date ?? "")
        )
        .slice(0, 5),
    [revenue]
  );

  // ── Chart data ────────────────────────────────────────────────────────────────

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    paidExpenses.forEach((e) => {
      map[e.category] = (map[e.category] ?? 0) + Math.abs(Number(e.amount_in_inr));
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [paidExpenses]);

  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    paidExpenses.forEach((e) => {
      const d = expenseDate(e);
      if (!d) return;
      const month = d.slice(0, 7);
      map[month] = (map[month] ?? 0) + Math.abs(Number(e.amount_in_inr));
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, total]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit",
        }),
        total: Math.round(total),
      }));
  }, [paidExpenses]);

  // ── KPI card definitions ──────────────────────────────────────────────────────

  function runwayColor() {
    if (runway === null) return "";
    if (runway >= 12) return "text-emerald-600";
    if (runway >= 6) return "text-amber-500";
    return "text-destructive";
  }

  const kpis = [
    {
      label: "Total Cash",
      value: loading ? "…" : formatINR(totalCash),
      sub: `${accounts.length} account${accounts.length !== 1 ? "s" : ""}`,
      icon: Banknote,
      href: "/bank-accounts",
      valueClass: "",
    },
    {
      label: "Expected Revenue",
      value: loading ? "…" : formatINR(expectedRevenue),
      sub: `${activeRevenue.length} active deal${activeRevenue.length !== 1 ? "s" : ""}`,
      icon: TrendingUp,
      href: "/revenue",
      valueClass: "text-emerald-600",
    },
    {
      label: "Upcoming Expenses",
      value: loading
        ? "…"
        : upcomingExpensesIn30.length > 0
        ? formatINR(upcomingExpensesTotal)
        : "—",
      sub:
        upcomingExpensesIn30.length > 0
          ? `${upcomingExpensesIn30.length} due in 30 days`
          : "Nothing due soon",
      icon: CreditCard,
      href: "/expenses",
      valueClass: upcomingExpensesIn30.length > 0 ? "text-destructive" : "",
    },
    {
      label: "Monthly Burn",
      value: loading ? "…" : monthlyBurn > 0 ? formatINR(monthlyBurn) : "—",
      sub: "Recurring expenses",
      icon: Flame,
      href: "/expenses",
      valueClass: "",
    },
    {
      label: "Net Burn",
      value: loading ? "…" : formatINR(Math.abs(netBurn)),
      sub: netBurn <= 0 ? "Cash flow positive" : `After ${formatINR(projectedMonthlyRevenue)} proj. revenue`,
      icon: TrendingDown,
      href: "/forecast",
      valueClass: netBurn <= 0 ? "text-emerald-600" : "text-destructive",
    },
    {
      label: "Runway",
      value: loading
        ? "…"
        : runway === null
        ? "—"
        : runway >= 120
        ? "10y+"
        : `${runway.toFixed(1)} mo`,
      sub: netBurn > 0 ? "At net burn rate" : "Cash flow positive",
      icon: Clock,
      href: "/forecast",
      valueClass: runwayColor(),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your financial position at a glance.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="group block">
            <div className="rounded-xl border bg-card p-4 shadow-sm transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">
                  {kpi.label}
                </p>
                <kpi.icon className="h-4 w-4 text-primary shrink-0" />
              </div>
              <p className={`text-xl font-bold tabular-nums ${kpi.valueClass}`}>
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Tables */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Overdue Receivables */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <p className="text-sm font-semibold">Overdue Receivables</p>
            <Link href="/revenue" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : overdueReceivables.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No overdue receivables</p>
              <p className="text-xs text-muted-foreground mt-0.5">All clear!</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Expected</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overdueReceivables.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium truncate max-w-[120px]">{r.client_name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{formatINR(Number(r.amount_in_inr))}</td>
                    <td className="px-4 py-2.5 text-xs text-destructive">
                      <span className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {r.expected_date ? dateFmt(r.expected_date) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary" className="text-xs">
                        {STAGE_LABELS[r.stage]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming Expenses */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <p className="text-sm font-semibold">Upcoming Expenses</p>
            <Link href="/expenses" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : upcomingExpensesList.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No upcoming expenses</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nothing due soon.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {upcomingExpensesList.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium truncate max-w-[120px]">{e.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{formatINR(Math.abs(Number(e.amount_in_inr)))}</td>
                    <td className={`px-4 py-2.5 text-xs ${isOverdue(e.due_date) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {e.due_date ? dateFmt(e.due_date) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-xs">
                        {e.category}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expense by Category */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold mb-4">Expense by Category</p>
          {loading ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : categoryData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              No paid expenses yet
            </div>
          ) : (
            <div className="flex gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-52 text-xs">
                {categoryData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground flex-1">{d.name}</span>
                    <span className="tabular-nums font-medium shrink-0">
                      {formatINR(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Monthly Expense Trend */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold mb-4">Monthly Expense Trend</p>
          {loading ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : monthlyTrend.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={48}
                />
                <Tooltip formatter={(v) => [formatINR(Number(v)), "Expenses"]} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
