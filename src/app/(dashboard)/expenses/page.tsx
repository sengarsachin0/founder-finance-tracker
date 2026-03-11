"use client";

import { useEffect, useState } from "react";
import { UploadStatementModal } from "./UploadStatementModal";
import { TallyImportModal } from "./TallyImportModal";
import { Plus, Pencil, Trash2, CheckCircle2, Circle, RefreshCw, Download } from "lucide-react";
import { downloadCSV, todayStr } from "@/lib/utils/csv-export";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, CURRENCY_SYMBOLS, type Currency } from "@/lib/schemas/bank-account";
import {
  EXPENSE_CATEGORIES,
  RECURRENCES,
  RECURRENCE_LABELS,
  type Expense,
  type Recurrence,
} from "@/lib/schemas/expense";

function formatAmount(amount: number, currency: string) {
  const symbol = CURRENCY_SYMBOLS[currency as Currency] ?? currency;
  return `${symbol}${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount)}`;
}

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(expense: Expense) {
  if (expense.is_paid || !expense.due_date) return false;
  return new Date(expense.due_date) < new Date(new Date().toDateString());
}

function isDueSoon(expense: Expense) {
  if (expense.is_paid || !expense.due_date) return false;
  const due = new Date(expense.due_date);
  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);
  return due >= new Date(now.toDateString()) && due <= in30;
}

// ── Expense Form (shared by Add and Edit) ───────────────────────────────────
function ExpenseForm({
  defaults,
  onSubmit,
  loading,
  onCancel,
}: {
  defaults: Partial<Expense>;
  onSubmit: (data: Record<string, unknown>) => void;
  loading: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaults.name ?? "");
  const [category, setCategory] = useState(defaults.category ?? "Other");
  const [amount, setAmount] = useState(defaults.amount?.toString() ?? "");
  const [currency, setCurrency] = useState<Currency>((defaults.currency as Currency) ?? "INR");
  const [conversionRate, setConversionRate] = useState(
    defaults.conversion_rate && defaults.conversion_rate > 1
      ? defaults.conversion_rate.toString()
      : ""
  );
  const [dueDate, setDueDate] = useState(defaults.due_date ?? "");
  const [isRecurring, setIsRecurring] = useState(defaults.is_recurring ?? false);
  const [recurrence, setRecurrence] = useState<Recurrence | "">(defaults.recurrence ?? "");
  const [notes, setNotes] = useState(defaults.notes ?? "");

  const amountNum = parseFloat(amount) || 0;
  const rateNum = parseFloat(conversionRate) || 1;
  const previewInr =
    currency !== "INR" && amountNum > 0 && rateNum > 0
      ? Math.round(amountNum * rateNum * 100) / 100
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      category,
      amount: parseFloat(amount) || 0,
      currency,
      conversion_rate: currency !== "INR" ? parseFloat(conversionRate) || 1 : 1,
      due_date: dueDate || null,
      is_recurring: isRecurring,
      recurrence: isRecurring && recurrence ? recurrence : null,
      notes: notes || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Expense name</Label>
        <Input
          placeholder="e.g. AWS, Notion, Payroll"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Due date</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v as Currency); }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c} — {CURRENCY_SYMBOLS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Amount ({CURRENCY_SYMBOLS[currency]})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      {currency !== "INR" && (
        <div className="space-y-2">
          <Label>Conversion rate to INR</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 83"
            value={conversionRate}
            onChange={(e) => setConversionRate(e.target.value)}
            required
          />
          {previewInr !== null && (
            <p className="text-xs text-muted-foreground">≈ {formatINR(previewInr)}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsRecurring(!isRecurring)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isRecurring ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          Recurring expense
        </button>
        {isRecurring && (
          <Select value={recurrence} onValueChange={(v) => { if (v) setRecurrence(v as Recurrence); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Frequency" />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCES.map((r) => (
                <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Input
          placeholder="Any notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Add Expense Modal ────────────────────────────────────────────────────────
function AddExpenseModal({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(data: Record<string, unknown>) {
    setLoading(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      toast.error("Failed to add expense");
      setLoading(false);
      return;
    }
    toast.success("Expense added");
    setOpen(false);
    onAdded();
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Expense
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <ExpenseForm
          defaults={{}}
          onSubmit={handleSubmit}
          loading={loading}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Expense Modal ───────────────────────────────────────────────────────
function EditExpenseModal({ expense, onUpdated }: { expense: Expense; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(data: Record<string, unknown>) {
    setLoading(true);
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      toast.error("Failed to update expense");
      setLoading(false);
      return;
    }
    toast.success("Expense updated");
    setOpen(false);
    onUpdated();
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <ExpenseForm
          defaults={expense}
          onSubmit={handleSubmit}
          loading={loading}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
type Filter = "upcoming" | "all" | "paid";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("upcoming");

  async function fetchExpenses() {
    const res = await fetch("/api/expenses", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setExpenses(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }

  useEffect(() => { fetchExpenses(); }, []);

  async function togglePaid(expense: Expense) {
    const newPaid = !expense.is_paid;
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_paid: newPaid,
        paid_date: newPaid ? new Date().toISOString().split("T")[0] : null,
      }),
    });
    if (res.ok) {
      toast.success(newPaid ? "Marked as paid" : "Marked as unpaid");
      fetchExpenses();
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleDelete(expense: Expense) {
    if (!confirm(`Delete "${expense.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Expense removed");
      fetchExpenses();
    } else {
      toast.error("Failed to delete expense");
    }
  }

  function handleExport() {
    downloadCSV(`expenses-${todayStr()}`, [
      "Name", "Category", "Currency", "Amount", "Amount (INR)", "Conversion Rate",
      "Is Paid", "Paid Date", "Due Date", "Is Recurring", "Recurrence", "Notes", "Created At",
    ], expenses.map((e) => [
      e.name, e.category, e.currency, e.amount, e.amount_in_inr, e.conversion_rate,
      e.is_paid, e.paid_date ?? "", e.due_date ?? "",
      e.is_recurring, e.recurrence ?? "", e.notes ?? "", e.created_at,
    ]));
  }

  const unpaid = expenses.filter((e) => !e.is_paid);
  const paid = expenses.filter((e) => e.is_paid);
  const upcoming30 = unpaid.filter(isDueSoon);
  const overdue = unpaid.filter(isOverdue);

  const filtered =
    filter === "upcoming" ? unpaid
    : filter === "paid" ? paid
    : expenses;

  const upcomingTotal = upcoming30.reduce((sum, e) => sum + Number(e.amount_in_inr), 0);
  const unpaidTotal = unpaid.reduce((sum, e) => sum + Number(e.amount_in_inr), 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track upcoming and recurring expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchExpenses} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={expenses.length === 0} title="Export CSV">
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
          <UploadStatementModal onImported={fetchExpenses} />
          <TallyImportModal onImported={fetchExpenses} />
          <AddExpenseModal onAdded={fetchExpenses} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Due in Next 30 Days
          </p>
          <p className="mt-1 text-2xl font-bold">{formatINR(upcomingTotal)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {upcoming30.length} expense{upcoming30.length !== 1 ? "s" : ""}
            {overdue.length > 0 && (
              <span className="ml-2 text-destructive font-medium">
                · {overdue.length} overdue
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total Unpaid
          </p>
          <p className="mt-1 text-2xl font-bold">{formatINR(unpaidTotal)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unpaid.length} expense{unpaid.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {(["upcoming", "all", "paid"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === f
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "upcoming" ? "Unpaid" : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {f === "upcoming" ? unpaid.length : f === "paid" ? paid.length : expenses.length}
            </span>
          </button>
        ))}
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === "upcoming"
              ? "No unpaid expenses."
              : filter === "paid"
              ? "No paid expenses yet."
              : "No expenses yet. Add your first expense above."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8" />
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Category</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Recurrence</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((expense) => {
                const overdue = isOverdue(expense);
                const soon = isDueSoon(expense);
                return (
                  <tr
                    key={expense.id}
                    className={`hover:bg-muted/20 transition-colors ${expense.is_paid ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePaid(expense)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={expense.is_paid ? "Mark as unpaid" : "Mark as paid"}
                      >
                        {expense.is_paid ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${expense.is_paid ? "line-through text-muted-foreground" : ""}`}>
                        {expense.name}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant="secondary" className="text-xs">{expense.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold tabular-nums">
                        {formatAmount(Number(expense.amount), expense.currency)}
                      </p>
                      {expense.currency !== "INR" && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          ≈ {formatINR(Number(expense.amount_in_inr))}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {expense.is_paid ? (
                        <span className="text-xs text-muted-foreground">
                          Paid {formatDate(expense.paid_date)}
                        </span>
                      ) : (
                        <span className={`text-xs font-medium ${
                          overdue
                            ? "text-destructive"
                            : soon
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}>
                          {overdue ? "Overdue · " : ""}{formatDate(expense.due_date)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {expense.is_recurring && expense.recurrence ? (
                        <Badge variant="outline" className="text-xs">
                          {RECURRENCE_LABELS[expense.recurrence]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">One-time</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {expense.notes ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <EditExpenseModal expense={expense} onUpdated={fetchExpenses} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(expense)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
