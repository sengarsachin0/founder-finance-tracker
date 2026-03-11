"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ArrowRight, CheckCircle2, Download } from "lucide-react";
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
import {
  CURRENCIES,
  CURRENCY_SYMBOLS,
  type Currency,
} from "@/lib/schemas/bank-account";
import {
  STAGES,
  STAGE_LABELS,
  type RevenueEntry,
  type Stage,
} from "@/lib/schemas/revenue";
import type { RevenueVertical } from "@/lib/schemas/daily-revenue";

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
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Stage badge ─────────────────────────────────────────────────────────────
const STAGE_STYLES: Record<Stage, string> = {
  expected: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  invoice_sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  received: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

// ── Add Entry Modal ──────────────────────────────────────────────────────────
function AddEntryModal({
  onAdded,
  verticals,
}: {
  onAdded: () => void;
  verticals: RevenueVertical[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [conversionRate, setConversionRate] = useState("");
  const [stage, setStage] = useState<Stage>("expected");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [verticalId, setVerticalId] = useState<string>("");

  const amountNum = parseFloat(amount) || 0;
  const rateNum = parseFloat(conversionRate) || 1;
  const previewInr =
    currency !== "INR" && amountNum > 0 && rateNum > 0
      ? Math.round(amountNum * rateNum * 100) / 100
      : null;

  function reset() {
    setClientName("");
    setDescription("");
    setAmount("");
    setCurrency("INR");
    setConversionRate("");
    setStage("expected");
    setExpectedDate("");
    setNotes("");
    setVerticalId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        description,
        amount: parseFloat(amount) || 0,
        currency,
        conversion_rate: currency !== "INR" ? parseFloat(conversionRate) || 1 : 1,
        stage,
        expected_date: expectedDate || undefined,
        notes: notes || undefined,
        vertical_id: verticalId || undefined,
      }),
    });

    if (!res.ok) {
      toast.error("Failed to add entry");
      setLoading(false);
      return;
    }

    toast.success("Entry added");
    setOpen(false);
    reset();
    onAdded();
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Entry
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Revenue Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="client-name">Client</Label>
              <Input
                id="client-name"
                placeholder="e.g. Acme Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="e.g. SaaS subscription, Consulting retainer"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {verticals.length > 0 && (
            <div className="space-y-2">
              <Label>Vertical (optional)</Label>
              <Select value={verticalId} onValueChange={(v) => setVerticalId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No vertical</SelectItem>
                  {verticals.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — {CURRENCY_SYMBOLS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({CURRENCY_SYMBOLS[currency]})</Label>
              <Input
                id="amount"
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
              <Label htmlFor="conv-rate">Conversion rate to INR</Label>
              <Input
                id="conv-rate"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 83"
                value={conversionRate}
                onChange={(e) => setConversionRate(e.target.value)}
                required
              />
              {previewInr !== null && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatINR(previewInr)}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expected-date">Expected date</Label>
              <Input
                id="expected-date"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Any notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding…" : "Add Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Entry Modal ─────────────────────────────────────────────────────────
function EditEntryModal({
  entry,
  onUpdated,
  verticals,
}: {
  entry: RevenueEntry;
  onUpdated: () => void;
  verticals: RevenueVertical[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState(entry.client_name);
  const [description, setDescription] = useState(entry.description);
  const [amount, setAmount] = useState(entry.amount.toString());
  const [currency, setCurrency] = useState<Currency>(entry.currency as Currency);
  const [conversionRate, setConversionRate] = useState(
    entry.conversion_rate > 1 ? entry.conversion_rate.toString() : ""
  );
  const [stage, setStage] = useState<Stage>(entry.stage);
  const [expectedDate, setExpectedDate] = useState(entry.expected_date ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [verticalId, setVerticalId] = useState(entry.vertical_id ?? "");

  useEffect(() => {
    setClientName(entry.client_name);
    setDescription(entry.description);
    setAmount(entry.amount.toString());
    setCurrency(entry.currency as Currency);
    setConversionRate(entry.conversion_rate > 1 ? entry.conversion_rate.toString() : "");
    setStage(entry.stage);
    setExpectedDate(entry.expected_date ?? "");
    setNotes(entry.notes ?? "");
    setVerticalId(entry.vertical_id ?? "");
  }, [entry]);

  const amountNum = parseFloat(amount) || 0;
  const rateNum = parseFloat(conversionRate) || entry.conversion_rate || 1;
  const previewInr =
    currency !== "INR" && amountNum > 0 && rateNum > 0
      ? Math.round(amountNum * rateNum * 100) / 100
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch(`/api/revenue/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        description,
        amount: parseFloat(amount) || 0,
        currency,
        conversion_rate: currency !== "INR" ? parseFloat(conversionRate) || 1 : 1,
        stage,
        expected_date: expectedDate || null,
        notes: notes || null,
        vertical_id: verticalId || null,
      }),
    });

    if (!res.ok) {
      toast.error("Failed to update entry");
      setLoading(false);
      return;
    }

    toast.success("Entry updated");
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
          <DialogTitle>Edit Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Client</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>

          {verticals.length > 0 && (
            <div className="space-y-2">
              <Label>Vertical (optional)</Label>
              <Select value={verticalId} onValueChange={(v) => setVerticalId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No vertical</SelectItem>
                  {verticals.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — {CURRENCY_SYMBOLS[c]}
                    </SelectItem>
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
              />
              {previewInr !== null && (
                <p className="text-xs text-muted-foreground">≈ {formatINR(previewInr)}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Expected date</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Entry Card ───────────────────────────────────────────────────────────────
function EntryCard({
  entry,
  onUpdated,
  onDeleted,
  verticals,
}: {
  entry: RevenueEntry;
  onUpdated: () => void;
  onDeleted: () => void;
  verticals: RevenueVertical[];
}) {
  const [advancing, setAdvancing] = useState(false);

  const nextStage: Record<Stage, Stage | null> = {
    expected: "invoice_sent",
    invoice_sent: "received",
    received: null,
  };
  const next = nextStage[entry.stage];

  async function advance() {
    if (!next) return;
    setAdvancing(true);
    const res = await fetch(`/api/revenue/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
    if (res.ok) {
      toast.success(`Moved to ${STAGE_LABELS[next]}`);
      onUpdated();
    } else {
      toast.error("Failed to update stage");
    }
    setAdvancing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${entry.client_name} — ${entry.description}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/revenue/${entry.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry removed");
      onDeleted();
    } else {
      toast.error("Failed to delete entry");
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{entry.client_name}</p>
          <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <EditEntryModal entry={entry} onUpdated={onUpdated} verticals={verticals} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <p className="text-base font-bold tabular-nums">
          {formatAmount(Number(entry.amount), entry.currency)}
        </p>
        {entry.currency !== "INR" && (
          <p className="text-xs text-muted-foreground">
            ≈ {formatINR(Number(entry.amount_in_inr))}
          </p>
        )}
      </div>

      {entry.vertical_id && (() => {
        const v = verticals.find((x) => x.id === entry.vertical_id);
        return v ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ background: v.color }}
          >
            {v.name}
          </span>
        ) : null;
      })()}
      {entry.expected_date && (
        <p className="text-xs text-muted-foreground">
          Expected: {formatDate(entry.expected_date)}
        </p>
      )}
      {entry.notes && (
        <p className="text-xs text-muted-foreground italic truncate">{entry.notes}</p>
      )}

      {next && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={advance}
          disabled={advancing}
        >
          {advancing ? "Moving…" : (
            <>
              Move to {STAGE_LABELS[next]}
              <ArrowRight className="h-3 w-3 ml-1" />
            </>
          )}
        </Button>
      )}
      {!next && (
        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {entry.received_date ? `Received ${formatDate(entry.received_date)}` : "Received"}
        </div>
      )}
    </div>
  );
}

// ── Pipeline Column ──────────────────────────────────────────────────────────
function PipelineColumn({
  stage,
  entries,
  onUpdated,
  onDeleted,
  verticals,
}: {
  stage: Stage;
  entries: RevenueEntry[];
  onUpdated: () => void;
  onDeleted: () => void;
  verticals: RevenueVertical[];
}) {
  const total = entries.reduce((sum, e) => sum + Number(e.amount_in_inr), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}>
            {STAGE_LABELS[stage]}
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            {entries.length}
          </span>
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {formatINR(total)}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-xs text-muted-foreground">No entries</p>
          </div>
        ) : (
          entries.map((e) => (
            <EntryCard key={e.id} entry={e} onUpdated={onUpdated} onDeleted={onDeleted} verticals={verticals} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function RevenuePage() {
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [verticals, setVerticals] = useState<RevenueVertical[]>([]);
  const [selectedVerticalId, setSelectedVerticalId] = useState<string>(""); // "" = all
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/revenue-verticals", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setVerticals(d); });
  }, []);

  async function fetchEntries() {
    const params = new URLSearchParams({ include_archived: "false" });
    if (selectedVerticalId) params.set("vertical_id", selectedVerticalId);
    const res = await fetch(`/api/revenue?${params}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }

  useEffect(() => { fetchEntries(); }, [selectedVerticalId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleExport() {
    downloadCSV(`revenue-${todayStr()}`, [
      "Client Name", "Description", "Stage", "Vertical", "Currency", "Amount", "Amount (INR)",
      "Conversion Rate", "Expected Date", "Received Date", "Notes", "Archived", "Created At",
    ], entries.map((e) => {
      const v = verticals.find((x) => x.id === e.vertical_id);
      return [
        e.client_name, e.description, e.stage, v?.name ?? "", e.currency, e.amount, e.amount_in_inr,
        e.conversion_rate, e.expected_date ?? "", e.received_date ?? "",
        e.notes ?? "", e.archived, e.created_at,
      ];
    }));
  }

  const visibleEntries = entries; // already filtered by API when vertical is selected
  const byStage = (stage: Stage) => visibleEntries.filter((e) => e.stage === stage);

  const totalPipeline = visibleEntries
    .filter((e) => e.stage !== "received")
    .reduce((sum, e) => sum + Number(e.amount_in_inr), 0);

  const totalReceived = visibleEntries
    .filter((e) => e.stage === "received")
    .reduce((sum, e) => sum + Number(e.amount_in_inr), 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue & Receivables</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your deal pipeline from expected to received.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={entries.length === 0} title="Export CSV">
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
          <AddEntryModal onAdded={fetchEntries} verticals={verticals} />
        </div>
      </div>

      {/* Vertical filter pills */}
      {verticals.length > 0 && (
        <div className="flex gap-1.5 mb-5 flex-wrap">
          <button
            onClick={() => setSelectedVerticalId("")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              selectedVerticalId === ""
                ? "bg-foreground text-background border-foreground"
                : "text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            All
          </button>
          {verticals.filter((v) => v.is_active).map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVerticalId(v.id === selectedVerticalId ? "" : v.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pipeline (Expected + Invoiced)
          </p>
          <p className="mt-1 text-2xl font-bold">{formatINR(totalPipeline)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {visibleEntries.filter((e) => e.stage !== "received").length} active entries
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Received
          </p>
          <p className="mt-1 text-2xl font-bold">{formatINR(totalReceived)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {visibleEntries.filter((e) => e.stage === "received").length} entries
          </p>
        </div>
      </div>

      {/* Pipeline Board */}
      {loading ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              entries={byStage(stage)}
              onUpdated={fetchEntries}
              onDeleted={fetchEntries}
              verticals={verticals}
            />
          ))}
        </div>
      )}
    </div>
  );
}
