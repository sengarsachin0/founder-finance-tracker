"use client";

import { useEffect, useState, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { EXPENSE_CATEGORIES } from "@/lib/schemas/expense";
import type { Expense } from "@/lib/schemas/expense";
import type { RevenueEntry } from "@/lib/schemas/revenue";

// ── Constants ─────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
];

const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c, i) => [c, CHART_COLORS[i % CHART_COLORS.length]])
);

const DATE_PRESETS = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "All", months: 0 },
] as const;
type DatePreset = (typeof DATE_PRESETS)[number]["label"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function shortINR(v: number) {
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}k`;
  return `₹${v}`;
}

function monthLabel(iso: string) {
  return new Date(iso + "-01").toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}

function expenseDate(e: Expense): string | null {
  return e.paid_date ?? e.created_at ?? null;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ msg = "No data for the selected filters" }: { msg?: string }) {
  return (
    <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold mb-4">{title}</p>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenue, setRevenue] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>("12M");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [vendorSearch, setVendorSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/expenses", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/revenue", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([exps, rev]) => {
        if (Array.isArray(exps)) setExpenses(exps);
        if (Array.isArray(rev)) setRevenue(rev);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Date cutoff ─────────────────────────────────────────────────────────────
  const dateCutoff = useMemo<Date | null>(() => {
    const preset = DATE_PRESETS.find((p) => p.label === datePreset)!;
    if (preset.months === 0) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - preset.months);
    return d;
  }, [datePreset]);

  // ── Filtered paid expenses ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = expenses.filter((e) => e.is_paid);

    if (dateCutoff) {
      result = result.filter((e) => {
        const d = expenseDate(e);
        return d ? new Date(d) >= dateCutoff : false;
      });
    }
    if (categoryFilter !== "all") {
      result = result.filter((e) => e.category === categoryFilter);
    }
    if (vendorSearch.trim()) {
      const q = vendorSearch.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    return result;
  }, [expenses, dateCutoff, categoryFilter, vendorSearch]);

  // ── Filtered revenue (received only) ───────────────────────────────────────
  const filteredRevenue = useMemo(() => {
    let result = revenue.filter((r) => r.stage === "received");
    if (dateCutoff) {
      result = result.filter((r) => {
        const d = r.received_date ?? r.created_at;
        return d ? new Date(d) >= dateCutoff : false;
      });
    }
    return result;
  }, [revenue, dateCutoff]);

  // ── 1. Expense by Category ──────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      map[e.category] = (map[e.category] ?? 0) + Math.abs(Number(e.amount_in_inr));
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── 2. Expense by Vendor (top 10) ──────────────────────────────────────────
  const vendorData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      map[e.name] = (map[e.name] ?? 0) + Math.abs(Number(e.amount_in_inr));
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  // ── 3. Monthly Expense Trend ────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      const d = expenseDate(e);
      if (!d) return;
      const month = d.slice(0, 7);
      map[month] = (map[month] ?? 0) + Math.abs(Number(e.amount_in_inr));
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month: monthLabel(month), total: Math.round(total) }));
  }, [filtered]);

  // ── 4. Cash Inflow vs Outflow ───────────────────────────────────────────────
  const inflowOutflow = useMemo(() => {
    const map: Record<string, { inflow: number; outflow: number }> = {};

    // Outflow: paid expenses (vendor filter intentionally NOT applied here)
    expenses
      .filter((e) => e.is_paid)
      .filter((e) => !dateCutoff || (expenseDate(e) ? new Date(expenseDate(e)!) >= dateCutoff : false))
      .forEach((e) => {
        const d = expenseDate(e);
        if (!d) return;
        const m = d.slice(0, 7);
        if (!map[m]) map[m] = { inflow: 0, outflow: 0 };
        map[m].outflow += Math.abs(Number(e.amount_in_inr));
      });

    // Inflow: received revenue
    filteredRevenue.forEach((r) => {
      const d = r.received_date ?? r.created_at;
      if (!d) return;
      const m = d.slice(0, 7);
      if (!map[m]) map[m] = { inflow: 0, outflow: 0 };
      map[m].inflow += Math.abs(Number(r.amount_in_inr));
    });

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month: monthLabel(month),
        Inflow: Math.round(v.inflow),
        Outflow: Math.round(v.outflow),
      }));
  }, [expenses, filteredRevenue, dateCutoff]);

  // ── 5. Category Breakdown Over Time ────────────────────────────────────────
  const { categoryBreakdown, breakdownCategories } = useMemo(() => {
    const months: Record<string, Record<string, number>> = {};
    const cats = new Set<string>();

    filtered.forEach((e) => {
      const d = expenseDate(e);
      if (!d) return;
      const m = d.slice(0, 7);
      if (!months[m]) months[m] = {};
      months[m][e.category] = (months[m][e.category] ?? 0) + Math.abs(Number(e.amount_in_inr));
      cats.add(e.category);
    });

    const data = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, vals]) => ({
        month: monthLabel(m),
        ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Math.round(v)])),
      }));

    return { categoryBreakdown: data, breakdownCategories: Array.from(cats) };
  }, [filtered]);

  // ── Summary stats ───────────────────────────────────────────────────────────
  const totalSpend = filtered.reduce((s, e) => s + Math.abs(Number(e.amount_in_inr)), 0);
  const totalInflow = filteredRevenue.reduce((s, r) => s + Math.abs(Number(r.amount_in_inr)), 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Detailed breakdown of your financial activity.
        </p>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Date range presets */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDatePreset(p.label)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                datePreset === p.label
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Vendor search */}
        <input
          type="text"
          placeholder="Search vendor…"
          value={vendorSearch}
          onChange={(e) => setVendorSearch(e.target.value)}
          className="h-8 rounded-md border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-44"
        />

        {/* Active filter summary */}
        {!loading && (
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} expense{filtered.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-foreground font-medium">{formatINR(totalSpend)}</span> spend ·{" "}
            <span className="text-emerald-600 font-medium">{formatINR(totalInflow)}</span> received
          </span>
        )}
      </div>

      {/* ── Charts Grid ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* 1. Expense by Category */}
        <ChartCard title="Expense by Category">
          {loading ? <Empty msg="Loading…" /> : categoryData.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={42}
                  >
                    {categoryData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={CATEGORY_COLOR[d.name] ?? CHART_COLORS[0]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[220px] text-xs">
                {categoryData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: CATEGORY_COLOR[d.name] ?? CHART_COLORS[0] }}
                    />
                    <span className="truncate text-muted-foreground flex-1">{d.name}</span>
                    <span className="tabular-nums font-medium shrink-0">{formatINR(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* 2. Expense by Vendor */}
        <ChartCard title="Top Vendors by Spend">
          {loading ? <Empty msg="Loading…" /> : vendorData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={vendorData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={shortINR}
                  width={52}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={120}
                  tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + "…" : v}
                />
                <Tooltip formatter={(v) => [formatINR(Number(v)), "Spend"]} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 3. Monthly Expense Trend */}
        <ChartCard title="Monthly Expense Trend">
          {loading ? <Empty msg="Loading…" /> : monthlyTrend.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={shortINR} width={52} />
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
        </ChartCard>

        {/* 4. Cash Inflow vs Outflow */}
        <ChartCard title="Cash Inflow vs Outflow">
          {loading ? <Empty msg="Loading…" /> : inflowOutflow.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={inflowOutflow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={shortINR} width={52} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Inflow" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Outflow" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 5. Category Breakdown Over Time — full width */}
        <div className="lg:col-span-2">
          <ChartCard title="Category Breakdown Over Time">
            {loading ? <Empty msg="Loading…" /> : categoryBreakdown.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={categoryBreakdown}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={shortINR} width={52} />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {breakdownCategories.map((cat) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="a"
                      fill={CATEGORY_COLOR[cat] ?? CHART_COLORS[0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

      </div>
    </div>
  );
}
