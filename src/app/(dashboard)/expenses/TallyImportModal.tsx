"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Sparkles, BookOpen } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EXPENSE_CATEGORIES } from "@/lib/schemas/expense";
import type { TallyLedgerMapping } from "@/lib/schemas/tally-mapping";

// ── Utilities ─────────────────────────────────────────────────────────────────
function parseAmount(raw: string | undefined | null): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : Math.abs(n);
}

function normalizeDate(raw: string): string {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[-/.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length <= 2 && b.length <= 2) {
      const year = c.length === 2 ? `20${c}` : c;
      return `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

// Auto-categorize by keyword as fallback
const RULES: { keywords: string[]; category: string }[] = [
  { keywords: ["salary", "payroll", "wages", "stipend"], category: "Salaries" },
  { keywords: ["aws", "google cloud", "azure", "hosting", "server"], category: "Infrastructure" },
  { keywords: ["slack", "notion", "github", "figma", "zoom", "saas", "subscription"], category: "SaaS / Subscriptions" },
  { keywords: ["rent", "lease", "office", "coworking"], category: "Office" },
  { keywords: ["gst", "income tax", "tds", "tax", "challan"], category: "Taxes" },
  { keywords: ["travel", "flight", "hotel", "uber", "ola", "cab"], category: "Travel" },
  { keywords: ["google ads", "meta ads", "advertising", "marketing"], category: "Marketing" },
  { keywords: ["consultant", "legal", "audit", "ca ", "lawyer"], category: "Professional Services" },
];

function autoCategory(ledger: string): string {
  const lower = ledger.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.category;
  }
  return "Other";
}

// ── Column detection helpers ───────────────────────────────────────────────────
function detectHeaderRow(rawRows: string[][]): number {
  const looksLikeDate = (s: string) =>
    /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s);
  const looksLikeNumber = (s: string) => /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s.trim());
  for (let i = 0; i < Math.min(50, rawRows.length - 1); i++) {
    const row = rawRows[i];
    const next = rawRows[i + 1];
    if (!next || row.length < 3) continue;
    const textCells = row.filter((c) => c.trim() && isNaN(Number(c.replace(/,/g, ""))));
    if (textCells.length < 3) continue;
    if (next.some(looksLikeDate) && next.some(looksLikeNumber)) return i;
  }
  return 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type AmountType = "debit_col" | "debit_credit" | "amount_col";

type ColumnMapping = {
  dateCol: string;
  ledgerCol: string;
  amountType: AmountType;
  debitCol: string;
  creditCol: string;
  amountCol: string;
};

type ParsedRow = {
  id: string;
  date: string;
  ledger: string;
  amount: number;
  category: string;
  include: boolean;
};

type Step = "upload" | "configure" | "map-ledgers" | "review";

const NONE = "__none__";

// ── ColumnSelect ───────────────────────────────────────────────────────────────
function ColumnSelect({
  label,
  value,
  onChange,
  headers,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string | null) => void;
  headers: string[];
  required?: boolean;
}) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3">
      <Label className="text-sm text-right">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Select value={value || NONE} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="— not mapped —" />
        </SelectTrigger>
        <SelectContent>
          {!required && (
            <SelectItem value={NONE} className="text-sm text-muted-foreground">
              — not mapped —
            </SelectItem>
          )}
          {headers.map((h) => (
            <SelectItem key={h} value={h} className="text-sm">{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function TallyImportModal({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Configure step
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateCol: NONE,
    ledgerCol: NONE,
    amountType: "debit_col",
    debitCol: NONE,
    creditCol: NONE,
    amountCol: NONE,
  });

  // Ledger mapping step
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [ledgerMap, setLedgerMap] = useState<Record<string, string>>({}); // ledger → category
  const [savedLedgers, setSavedLedgers] = useState<Set<string>>(new Set()); // which are from DB
  const [loadingMappings, setLoadingMappings] = useState(false);

  // Review step
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  function reset() {
    setStep("upload");
    setParseError(null);
    setParsing(false);
    setRawRows([]);
    setHeaderRowIdx(0);
    setMapping({ dateCol: NONE, ledgerCol: NONE, amountType: "debit_col", debitCol: NONE, creditCol: NONE, amountCol: NONE });
    setParsedRows([]);
    setLedgerMap({});
    setSavedLedgers(new Set());
    setRows([]);
    setImporting(false);
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  // ── CSV Upload ────────────────────────────────────────────────────────────
  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file. Tally exports CSV via Gateway of Tally → Display → Day Book.");
      return;
    }
    setParsing(true);
    setParseError(null);

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: false,
      complete(results) {
        const allRows = (results.data as string[][]).filter((r) => r.some((c) => c?.trim()));
        if (allRows.length < 2) {
          setParseError("File appears to be empty or has too few rows.");
          setParsing(false);
          return;
        }

        const detectedIdx = detectHeaderRow(allRows);
        const headers = allRows[detectedIdx] ?? [];
        const h = headers.map((x) => x.toLowerCase().trim());

        const findCol = (needles: string[]) => {
          for (const needle of needles) {
            const i = h.findIndex((c) => c.includes(needle));
            if (i !== -1) return headers[i];
          }
          return NONE;
        };

        const guessedDebit = findCol(["debit", "dr amount", "withdrawal"]);
        const guessedCredit = findCol(["credit", "cr amount", "deposit"]);
        const guessedAmount = findCol(["amount"]);

        setRawRows(allRows);
        setHeaderRowIdx(detectedIdx);
        setMapping({
          dateCol: findCol(["date"]),
          ledgerCol: findCol(["particulars", "ledger", "narration", "account"]),
          amountType:
            guessedDebit !== NONE ? "debit_col"
            : guessedAmount !== NONE ? "amount_col"
            : "debit_col",
          debitCol: guessedDebit,
          creditCol: guessedCredit,
          amountCol: guessedAmount,
        });

        setParsing(false);
        setStep("configure");
      },
      error(err) {
        setParseError(`CSV parse error: ${err.message}`);
        setParsing(false);
      },
    });
  }

  // ── Configure → Map Ledgers ───────────────────────────────────────────────
  async function handleConfigureNext() {
    if (mapping.dateCol === NONE) { toast.error("Please map the Date column"); return; }
    if (mapping.ledgerCol === NONE) { toast.error("Please map the Ledger / Particulars column"); return; }
    const hasAmount =
      (mapping.amountType === "debit_col" && mapping.debitCol !== NONE) ||
      (mapping.amountType === "debit_credit" && mapping.debitCol !== NONE) ||
      (mapping.amountType === "amount_col" && mapping.amountCol !== NONE);
    if (!hasAmount) { toast.error("Please map an amount column"); return; }

    // Extract rows
    const headers = rawRows[headerRowIdx] ?? [];
    const idx = (col: string) => (col === NONE ? -1 : headers.indexOf(col));
    const dateIdx = idx(mapping.dateCol);
    const ledgerIdx = idx(mapping.ledgerCol);
    const debitIdx = idx(mapping.debitCol);
    const creditIdx = idx(mapping.creditCol);
    const amountIdx = idx(mapping.amountCol);

    const extracted: ParsedRow[] = [];
    for (const row of rawRows.slice(headerRowIdx + 1)) {
      const rawDate = row[dateIdx]?.trim();
      const rawLedger = row[ledgerIdx]?.trim();
      if (!rawDate || !rawLedger) continue;

      let amount = 0;
      if (mapping.amountType === "debit_col" && debitIdx >= 0) {
        amount = parseAmount(row[debitIdx]);
      } else if (mapping.amountType === "debit_credit" && debitIdx >= 0) {
        amount = parseAmount(row[debitIdx]);
        if (amount === 0 && creditIdx >= 0 && parseAmount(row[creditIdx]) > 0) continue;
      } else if (mapping.amountType === "amount_col" && amountIdx >= 0) {
        amount = parseAmount(row[amountIdx]);
      }
      if (amount <= 0) continue;

      extracted.push({
        id: crypto.randomUUID(),
        date: normalizeDate(rawDate),
        ledger: rawLedger,
        amount,
        category: "Other",
        include: true,
      });
    }

    if (extracted.length === 0) {
      toast.error("No debit transactions found. Check your column mapping.");
      return;
    }

    // Load saved mappings from DB
    setLoadingMappings(true);
    let dbMappings: TallyLedgerMapping[] = [];
    try {
      const res = await fetch("/api/settings/tally-mappings", { cache: "no-store" });
      if (res.ok) dbMappings = await res.json();
    } catch { /* ignore */ }
    setLoadingMappings(false);

    const dbMap: Record<string, string> = {};
    const savedSet = new Set<string>();
    dbMappings.forEach((m) => { dbMap[m.ledger_name] = m.category; savedSet.add(m.ledger_name); });

    // Build initial ledger map: DB mapping → auto-category → Other
    const uniqueLedgers = Array.from(new Set(extracted.map((r) => r.ledger)));
    const initialMap: Record<string, string> = {};
    uniqueLedgers.forEach((l) => {
      initialMap[l] = dbMap[l] ?? autoCategory(l);
    });

    setParsedRows(extracted);
    setLedgerMap(initialMap);
    setSavedLedgers(savedSet);
    setStep("map-ledgers");
  }

  // ── Map Ledgers → Review ──────────────────────────────────────────────────
  function handleLedgerMappingNext() {
    const withCategories = parsedRows.map((r) => ({
      ...r,
      category: ledgerMap[r.ledger] ?? "Other",
    }));
    setRows(withCategories);
    setStep("review");
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport() {
    const toImport = rows.filter((r) => r.include);
    if (toImport.length === 0) { toast.error("No transactions selected"); return; }
    setImporting(true);

    let success = 0;
    let failed = 0;
    await Promise.all(
      toImport.map(async (row) => {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.ledger,
            category: row.category,
            amount: row.amount,
            currency: "INR",
            due_date: null,
            is_paid: true,
            paid_date: row.date,
            is_recurring: false,
          }),
        });
        if (res.ok) success++;
        else failed++;
      })
    );

    // Save ledger → category mappings to DB
    const mappingsToSave = Object.entries(ledgerMap).map(([ledger_name, category]) => ({
      ledger_name,
      category,
    }));
    if (mappingsToSave.length > 0) {
      await fetch("/api/settings/tally-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mappingsToSave),
      });
    }

    setImporting(false);
    setOpen(false);
    reset();
    onImported();
    if (failed === 0) toast.success(`Imported ${success} Tally transaction${success !== 1 ? "s" : ""}`);
    else toast.warning(`Imported ${success}, failed ${failed}`);
  }

  // ── Row helpers ───────────────────────────────────────────────────────────
  function toggle(id: string) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, include: !row.include } : row)));
  }
  function updateField<K extends keyof ParsedRow>(id: string, key: K, value: ParsedRow[K]) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  const selected = rows.filter((r) => r.include);
  const allChecked = rows.length > 0 && rows.every((r) => r.include);
  const headers = rawRows[headerRowIdx] ?? [];
  const previewStart = Math.max(0, headerRowIdx - 2);
  const previewRows = rawRows.slice(previewStart, previewStart + 10);
  const uniqueLedgers = Object.keys(ledgerMap).sort();

  const dialogWidth =
    step === "review" || step === "map-ledgers" || step === "configure"
      ? "sm:max-w-3xl"
      : "sm:max-w-md";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <BookOpen className="h-4 w-4 mr-1.5" />
        Import Tally
      </DialogTrigger>

      <DialogContent className={`${dialogWidth} max-h-[90vh] flex flex-col`}>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === "upload" && "Import from Tally"}
            {step === "configure" && "Configure Columns"}
            {step === "map-ledgers" && `Map Ledgers to Categories (${uniqueLedgers.length} unique)`}
            {step === "review" && `Review Transactions (${selected.length} selected)`}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4 pt-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}`}
            >
              {parsing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Reading file…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop your Tally CSV here</p>
                  <p className="text-xs text-muted-foreground">CSV only · click to browse</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><p>{parseError}</p>
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">How to export from Tally</p>
              <p>Gateway of Tally → Display → Day Book → Export → Format: ASCII (Comma Delimited)</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ──────────────────────────────────────────── */}
        {step === "configure" && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pt-2 pr-1">
              {/* Header row picker */}
              <div>
                <p className="text-sm font-medium mb-2">
                  Header row
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Click the row that contains column names
                  </span>
                </p>
                <div className="rounded-lg border overflow-x-auto max-h-40 overflow-y-auto">
                  <table className="text-xs whitespace-nowrap">
                    <tbody>
                      {previewRows.map((row, relIdx) => {
                        const absIdx = previewStart + relIdx;
                        const isHeader = absIdx === headerRowIdx;
                        const isData = absIdx === headerRowIdx + 1;
                        return (
                          <tr
                            key={absIdx}
                            onClick={() => {
                              setHeaderRowIdx(absIdx);
                              const newHeaders = rawRows[absIdx] ?? [];
                              setMapping((m) => ({
                                ...m,
                                dateCol: newHeaders.includes(m.dateCol) ? m.dateCol : NONE,
                                ledgerCol: newHeaders.includes(m.ledgerCol) ? m.ledgerCol : NONE,
                                debitCol: newHeaders.includes(m.debitCol) ? m.debitCol : NONE,
                                creditCol: newHeaders.includes(m.creditCol) ? m.creditCol : NONE,
                                amountCol: newHeaders.includes(m.amountCol) ? m.amountCol : NONE,
                              }));
                            }}
                            className={`cursor-pointer transition-colors border-b last:border-b-0 ${isHeader ? "bg-primary/10 font-semibold" : isData ? "bg-muted/30" : "hover:bg-muted/20"}`}
                          >
                            <td className="px-2 py-1.5 text-muted-foreground w-8 select-none sticky left-0 bg-inherit">{absIdx + 1}</td>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5 max-w-[180px] truncate">
                                {isHeader ? <span className="text-primary">{cell}</span> : (cell || <span className="text-muted-foreground/40">—</span>)}
                              </td>
                            ))}
                            {isHeader && <td className="px-2 py-1.5 text-primary text-xs font-normal">← header</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column mapping */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Column mapping</p>
                <ColumnSelect label="Date" value={mapping.dateCol} onChange={(v) => setMapping((m) => ({ ...m, dateCol: v }))} headers={headers} required />
                <ColumnSelect label="Ledger / Particulars" value={mapping.ledgerCol} onChange={(v) => setMapping((m) => ({ ...m, ledgerCol: v }))} headers={headers} required />

                <div className="grid grid-cols-[130px_1fr] items-start gap-3">
                  <Label className="text-sm text-right pt-2">Amount type</Label>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { value: "debit_col", label: "Separate Debit column" },
                      { value: "debit_credit", label: "Debit + Credit columns" },
                      { value: "amount_col", label: "Single Amount column" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name="tallyAmountType"
                          value={opt.value}
                          checked={mapping.amountType === opt.value}
                          onChange={() => setMapping((m) => ({ ...m, amountType: opt.value as AmountType }))}
                          className="accent-primary"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {(mapping.amountType === "debit_col" || mapping.amountType === "debit_credit") && (
                  <ColumnSelect label="Debit column" value={mapping.debitCol} onChange={(v) => setMapping((m) => ({ ...m, debitCol: v }))} headers={headers} required />
                )}
                {mapping.amountType === "debit_credit" && (
                  <ColumnSelect label="Credit column" value={mapping.creditCol} onChange={(v) => setMapping((m) => ({ ...m, creditCol: v }))} headers={headers} />
                )}
                {mapping.amountType === "amount_col" && (
                  <ColumnSelect label="Amount column" value={mapping.amountCol} onChange={(v) => setMapping((m) => ({ ...m, amountCol: v }))} headers={headers} required />
                )}
              </div>
            </div>
            <div className="shrink-0 flex justify-between pt-4 border-t mt-2">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleConfigureNext} disabled={loadingMappings}>
                {loadingMappings ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Loading…</> : "Map ledgers →"}
              </Button>
            </div>
          </>
        )}

        {/* ── Step 3: Map Ledgers ─────────────────────────────────────────── */}
        {step === "map-ledgers" && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 pt-2 pr-1">
              <div className="flex items-center gap-2 mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>
                  Assign an expense category to each Tally ledger. Mappings are saved and auto-applied on future imports.
                </span>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ledger Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-52">Category</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {uniqueLedgers.map((ledger) => (
                      <tr key={ledger} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 font-medium">{ledger}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={ledgerMap[ledger] ?? "Other"}
                            onValueChange={(v) => setLedgerMap((m) => ({ ...m, [ledger]: v ?? m[ledger] ?? "Other" }))}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EXPENSE_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {savedLedgers.has(ledger) ? (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">Saved</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">New</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {parsedRows.length} transaction{parsedRows.length !== 1 ? "s" : ""} across {uniqueLedgers.length} ledger{uniqueLedgers.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="shrink-0 flex justify-between pt-4 border-t mt-2">
              <Button variant="outline" onClick={() => setStep("configure")}>Back</Button>
              <Button onClick={handleLedgerMappingNext}>Preview transactions →</Button>
            </div>
          </>
        )}

        {/* ── Step 4: Review ─────────────────────────────────────────────── */}
        {step === "review" && (
          <div className="flex flex-col flex-1 min-h-0 gap-4 pt-2">
            <div className="overflow-auto flex-1 min-h-0 rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" checked={allChecked}
                        onChange={() => setRows((r) => r.map((row) => ({ ...row, include: !allChecked })))}
                        className="rounded" />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ledger</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className={`transition-colors ${row.include ? "hover:bg-muted/20" : "opacity-40 bg-muted/10"}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={row.include} onChange={() => toggle(row.id)} className="rounded" />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">{row.date}</td>
                      <td className="px-3 py-2 min-w-[160px]">
                        <Input value={row.ledger} onChange={(e) => updateField(row.id, "ledger", e.target.value)} className="h-7 text-xs px-2" />
                      </td>
                      <td className="px-3 py-2 min-w-[140px]">
                        <Select value={row.category} onValueChange={(v) => updateField(row.id, "category", v ?? row.category)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" step="0.01" value={row.amount}
                          onChange={(e) => updateField(row.id, "amount", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs px-2 text-right w-28 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {selected.length} of {rows.length} selected · Imported as paid expenses · ledger mappings saved
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("map-ledgers")} disabled={importing}>Back</Button>
                <Button onClick={handleImport} disabled={importing || selected.length === 0}>
                  {importing ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Importing…</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-1.5" />Import {selected.length} transaction{selected.length !== 1 ? "s" : ""}</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
