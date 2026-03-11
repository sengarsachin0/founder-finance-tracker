"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Check, X, Copy, ChevronLeft, ChevronRight,
  Target, TrendingUp, Calendar, Loader2, FileText, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  RevenueVertical, MonthlyRevenueTarget, DailyRevenueEntry, RevenueReportTemplate,
} from "@/lib/schemas/daily-revenue";
import { DEFAULT_WHATSAPP_TEMPLATE, TEMPLATE_VARIABLES } from "@/lib/schemas/daily-revenue";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    template
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Set Target Modal ──────────────────────────────────────────────────────────

function SetTargetModal({
  verticalId,
  month,
  year,
  existing,
  onSaved,
}: {
  verticalId: string;
  month: number;
  year: number;
  existing: MonthlyRevenueTarget | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(existing ? String(existing.target_amount) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAmount(existing ? String(existing.target_amount) : "");
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) { toast.error("Enter a valid target amount"); return; }
    setSaving(true);
    const res = await fetch("/api/daily-revenue/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical_id: verticalId, month, year, target_amount: num }),
    });
    if (res.ok) {
      toast.success("Target saved");
      setOpen(false);
      onSaved();
    } else {
      toast.error("Failed to save target");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Target className="h-4 w-4 mr-1.5" />
        {existing ? "Edit Target" : "Set Target"}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit" : "Set"} Target — {MONTH_NAMES[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium mb-1">Monthly Target (₹)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Target
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Entry Modal ───────────────────────────────────────────────────────────

function AddEntryModal({
  verticalId,
  onAdded,
}: {
  verticalId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setDate(todayISO()); setAmount(""); setNotes(""); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num < 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const res = await fetch("/api/daily-revenue/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical_id: verticalId, date, amount: num, notes: notes || undefined }),
    });
    if (res.ok) {
      toast.success("Entry added");
      setOpen(false);
      onAdded();
    } else {
      toast.error("Failed to add entry");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Entry
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Daily Revenue</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 25000"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 3 course enrollments"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Entry
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Report Template Manager ───────────────────────────────────────────────────

function ReportSection({
  vertical,
  metrics,
  pipeline7d,
  month,
  year,
}: {
  vertical: RevenueVertical;
  metrics: ReturnType<typeof computeMetrics>;
  pipeline7d: number;
  month: number;
  year: number;
}) {
  const [templates, setTemplates] = useState<RevenueReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateText, setTemplateText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newText, setNewText] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [showVars, setShowVars] = useState(false);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch(`/api/daily-revenue/report-templates?vertical_id=${vertical.id}`, { cache: "no-store" });
    if (res.ok) {
      const data: RevenueReportTemplate[] = await res.json();
      setTemplates(data);
      const def = data.find((t) => t.is_default) ?? data[0];
      if (def && !selectedTemplateId) {
        setSelectedTemplateId(def.id);
        setTemplateText(def.template);
        setTemplateName(def.name);
      }
    }
  }, [vertical.id, selectedTemplateId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  function selectTemplate(id: string | null) {
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSelectedTemplateId(id);
      setTemplateText(t.template);
      setTemplateName(t.name);
      setEditingTemplate(false);
    }
  }

  const generatedReport = useMemo(() => {
    if (!metrics) return "";
    const today = new Date();
    const vars: Record<string, string> = {
      vertical_name: vertical.name,
      date: today.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      month_name: MONTH_NAMES[month - 1],
      year: String(year),
      today: metrics.today > 0 ? formatINR(metrics.today).replace("₹", "") : "0",
      mtd: formatINR(metrics.mtd).replace("₹", ""),
      target: metrics.target != null ? formatINR(metrics.target).replace("₹", "") : "Not set",
      pct_achieved: metrics.pctAchieved != null ? metrics.pctAchieved.toFixed(1) : "—",
      target_till_date: metrics.targetTillDate != null ? formatINR(metrics.targetTillDate).replace("₹", "") : "—",
      surplus_deficit_label: (metrics.surplusDeficit ?? 0) >= 0 ? "✅ Surplus" : "⚠️ Deficit",
      surplus_deficit_abs: metrics.surplusDeficit != null ? formatINR(Math.abs(metrics.surplusDeficit)).replace("₹", "") : "—",
      gap_to_target: metrics.gapToTarget != null ? formatINR(Math.max(0, metrics.gapToTarget)).replace("₹", "") : "—",
      days_elapsed: String(metrics.daysElapsed),
      days_remaining: String(metrics.daysRemaining),
      days_in_month: String(metrics.daysInMonth),
      daily_avg_achieved: metrics.dailyAvgAchieved != null ? formatINR(metrics.dailyAvgAchieved).replace("₹", "") : "—",
      required_daily_avg: metrics.requiredDailyAvg != null && metrics.requiredDailyAvg > 0 ? formatINR(metrics.requiredDailyAvg).replace("₹", "") : "0",
      pipeline_7d: formatINR(pipeline7d).replace("₹", ""),
    };
    return renderTemplate(templateText || DEFAULT_WHATSAPP_TEMPLATE, vars);
  }, [metrics, vertical.name, month, year, templateText, pipeline7d]);

  async function saveTemplate() {
    if (!selectedTemplate) return;
    setSaving(true);
    const res = await fetch(`/api/daily-revenue/report-templates/${selectedTemplate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: templateName, template: templateText }),
    });
    if (res.ok) {
      toast.success("Template saved");
      setEditingTemplate(false);
      fetchTemplates();
    } else {
      toast.error("Failed to save template");
    }
    setSaving(false);
  }

  async function createTemplate() {
    if (!newName.trim() || !newText.trim()) { toast.error("Name and template required"); return; }
    setSaving(true);
    const res = await fetch("/api/daily-revenue/report-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical_id: vertical.id, name: newName, template: newText, is_default: templates.length === 0 }),
    });
    if (res.ok) {
      const created: RevenueReportTemplate = await res.json();
      toast.success("Template created");
      setAddingNew(false);
      setNewName("");
      setNewText(DEFAULT_WHATSAPP_TEMPLATE);
      await fetchTemplates();
      selectTemplate(created.id);
    } else {
      toast.error("Failed to create template");
    }
    setSaving(false);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/daily-revenue/report-templates/${id}`, { method: "DELETE" });
    toast.success("Template deleted");
    setSelectedTemplateId("");
    fetchTemplates();
  }

  async function setDefault(id: string) {
    await fetch(`/api/daily-revenue/report-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    toast.success("Default template updated");
    fetchTemplates();
  }

  async function copyReport() {
    await navigator.clipboard.writeText(generatedReport);
    toast.success("Report copied to clipboard!");
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-sm font-semibold">Generate Report</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            WhatsApp / text report for {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowVars((v) => !v)} className="text-xs">
            <Info className="h-3.5 w-3.5 mr-1" />
            Variables
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddingNew(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Template
          </Button>
        </div>
      </div>

      {showVars && (
        <div className="px-5 py-3 border-b bg-muted/30">
          <p className="text-xs font-medium mb-2">Available variables</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {TEMPLATE_VARIABLES.map((v) => (
              <div key={v.key} className="text-xs">
                <code className="bg-muted rounded px-1 py-0.5 text-primary">{v.key}</code>
                <span className="text-muted-foreground ml-1">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Template selector */}
        {templates.length > 0 && !addingNew && (
          <div className="flex items-center gap-2">
            <Select value={selectedTemplateId} onValueChange={selectTemplate}>
              <SelectTrigger className="flex-1 text-sm">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.is_default && <span className="text-muted-foreground">(default)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <>
                {!selectedTemplate.is_default && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault(selectedTemplate.id)} className="text-xs">
                    Set default
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTemplate(!editingTemplate)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteTemplate(selectedTemplate.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        )}

        {/* No templates yet */}
        {templates.length === 0 && !addingNew && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No templates yet</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddingNew(true)}>
              Create first template
            </Button>
          </div>
        )}

        {/* New template form */}
        {addingNew && (
          <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
            <p className="text-sm font-medium">New Template</p>
            <input
              type="text"
              placeholder="Template name (e.g., WhatsApp Daily)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              rows={10}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={createTemplate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Template
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingNew(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Edit existing template */}
        {editingTemplate && selectedTemplate && (
          <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
            <p className="text-sm font-medium">Edit: {selectedTemplate.name}</p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              rows={10}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveTemplate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingTemplate(false); setTemplateText(selectedTemplate.template); setTemplateName(selectedTemplate.name); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Generated output */}
        {(templates.length > 0 || (!addingNew && generatedReport)) && !addingNew && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Preview</p>
              <Button size="sm" onClick={copyReport} disabled={!generatedReport}>
                <Copy className="h-4 w-4 mr-1.5" />
                Copy to Clipboard
              </Button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm font-mono leading-relaxed">
              {generatedReport || "Select a template above to preview the report"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metrics computation ───────────────────────────────────────────────────────

function computeMetrics(
  entries: DailyRevenueEntry[],
  target: MonthlyRevenueTarget | null,
  month: number,
  year: number,
  pipeline7d: number
) {
  const today = todayISO();
  const now = new Date();
  const totalDays = daysInMonth(year, month);

  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const elapsed = isCurrentMonth ? now.getDate() : totalDays;

  const todayTotal = entries
    .filter((e) => e.date === today)
    .reduce((s, e) => s + Number(e.amount), 0);

  const mtd = entries.reduce((s, e) => s + Number(e.amount), 0);

  const t = target ? Number(target.target_amount) : null;
  const targetTillDate = t != null ? (t / totalDays) * elapsed : null;
  const surplusDeficit = t != null ? mtd - (targetTillDate ?? 0) : null;
  const pctAchieved = t != null && t > 0 ? (mtd / t) * 100 : null;
  const gapToTarget = t != null ? t - mtd : null;
  const dailyAvgAchieved = elapsed > 0 ? mtd / elapsed : null;
  const daysRemaining = isCurrentMonth ? totalDays - now.getDate() : 0;
  const requiredDailyAvg =
    gapToTarget != null && daysRemaining > 0 && gapToTarget > 0
      ? gapToTarget / daysRemaining
      : null;

  return {
    today: todayTotal,
    mtd,
    target: t,
    targetTillDate,
    surplusDeficit,
    pctAchieved,
    gapToTarget,
    daysElapsed: elapsed,
    daysInMonth: totalDays,
    daysRemaining,
    dailyAvgAchieved,
    requiredDailyAvg,
    pipeline7d,
  };
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "red" | "amber" | null;
}) {
  const valueClass =
    highlight === "green"
      ? "text-emerald-600"
      : highlight === "red"
      ? "text-destructive"
      : highlight === "amber"
      ? "text-amber-500"
      : "";

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DailyRevenuePage() {
  const now = new Date();
  const [verticals, setVerticals] = useState<RevenueVertical[]>([]);
  const [selectedVerticalId, setSelectedVerticalId] = useState<string>("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<DailyRevenueEntry[]>([]);
  const [target, setTarget] = useState<MonthlyRevenueTarget | null>(null);
  const [pipeline7d, setPipeline7d] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);

  // Fetch verticals once
  useEffect(() => {
    fetch("/api/revenue-verticals", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setVerticals(data);
          setSelectedVerticalId(data[0].id);
        }
      });
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedVerticalId) return;
    setLoading(true);
    const [entriesRes, targetsRes, revenueRes] = await Promise.all([
      fetch(`/api/daily-revenue/entries?vertical_id=${selectedVerticalId}&month=${month}&year=${year}`, { cache: "no-store" }),
      fetch(`/api/daily-revenue/targets?vertical_id=${selectedVerticalId}&month=${month}&year=${year}`, { cache: "no-store" }),
      fetch(`/api/revenue?vertical_id=${selectedVerticalId}`, { cache: "no-store" }),
    ]);

    if (entriesRes.ok) setEntries(await entriesRes.json());
    if (targetsRes.ok) {
      const t = await targetsRes.json();
      setTarget(Array.isArray(t) && t.length > 0 ? t[0] : null);
    }
    if (revenueRes.ok) {
      const rev = await revenueRes.json();
      if (Array.isArray(rev)) {
        const in7 = new Date();
        in7.setDate(in7.getDate() + 7);
        const pipe = rev
          .filter((r: { archived: boolean; stage: string; expected_date: string | null; amount_in_inr: number }) =>
            !r.archived && r.stage !== "received" && r.expected_date && new Date(r.expected_date) <= in7
          )
          .reduce((s: number, r: { amount_in_inr: number }) => s + Number(r.amount_in_inr), 0);
        setPipeline7d(pipe);
      }
    }
    setLoading(false);
  }, [selectedVerticalId, month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedVertical = verticals.find((v) => v.id === selectedVerticalId);

  const metrics = useMemo(() => {
    if (!selectedVerticalId) return null;
    return computeMetrics(entries, target, month, year, pipeline7d);
  }, [entries, target, month, year, pipeline7d, selectedVerticalId]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function startEditEntry(e: DailyRevenueEntry) {
    setEditingEntryId(e.id);
    setEditAmount(String(e.amount));
    setEditNotes(e.notes ?? "");
  }

  async function saveEditEntry(id: string) {
    const num = Number(editAmount);
    if (isNaN(num) || num < 0) { toast.error("Invalid amount"); return; }
    setSavingEntryId(id);
    const res = await fetch(`/api/daily-revenue/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: num, notes: editNotes || null }),
    });
    if (res.ok) {
      toast.success("Entry updated");
      setEditingEntryId(null);
      fetchData();
    } else {
      toast.error("Failed to update");
    }
    setSavingEntryId(null);
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/daily-revenue/entries/${id}`, { method: "DELETE" });
    toast.success("Entry deleted");
    fetchData();
  }

  // ── No verticals state ────────────────────────────────────────────────────

  if (!loading && verticals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-1">No Revenue Verticals Yet</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Create your first vertical (e.g., Academy, B2B) in Settings to start tracking.
        </p>
        <a href="/settings" className="text-sm text-primary hover:underline">
          Go to Settings → Manage Verticals
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Revenue</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track daily collections and measure against monthly targets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedVertical && (
            <SetTargetModal
              verticalId={selectedVerticalId}
              month={month}
              year={year}
              existing={target}
              onSaved={fetchData}
            />
          )}
          {selectedVertical && (
            <AddEntryModal verticalId={selectedVerticalId} onAdded={fetchData} />
          )}
        </div>
      </div>

      {/* Vertical tabs */}
      {verticals.length > 1 && (
        <div className="flex gap-1 mb-5 flex-wrap">
          {verticals.filter((v) => v.is_active).map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVerticalId(v.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                v.id === selectedVerticalId
                  ? "text-white border-transparent"
                  : "text-muted-foreground border-border hover:bg-accent"
              }`}
              style={v.id === selectedVerticalId ? { background: v.color, borderColor: v.color } : {}}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {/* Month navigator */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={prevMonth} className="rounded-lg border p-1.5 hover:bg-accent transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{MONTH_NAMES[month - 1]} {year}</span>
        </div>
        <button onClick={nextMonth} className="rounded-lg border p-1.5 hover:bg-accent transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        {target && (
          <Badge variant="secondary" className="ml-2 text-xs">
            Target: {formatINR(target.target_amount)}
          </Badge>
        )}
        {!target && !loading && (
          <span className="text-xs text-amber-500 ml-2">⚠️ No target set for this month</span>
        )}
      </div>

      {/* Metrics grid */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : metrics ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 mb-6">
          <MetricCard
            label="Revenue Today"
            value={formatINR(metrics.today)}
            highlight={metrics.today > 0 ? "green" : null}
          />
          <MetricCard
            label="Month-to-Date"
            value={formatINR(metrics.mtd)}
            sub={`${metrics.daysElapsed} of ${metrics.daysInMonth} days`}
          />
          <MetricCard
            label="Monthly Target"
            value={metrics.target != null ? formatINR(metrics.target) : "Not set"}
            highlight={null}
          />
          <MetricCard
            label="% Target Achieved"
            value={metrics.pctAchieved != null ? `${metrics.pctAchieved.toFixed(1)}%` : "—"}
            highlight={
              metrics.pctAchieved == null ? null
              : metrics.pctAchieved >= 100 ? "green"
              : metrics.pctAchieved >= 70 ? "amber"
              : "red"
            }
          />
          <MetricCard
            label="Target Till Today"
            value={metrics.targetTillDate != null ? formatINR(metrics.targetTillDate) : "—"}
            sub="Pro-rated for days elapsed"
          />
          <MetricCard
            label={metrics.surplusDeficit != null && metrics.surplusDeficit >= 0 ? "Surplus" : "Deficit"}
            value={metrics.surplusDeficit != null ? formatINR(Math.abs(metrics.surplusDeficit)) : "—"}
            highlight={metrics.surplusDeficit == null ? null : metrics.surplusDeficit >= 0 ? "green" : "red"}
          />
          <MetricCard
            label="Daily Avg Achieved"
            value={metrics.dailyAvgAchieved != null ? formatINR(metrics.dailyAvgAchieved) : "—"}
            sub="MTD ÷ days elapsed"
          />
          <MetricCard
            label="Required Daily Avg"
            value={metrics.requiredDailyAvg != null && metrics.requiredDailyAvg > 0 ? formatINR(metrics.requiredDailyAvg) : metrics.gapToTarget != null && metrics.gapToTarget <= 0 ? "Target hit!" : "—"}
            highlight={
              metrics.gapToTarget != null && metrics.gapToTarget <= 0 ? "green"
              : metrics.requiredDailyAvg != null && metrics.dailyAvgAchieved != null && metrics.requiredDailyAvg > metrics.dailyAvgAchieved ? "red"
              : null
            }
            sub={metrics.daysRemaining > 0 ? `${metrics.daysRemaining} days remaining` : undefined}
          />
          <MetricCard
            label="Gap to Target"
            value={metrics.gapToTarget != null ? formatINR(Math.max(0, metrics.gapToTarget)) : "—"}
            highlight={metrics.gapToTarget != null && metrics.gapToTarget <= 0 ? "green" : "red"}
            sub={metrics.gapToTarget != null && metrics.gapToTarget <= 0 ? "Target exceeded!" : undefined}
          />
          <MetricCard
            label="Pipeline (Next 7 Days)"
            value={formatINR(metrics.pipeline7d)}
            sub="From revenue pipeline module"
            highlight={metrics.pipeline7d > 0 ? "green" : null}
          />
        </div>
      ) : null}

      {/* Daily entries */}
      <div className="rounded-xl border bg-card shadow-sm mb-6">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm font-semibold">
            Daily Entries — {MONTH_NAMES[month - 1]} {year}
          </p>
          <span className="text-xs text-muted-foreground">
            {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
          </span>
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No entries for this month yet. Click &quot;Add Entry&quot; to start.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Notes</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                    {e.date === todayISO() && (
                      <Badge className="ml-2 text-[10px] h-4 px-1">Today</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {editingEntryId === e.id ? (
                      <input
                        type="number"
                        min="0"
                        value={editAmount}
                        onChange={(ev) => setEditAmount(ev.target.value)}
                        className="w-28 rounded border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      formatINR(Number(e.amount))
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {editingEntryId === e.id ? (
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(ev) => setEditNotes(ev.target.value)}
                        placeholder="Notes"
                        className="w-full rounded border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      e.notes ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {editingEntryId === e.id ? (
                        <>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-600"
                            onClick={() => saveEditEntry(e.id)} disabled={savingEntryId === e.id}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setEditingEntryId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => startEditEntry(e)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteEntry(e.id)}
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
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</td>
                <td className="px-4 py-2.5 font-bold tabular-nums" colSpan={3}>
                  {formatINR(entries.reduce((s, e) => s + Number(e.amount), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Report section */}
      {selectedVertical && metrics && (
        <ReportSection
          vertical={selectedVertical}
          metrics={metrics}
          pipeline7d={pipeline7d}
          month={month}
          year={year}
        />
      )}
    </div>
  );
}
