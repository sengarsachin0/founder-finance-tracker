"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
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
import { EXPENSE_CATEGORIES } from "@/lib/schemas/expense";

// ── Auto-categorization rules ────────────────────────────────────────────────
const RULES: { keywords: string[]; category: string }[] = [
  { keywords: ["aws", "amazon web", "s3 ", "ec2", "gcp", "google cloud", "azure", "digitalocean", "cloudflare", "vercel", "netlify", "heroku"], category: "Infrastructure" },
  { keywords: ["google ads", "meta ads", "facebook ads", "instagram ads", "linkedin ads", "twitter ads", "adwords", "advertising"], category: "Marketing" },
  { keywords: ["slack", "notion", "linear", "github", "figma", "atlassian", "jira", "zoom", "dropbox", "airtable", "hubspot", "sendgrid", "mailchimp", "intercom", "salesforce", "freshdesk", "mixpanel", "amplitude", "segment", "postman"], category: "SaaS / Subscriptions" },
  { keywords: ["airbnb", "uber", "ola", "makemytrip", "indigo", "spicejet", "air india", "vistara", "hotel", "flight", "airline", "airport", "taxi", "rapido"], category: "Travel" },
  { keywords: ["rent", "lease", "office", "coworking", "wework", "awfis"], category: "Office" },
  { keywords: ["salary", "payroll", "wages", "stipend"], category: "Salaries" },
  { keywords: ["gst", "income tax", "tds", "tax", "challan"], category: "Taxes" },
];

function categorize(desc: string): string {
  const lower = desc.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.category;
  }
  return "Other";
}

// ── Utilities ────────────────────────────────────────────────────────────────
function parseAmount(raw: string | undefined | null): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : Math.abs(n);
}

function normalizeDate(raw: string): string {
  // Strip time portion (e.g. "11-02-2026 12:15:53" → "11-02-2026")
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i, "").trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY
  const parts = s.split(/[-/.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length <= 2 && b.length <= 2) {
      const year = c.length === 2 ? `20${c}` : c;
      return `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
  }
  // Try native parse as fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

/** Detect the most likely header row index (0-based) in raw rows */
function detectHeaderRow(rawRows: string[][]): number {
  const looksLikeDate = (s: string) =>
    /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s);
  const looksLikeNumber = (s: string) => /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s.trim());

  for (let i = 0; i < Math.min(50, rawRows.length - 1); i++) {
    const row = rawRows[i];
    const next = rawRows[i + 1];
    if (!next || row.length < 3) continue;
    // Header row: mostly non-numeric text with ≥3 non-empty cells
    const textCells = row.filter((c) => c.trim() && isNaN(Number(c.replace(/,/g, ""))));
    if (textCells.length < 3) continue;
    // Next row has a date-like value and a number
    if (next.some(looksLikeDate) && next.some(looksLikeNumber)) return i;
  }
  return 0;
}

/** Stable key from sorted header values — language-agnostic */
function headerSignature(headers: string[]): string {
  return headers
    .map((h) => h.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

const LS_PREFIX = "stmt_mapping_v1_";

function loadSavedMapping(sig: string): SavedMapping | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + sig);
    return raw ? (JSON.parse(raw) as SavedMapping) : null;
  } catch {
    return null;
  }
}

function persistMapping(sig: string, mapping: SavedMapping) {
  try {
    localStorage.setItem(LS_PREFIX + sig, JSON.stringify(mapping));
  } catch {}
}

// ── Types ────────────────────────────────────────────────────────────────────
type AmountType = "debit_col" | "amount_negative" | "debit_credit" | "dr_cr";

type ColumnMapping = {
  dateCol: string;
  descriptionCol: string;
  amountType: AmountType;
  debitCol: string;
  creditCol: string;
  amountCol: string;
  drCrCol: string;
  balanceCol: string;
};

type SavedMapping = ColumnMapping;

type ParsedRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  include: boolean;
};

type Step = "upload" | "configure" | "review";

const NONE = "__none__";

// ── Apply mapping to raw rows ─────────────────────────────────────────────────
function applyMapping(
  rawRows: string[][],
  headerRowIdx: number,
  mapping: ColumnMapping
): { rows: ParsedRow[]; skippedCredits: number } {
  const headers = rawRows[headerRowIdx] ?? [];
  const idx = (col: string) => (col === NONE ? -1 : headers.indexOf(col));

  const dateIdx = idx(mapping.dateCol);
  const descIdx = idx(mapping.descriptionCol);
  const debitIdx = idx(mapping.debitCol);
  const creditIdx = idx(mapping.creditCol);
  const amountIdx = idx(mapping.amountCol);
  const drCrIdx = idx(mapping.drCrCol);

  if (dateIdx < 0 || descIdx < 0) return { rows: [], skippedCredits: 0 };

  const dataRows = rawRows.slice(headerRowIdx + 1);
  const results: ParsedRow[] = [];
  let skippedCredits = 0;

  for (const row of dataRows) {
    const rawDate = row[dateIdx]?.trim();
    const rawDesc = row[descIdx]?.trim();
    if (!rawDate || !rawDesc) continue;

    let amount = 0;
    if (mapping.amountType === "debit_col" && debitIdx >= 0) {
      amount = parseAmount(row[debitIdx]);
    } else if (mapping.amountType === "debit_credit" && debitIdx >= 0) {
      amount = parseAmount(row[debitIdx]);
      // Ignore rows where only credit is set (inflow)
      if (amount === 0 && creditIdx >= 0 && parseAmount(row[creditIdx]) > 0) {
        skippedCredits++;
        continue;
      }
    } else if (mapping.amountType === "amount_negative" && amountIdx >= 0) {
      const raw = String(row[amountIdx] ?? "").trim();
      const n = parseFloat(raw.replace(/,/g, ""));
      if (n >= 0) {
        if (n > 0) skippedCredits++;
        continue; // only debits (negative values)
      }
      amount = Math.abs(n);
    } else if (mapping.amountType === "dr_cr" && amountIdx >= 0 && drCrIdx >= 0) {
      const drcr = row[drCrIdx]?.trim().toUpperCase();
      if (drcr !== "DR") {
        if (drcr === "CR") skippedCredits++;
        continue; // only import debits
      }
      amount = -Math.abs(parseAmount(row[amountIdx]));
    }

    // dr_cr mode: valid expenses are negative; all other modes: positive
    if (mapping.amountType === "dr_cr" ? amount >= 0 : amount <= 0) continue;

    results.push({
      id: crypto.randomUUID(),
      date: normalizeDate(rawDate),
      description: rawDesc,
      amount,
      category: categorize(rawDesc),
      include: true,
    });
  }

  return { rows: results, skippedCredits };
}

// ── ColumnSelect helper ───────────────────────────────────────────────────────
function ColumnSelect({
  label,
  value,
  onChange,
  headers,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  headers: string[];
  required?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
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
            <SelectItem key={h} value={h} className="text-sm">
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function UploadStatementModal({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Configure step state
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateCol: NONE,
    descriptionCol: NONE,
    amountType: "debit_col",
    debitCol: NONE,
    creditCol: NONE,
    amountCol: NONE,
    drCrCol: NONE,
    balanceCol: NONE,
  });
  const [savedMappingApplied, setSavedMappingApplied] = useState(false);
  const [headerSig, setHeaderSig] = useState("");

  // Review step state
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [skippedCredits, setSkippedCredits] = useState(0);
  const [importing, setImporting] = useState(false);

  function reset() {
    setStep("upload");
    setParseError(null);
    setParsing(false);
    setRawRows([]);
    setHeaderRowIdx(0);
    setMapping({ dateCol: NONE, descriptionCol: NONE, amountType: "debit_col", debitCol: NONE, creditCol: NONE, amountCol: NONE, drCrCol: NONE, balanceCol: NONE });
    setSavedMappingApplied(false);
    setHeaderSig("");
    setRows([]);
    setSkippedCredits(0);
    setImporting(false);
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  // ── CSV upload → configure step ──────────────────────────────────────────
  function handleCSV(file: File) {
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
        const sig = headerSignature(headers);

        setRawRows(allRows);
        setHeaderRowIdx(detectedIdx);
        setHeaderSig(sig);

        // Try to load a saved mapping for this bank format
        const saved = loadSavedMapping(sig);
        if (saved) {
          setMapping(saved);
          setSavedMappingApplied(true);
        } else {
          setSavedMappingApplied(false);
          // Attempt a best-guess mapping from header names
          const h = headers.map((x) => x.toLowerCase().trim());
          const findCol = (needles: string[]) => {
            for (const needle of needles) {
              const i = h.findIndex((c) => c.includes(needle));
              if (i !== -1) return headers[i];
            }
            return NONE;
          };
          const guessedDebit = findCol(["withdrawal", "debit", "dr "]);
          const guessedCredit = findCol(["deposit", "credit", "cr "]);
          const guessedAmount = findCol(["amount"]);
          const guessedDrCr = findCol(["dr/cr", "dr cr", "drcr", "type", "txn type", "transaction type"]);
          setMapping({
            dateCol: findCol(["tran date", "txn date", "transaction date", "value date", "date"]),
            descriptionCol: findCol(["description", "narration", "particulars", "details", "remarks"]),
            amountType:
              guessedDrCr !== NONE && guessedAmount !== NONE ? "dr_cr"
              : guessedDebit !== NONE ? "debit_col"
              : guessedAmount !== NONE ? "amount_negative"
              : "debit_col",
            debitCol: guessedDebit,
            creditCol: guessedCredit,
            amountCol: guessedAmount,
            drCrCol: guessedDrCr,
            balanceCol: findCol(["balance", "closing bal", "bal"]),
          });
        }

        setParsing(false);
        setStep("configure");
      },
      error(err) {
        setParseError(`CSV parse error: ${err.message}`);
        setParsing(false);
      },
    });
  }

  // ── PDF upload → review step (server-side extraction) ────────────────────
  async function handlePDF(file: File) {
    setParsing(true);
    setParseError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/expenses/parse-statement", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok || !json.transactions) {
      setParseError(json.error ?? "Failed to parse PDF. Try exporting a CSV from your bank instead.");
      setParsing(false);
      return;
    }
    const parsed: ParsedRow[] = (json.transactions as { date: string; description: string; amount: number }[]).map((t) => ({
      id: crypto.randomUUID(),
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: categorize(t.description),
      include: true,
    }));
    if (parsed.length === 0) {
      setParseError("No transactions detected in PDF. Try exporting a CSV instead.");
      setParsing(false);
      return;
    }
    setRows(parsed);
    setParsing(false);
    setStep("review");
  }

  function handleFile(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) handleCSV(file);
    else if (name.endsWith(".pdf")) handlePDF(file);
    else setParseError("Please upload a .csv or .pdf file.");
  }

  // ── Configure → Review ────────────────────────────────────────────────────
  function handleConfigureNext() {
    if (!mapping.dateCol || mapping.dateCol === NONE) {
      toast.error("Please map the Date column");
      return;
    }
    if (!mapping.descriptionCol || mapping.descriptionCol === NONE) {
      toast.error("Please map the Description column");
      return;
    }
    const hasAmount =
      (mapping.amountType === "debit_col" && mapping.debitCol !== NONE) ||
      (mapping.amountType === "amount_negative" && mapping.amountCol !== NONE) ||
      (mapping.amountType === "debit_credit" && mapping.debitCol !== NONE) ||
      (mapping.amountType === "dr_cr" && mapping.amountCol !== NONE && mapping.drCrCol !== NONE);
    if (!hasAmount) {
      if (mapping.amountType === "dr_cr") {
        toast.error("Please map both the Amount column and the DR/CR indicator column");
      } else {
        toast.error("Please map at least one amount column");
      }
      return;
    }

    const { rows: parsed, skippedCredits: credits } = applyMapping(rawRows, headerRowIdx, mapping);
    if (parsed.length === 0) {
      toast.error("No debit transactions found with this mapping. Check your column assignments.");
      return;
    }

    setRows(parsed);
    setSkippedCredits(credits);
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
            name: row.description,
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

    // Persist mapping for next time (CSV only)
    if (headerSig) persistMapping(headerSig, mapping);

    setImporting(false);
    setOpen(false);
    reset();
    onImported();
    const skippedMsg = skippedCredits > 0 ? ` · Skipped ${skippedCredits} credit transaction${skippedCredits !== 1 ? "s" : ""}` : "";
    if (failed === 0) toast.success(`Imported ${success} expense${success !== 1 ? "s" : ""}${skippedMsg}`);
    else toast.warning(`Imported ${success}, failed ${failed}${skippedMsg}`);
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

  // Row preview: show up to 12 rows centered around detected header
  const previewStart = Math.max(0, headerRowIdx - 2);
  const previewRows = rawRows.slice(previewStart, previewStart + 12);

  // ── Dialog width by step ──────────────────────────────────────────────────
  const dialogWidth =
    step === "review" ? "sm:max-w-4xl" : step === "configure" ? "sm:max-w-4xl" : "sm:max-w-md";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload className="h-4 w-4 mr-1.5" />
        Upload Statement
      </DialogTrigger>

      <DialogContent className={`${dialogWidth} max-h-[90vh] flex flex-col`}>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === "upload" && "Upload Bank Statement"}
            {step === "configure" && "Configure Import"}
            {step === "review" && `Review Transactions (${selected.length} selected)`}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Upload ──────────────────────────────────────────────── */}
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
                  <p className="text-sm font-medium">Drop your bank statement here</p>
                  <p className="text-xs text-muted-foreground">CSV or PDF · click to browse</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><p>{parseError}</p>
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Supported formats</p>
              <p>CSV: Any bank — you will map columns in the next step</p>
              <p>PDF: Best-effort text extraction — CSV is more reliable</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ───────────────────────────────────────────── */}
        {step === "configure" && (
          <>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pt-2 pr-1">

              {/* Saved mapping banner */}
              {savedMappingApplied && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>Mapping auto-applied from a previous import of this bank format. Review below or adjust as needed.</span>
                </div>
              )}

              {/* ── Start row ── */}
              <div>
                <p className="text-sm font-medium mb-2">
                  Header row
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Click the row that contains column names
                  </span>
                </p>
                {/* overflow-x-auto prevents table from blowing out modal width */}
                <div className="rounded-lg border overflow-x-auto max-h-52 overflow-y-auto">
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
                              const sig = headerSignature(newHeaders);
                              setHeaderSig(sig);
                              setMapping((m) => ({
                                ...m,
                                dateCol: newHeaders.includes(m.dateCol) ? m.dateCol : NONE,
                                descriptionCol: newHeaders.includes(m.descriptionCol) ? m.descriptionCol : NONE,
                                debitCol: newHeaders.includes(m.debitCol) ? m.debitCol : NONE,
                                creditCol: newHeaders.includes(m.creditCol) ? m.creditCol : NONE,
                                amountCol: newHeaders.includes(m.amountCol) ? m.amountCol : NONE,
                                drCrCol: newHeaders.includes(m.drCrCol) ? m.drCrCol : NONE,
                                balanceCol: newHeaders.includes(m.balanceCol) ? m.balanceCol : NONE,
                              }));
                            }}
                            className={`cursor-pointer transition-colors border-b last:border-b-0 ${
                              isHeader
                                ? "bg-primary/10 font-semibold"
                                : isData
                                ? "bg-muted/30"
                                : "hover:bg-muted/20"
                            }`}
                          >
                            <td className="px-2 py-1.5 text-muted-foreground w-8 select-none sticky left-0 bg-inherit">
                              {absIdx + 1}
                            </td>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5 max-w-[200px] truncate">
                                {isHeader ? (
                                  <span className="text-primary">{cell}</span>
                                ) : (
                                  cell || <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            ))}
                            {isHeader && (
                              <td className="px-2 py-1.5 text-primary text-xs font-normal">
                                ← header
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Column mapping ── */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Column mapping</p>

                <ColumnSelect label="Date" value={mapping.dateCol} onChange={(v) => setMapping((m) => ({ ...m, dateCol: v }))} headers={headers} required />
                <ColumnSelect label="Description" value={mapping.descriptionCol} onChange={(v) => setMapping((m) => ({ ...m, descriptionCol: v }))} headers={headers} required />

                {/* Amount type */}
                <div className="grid grid-cols-[120px_1fr] items-start gap-3">
                  <Label className="text-sm text-right pt-2">Amount type</Label>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { value: "debit_col", label: "Separate debit/withdrawal column" },
                      { value: "debit_credit", label: "Debit + Credit columns" },
                      { value: "amount_negative", label: "Single amount (negative = expense)" },
                      { value: "dr_cr", label: "Amount column + DR/CR indicator column" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name="amountType"
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

                {mapping.amountType === "debit_col" && (
                  <ColumnSelect label="Debit / Withdrawal" value={mapping.debitCol} onChange={(v) => setMapping((m) => ({ ...m, debitCol: v }))} headers={headers} required />
                )}
                {mapping.amountType === "debit_credit" && (
                  <>
                    <ColumnSelect label="Debit column" value={mapping.debitCol} onChange={(v) => setMapping((m) => ({ ...m, debitCol: v }))} headers={headers} required />
                    <ColumnSelect label="Credit column" value={mapping.creditCol} onChange={(v) => setMapping((m) => ({ ...m, creditCol: v }))} headers={headers} />
                  </>
                )}
                {mapping.amountType === "amount_negative" && (
                  <ColumnSelect label="Amount column" value={mapping.amountCol} onChange={(v) => setMapping((m) => ({ ...m, amountCol: v }))} headers={headers} required />
                )}
                {mapping.amountType === "dr_cr" && (
                  <>
                    <ColumnSelect label="Amount column" value={mapping.amountCol} onChange={(v) => setMapping((m) => ({ ...m, amountCol: v }))} headers={headers} required />
                    <ColumnSelect label="DR/CR column" value={mapping.drCrCol} onChange={(v) => setMapping((m) => ({ ...m, drCrCol: v }))} headers={headers} required />
                  </>
                )}

                <ColumnSelect label="Balance (optional)" value={mapping.balanceCol} onChange={(v) => setMapping((m) => ({ ...m, balanceCol: v }))} headers={headers} />
              </div>
            </div>

            {/* Sticky footer */}
            <div className="shrink-0 flex justify-between pt-4 border-t mt-2">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleConfigureNext}>Preview transactions</Button>
            </div>
          </>
        )}

        {/* ── Step 3: Review ──────────────────────────────────────────────── */}
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
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
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
                      <td className="px-3 py-2 min-w-[200px]">
                        <Input value={row.description} onChange={(e) => updateField(row.id, "description", e.target.value)} className="h-7 text-xs px-2" />
                      </td>
                      <td className="px-3 py-2 min-w-[160px]">
                        <Select value={row.category} onValueChange={(v) => updateField(row.id, "category", v)}>
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
                {selected.length} of {rows.length} selected · Imported as paid expenses
                {skippedCredits > 0 && <span className="ml-1">· {skippedCredits} credit{skippedCredits !== 1 ? "s" : ""} skipped</span>}
                {headerSig && <span className="ml-1">· mapping saved for this bank</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(rawRows.length > 0 ? "configure" : "upload")} disabled={importing}>
                  Back
                </Button>
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
