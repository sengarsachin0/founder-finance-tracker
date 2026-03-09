"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X, RefreshCw, Download, Loader2, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { downloadCSV, todayStr } from "@/lib/utils/csv-export";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EXPENSE_CATEGORIES } from "@/lib/schemas/expense";
import type { TallyLedgerMapping } from "@/lib/schemas/tally-mapping";
import type { RevenueVertical } from "@/lib/schemas/daily-revenue";

// ── Tally Ledger Mappings Section ─────────────────────────────────────────────
function TallyMappingsSection() {
  const [mappings, setMappings] = useState<TallyLedgerMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/tally-mappings", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMappings(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  function startEdit(mapping: TallyLedgerMapping) {
    setEditingId(mapping.id);
    setEditCategory(mapping.category);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCategory("");
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    const res = await fetch(`/api/settings/tally-mappings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: editCategory }),
    });
    if (res.ok) {
      toast.success("Mapping updated");
      setEditingId(null);
      fetchMappings();
    } else {
      toast.error("Failed to update mapping");
    }
    setSavingId(null);
  }

  async function handleDelete(mapping: TallyLedgerMapping) {
    if (!confirm(`Delete mapping for "${mapping.ledger_name}"?`)) return;
    const res = await fetch(`/api/settings/tally-mappings/${mapping.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Mapping deleted");
      fetchMappings();
    } else {
      toast.error("Failed to delete mapping");
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-sm font-semibold">Tally Ledger Mappings</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            These mappings auto-populate categories when importing Tally CSV files.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchMappings} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : mappings.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No mappings saved yet. Import a Tally CSV to create mappings automatically.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ledger Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                Last Updated
              </th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {mappings.map((m) => (
              <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">{m.ledger_name}</td>
                <td className="px-4 py-3">
                  {editingId === m.id ? (
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {m.category}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                  {new Date(m.updated_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {editingId === m.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-600"
                          onClick={() => saveEdit(m.id)}
                          disabled={savingId === m.id}
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={cancelEdit}
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEdit(m)}
                          title="Edit category"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(m)}
                          title="Delete mapping"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mappings.length > 0 && (
        <div className="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          {mappings.length} mapping{mappings.length !== 1 ? "s" : ""} saved
        </div>
      )}
    </div>
  );
}

// ── Export Section ─────────────────────────────────────────────────────────────
type ExportModule = "bank-accounts" | "revenue" | "expenses" | "daily-revenue" | "monthly-logs";

const EXPORT_MODULES: {
  id: ExportModule;
  label: string;
  description: string;
  api: string;
  filename: string;
  headers: string[];
  toRow: (item: Record<string, unknown>) => (string | number | boolean | null | undefined)[];
}[] = [
  {
    id: "bank-accounts",
    label: "Bank Accounts",
    description: "All bank accounts with current balances",
    api: "/api/bank-accounts",
    filename: "bank-accounts",
    headers: ["Bank Name", "Account Name", "Currency", "Balance", "Balance (INR)", "Conversion Rate", "Notes", "Last Updated"],
    toRow: (a) => [a.bank_name, a.account_name, a.currency, a.balance, a.balance_in_inr, a.conversion_rate, a.notes ?? "", a.updated_at],
  },
  {
    id: "revenue",
    label: "Revenue & Receivables",
    description: "Full pipeline including archived (received) entries",
    api: "/api/revenue?include_archived=true",
    filename: "revenue",
    headers: ["Client Name", "Description", "Stage", "Vertical", "Currency", "Amount", "Amount (INR)", "Conversion Rate", "Expected Date", "Received Date", "Notes", "Archived", "Source", "Created At"],
    toRow: (e) => [e.client_name, e.description, e.stage, (e.vertical_id as string | null) ?? "", e.currency, e.amount, e.amount_in_inr, e.conversion_rate, e.expected_date ?? "", e.received_date ?? "", e.notes ?? "", e.archived, e.source ?? "manual", e.created_at],
  },
  {
    id: "expenses",
    label: "Expenses",
    description: "All expenses — paid and unpaid",
    api: "/api/expenses",
    filename: "expenses",
    headers: ["Name", "Category", "Currency", "Amount", "Amount (INR)", "Conversion Rate", "Is Paid", "Paid Date", "Due Date", "Is Recurring", "Recurrence", "Notes", "Created At"],
    toRow: (e) => [e.name, e.category, e.currency, e.amount, e.amount_in_inr, e.conversion_rate, e.is_paid, e.paid_date ?? "", e.due_date ?? "", e.is_recurring, e.recurrence ?? "", e.notes ?? "", e.created_at],
  },
  {
    id: "daily-revenue",
    label: "Daily Revenue Entries",
    description: "All daily revenue entries across all verticals",
    api: "/api/daily-revenue/entries/all",
    filename: "daily-revenue-entries",
    headers: ["Date", "Vertical", "Amount (INR)", "Notes", "Entered By", "Created At"],
    toRow: (e) => {
      const vertical = e.revenue_verticals as Record<string, unknown> | null;
      return [e.date, vertical?.name ?? "", e.amount, e.notes ?? "", e.entered_by, e.created_at];
    },
  },
  {
    id: "monthly-logs",
    label: "Monthly Performance Logs",
    description: "Computed monthly metrics per vertical (MTD, targets, averages)",
    api: "/api/daily-revenue/monthly-logs",
    filename: "monthly-revenue-logs",
    headers: ["Vertical", "Month", "Year", "MTD Revenue", "Target", "Target Till Date", "Surplus/Deficit", "Gap to Target", "% Achieved", "Daily Avg Achieved", "Required Daily Avg", "Pipeline Next 7d", "Updated At"],
    toRow: (r) => {
      const vertical = r.revenue_verticals as Record<string, unknown> | null;
      return [vertical?.name ?? "", r.month, r.year, r.mtd_revenue, r.target_amount ?? "", r.target_till_date ?? "", r.surplus_or_deficit ?? "", r.gap_to_target ?? "", r.pct_target_achieved ?? "", r.daily_avg_achieved ?? "", r.required_daily_avg ?? "", r.pipeline_next_7_days, r.updated_at];
    },
  },
];

function ExportSection() {
  const [downloading, setDownloading] = useState<ExportModule | null>(null);

  async function handleExport(mod: typeof EXPORT_MODULES[number]) {
    setDownloading(mod.id);
    try {
      const res = await fetch(mod.api, { cache: "no-store" });
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      downloadCSV(`${mod.filename}-${todayStr()}`, mod.headers, rows.map(mod.toRow));
      toast.success(`${mod.label} exported`);
    } catch {
      toast.error(`Failed to export ${mod.label}`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="px-5 py-4 border-b">
        <h2 className="text-sm font-semibold">Data Export</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Download all your data as CSV files.
        </p>
      </div>
      <div className="divide-y">
        {EXPORT_MODULES.map((mod) => (
          <div key={mod.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium">{mod.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport(mod)}
              disabled={downloading !== null}
            >
              {downloading === mod.id ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              Export CSV
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Revenue Verticals Section ──────────────────────────────────────────────────
const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#22c55e",
  "#14b8a6", "#3b82f6", "#f43f5e", "#eab308", "#64748b",
];

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function AddVerticalModal({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setDescription(""); setColor(PRESET_COLORS[0]); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const slug = slugify(name);
    const res = await fetch("/api/revenue-verticals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug, description: description || undefined, color }),
    });
    if (res.ok) {
      toast.success("Vertical created");
      setOpen(false);
      onAdded();
    } else {
      const err = await res.json();
      toast.error(err?.error?.formErrors?.[0] ?? "Failed to create vertical");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Vertical
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Revenue Vertical</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Academy, B2B"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            {name && (
              <p className="text-xs text-muted-foreground mt-1">Slug: {slugify(name)}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? "scale-125 border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Vertical
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VerticalsSection() {
  const [verticals, setVerticals] = useState<RevenueVertical[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchVerticals = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/revenue-verticals", { cache: "no-store" });
    if (res.ok) setVerticals(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchVerticals(); }, [fetchVerticals]);

  function startEdit(v: RevenueVertical) {
    setEditingId(v.id);
    setEditName(v.name);
    setEditDesc(v.description ?? "");
    setEditColor(v.color);
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    const res = await fetch(`/api/revenue-verticals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc || undefined, color: editColor, slug: slugify(editName) }),
    });
    if (res.ok) {
      toast.success("Vertical updated");
      setEditingId(null);
      fetchVerticals();
    } else {
      toast.error("Failed to update");
    }
    setSavingId(null);
  }

  async function toggleActive(v: RevenueVertical) {
    await fetch(`/api/revenue-verticals/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !v.is_active }),
    });
    fetchVerticals();
  }

  async function handleDelete(v: RevenueVertical) {
    if (!confirm(`Delete vertical "${v.name}"? This will delete all its targets, entries, and report templates.`)) return;
    const res = await fetch(`/api/revenue-verticals/${v.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Vertical deleted");
      fetchVerticals();
    } else {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-sm font-semibold">Revenue Verticals</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage business lines tracked in Daily Revenue (e.g., Academy, B2B).
          </p>
        </div>
        <AddVerticalModal onAdded={fetchVerticals} />
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : verticals.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No verticals yet. Add your first one to start tracking daily revenue.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {verticals.map((v) => (
              <tr key={v.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  {editingId === v.id ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex gap-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`h-5 w-5 rounded-full border-2 ${editColor === c ? "border-foreground scale-125" : "border-transparent"}`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: v.color }} />
                      <span className="font-medium">{v.name}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                  {editingId === v.id ? (
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description"
                      className="w-full rounded border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    v.description ?? "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={v.is_active ? "default" : "secondary"} className="text-xs">
                    {v.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {editingId === v.id ? (
                      <>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-600"
                          onClick={() => saveEdit(v.id)} disabled={savingId === v.id}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => startEdit(v)} title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => toggleActive(v)}
                          title={v.is_active ? "Deactivate" : "Activate"}
                        >
                          {v.is_active
                            ? <ToggleRight className="h-3.5 w-3.5 text-emerald-600" />
                            : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(v)} title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {verticals.length > 0 && (
        <div className="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          {verticals.length} vertical{verticals.length !== 1 ? "s" : ""} · {verticals.filter((v) => v.is_active).length} active
        </div>
      )}
    </div>
  );
}

// ── Notifications Section ──────────────────────────────────────────────────────
function NotificationsSection() {
  const [email, setEmail] = useState("");
  const [runwayMonths, setRunwayMonths] = useState("6");
  const [largeThreshold, setLargeThreshold] = useState("100000");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/user").then((r) => r.json()).then((data) => {
      setEmail(data.notification_email ?? "");
      setRunwayMonths(String(data.runway_warning_months ?? 6));
      setLargeThreshold(String(data.large_payment_threshold ?? 100000));
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notification_email: email || null,
        runway_warning_months: Number(runwayMonths),
        large_payment_threshold: Number(largeThreshold),
      }),
    });
    if (res.ok) toast.success("Settings saved");
    else toast.error("Failed to save settings");
    setSaving(false);
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="px-5 py-4 border-b">
        <h2 className="text-sm font-semibold">Notifications & Alerts</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Daily digest email and alert thresholds. Digest sends at 8:00 AM IST.
        </p>
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Notification Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Daily digest + alert emails are sent here.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Runway Warning (months)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={runwayMonths}
                onChange={(e) => setRunwayMonths(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Large Payment Alert (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={largeThreshold}
                onChange={(e) => setLargeThreshold(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save Settings
          </Button>
        </form>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure verticals, Tally mappings, export data, and preferences.
        </p>
      </div>

      <div className="space-y-6">
        <NotificationsSection />
        <VerticalsSection />
        <TallyMappingsSection />
        <ExportSection />
      </div>
    </div>
  );
}
