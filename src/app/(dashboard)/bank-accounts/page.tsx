"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Download } from "lucide-react";
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
  type BankAccount,
  type Currency,
} from "@/lib/schemas/bank-account";

function formatAmount(amount: number, currency: Currency) {
  const symbol = CURRENCY_SYMBOLS[currency];
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
  return `${symbol}${formatted}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Add Account Modal ──────────────────────────────────────────────────────
function AddAccountModal({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [balance, setBalance] = useState("");
  const [conversionRate, setConversionRate] = useState("");

  const balanceNum = parseFloat(balance) || 0;
  const rateNum = parseFloat(conversionRate) || 1;
  const previewInr =
    currency !== "INR" && balanceNum > 0 && rateNum > 0
      ? Math.round(balanceNum * rateNum * 100) / 100
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bank_name: bankName,
        account_name: accountName,
        currency,
        balance: parseFloat(balance) || 0,
        conversion_rate: currency !== "INR" ? parseFloat(conversionRate) || 1 : 1,
      }),
    });

    if (!res.ok) {
      toast.error("Failed to add account");
      setLoading(false);
      return;
    }

    toast.success("Account added");
    setOpen(false);
    setBankName("");
    setAccountName("");
    setCurrency("INR");
    setBalance("");
    setConversionRate("");
    onAdded();
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Account
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="bank-name">Bank name</Label>
            <Input
              id="bank-name"
              placeholder="e.g. Axis Bank, HDFC, ICICI, DBS"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-name">Account label</Label>
            <Input
              id="account-name"
              placeholder="e.g. Current Account"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
          </div>
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
            <Label htmlFor="balance">
              Current balance ({CURRENCY_SYMBOLS[currency]})
            </Label>
            <Input
              id="balance"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
            />
          </div>
          {currency !== "INR" && (
            <div className="space-y-2">
              <Label htmlFor="conversion-rate">Conversion rate to INR</Label>
              <Input
                id="conversion-rate"
                type="number"
                min="0"
                step="0.01"
                placeholder={`e.g. 83`}
                value={conversionRate}
                onChange={(e) => setConversionRate(e.target.value)}
                required
              />
              {previewInr !== null && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatAmount(previewInr, "INR")}
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding…" : "Add Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Update Balance Modal ───────────────────────────────────────────────────
function UpdateBalanceModal({
  account,
  onUpdated,
}: {
  account: BankAccount;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(account.balance.toString());
  const [conversionRate, setConversionRate] = useState(
    account.conversion_rate > 1 ? account.conversion_rate.toString() : ""
  );
  const [notes, setNotes] = useState(account.notes ?? "");

  useEffect(() => {
    setBalance(account.balance.toString());
    setConversionRate(account.conversion_rate > 1 ? account.conversion_rate.toString() : "");
    setNotes(account.notes ?? "");
  }, [account]);

  const balanceNum = parseFloat(balance) || 0;
  const rateNum = parseFloat(conversionRate) || account.conversion_rate || 1;
  const previewInr =
    account.currency !== "INR" && balanceNum > 0 && rateNum > 0
      ? Math.round(balanceNum * rateNum * 100) / 100
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch(`/api/bank-accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        balance: parseFloat(balance) || 0,
        conversion_rate:
          account.currency !== "INR" ? parseFloat(conversionRate) || account.conversion_rate || 1 : 1,
        notes: notes || undefined,
      }),
    });

    if (!res.ok) {
      toast.error("Failed to update balance");
      setLoading(false);
      return;
    }

    toast.success("Balance updated");
    setOpen(false);
    onUpdated();
    setLoading(false);
  }

  const symbol = CURRENCY_SYMBOLS[account.currency] ?? account.currency;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Balance — {account.account_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor={`balance-${account.id}`}>
              New balance ({symbol})
            </Label>
            <Input
              id={`balance-${account.id}`}
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
              autoFocus
            />
          </div>
          {account.currency !== "INR" && (
            <div className="space-y-2">
              <Label htmlFor={`rate-${account.id}`}>Conversion rate to INR</Label>
              <Input
                id={`rate-${account.id}`}
                type="number"
                min="0"
                step="0.01"
                placeholder={`e.g. 83`}
                value={conversionRate}
                onChange={(e) => setConversionRate(e.target.value)}
              />
              {previewInr !== null && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatAmount(previewInr, "INR")}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`notes-${account.id}`}>Notes (optional)</Label>
            <Input
              id={`notes-${account.id}`}
              placeholder="e.g. Verified on bank statement"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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

// ── Main Page ──────────────────────────────────────────────────────────────
export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAccounts() {
    // no-store prevents the browser from serving a cached GET response
    // after a mutation (add / edit / delete)
    const res = await fetch("/api/bank-accounts", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  function handleExport() {
    downloadCSV(`bank-accounts-${todayStr()}`, [
      "Bank Name", "Account Name", "Currency", "Balance", "Balance (INR)", "Conversion Rate", "Notes", "Last Updated",
    ], accounts.map((a) => [
      a.bank_name, a.account_name, a.currency, a.balance,
      a.balance_in_inr, a.conversion_rate, a.notes ?? "", a.updated_at,
    ]));
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/bank-accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Account removed");
      fetchAccounts();
    } else {
      toast.error("Failed to delete account");
    }
  }

  // Total in INR — sums balance_in_inr across all accounts (non-INR converted server-side)
  const inrTotal = accounts.reduce((sum, a) => sum + Number(a.balance_in_inr), 0);

  // Per-currency subtotals for non-INR accounts
  const usdTotal = accounts.filter((a) => a.currency === "USD").reduce((sum, a) => sum + Number(a.balance), 0);
  const sgdTotal = accounts.filter((a) => a.currency === "SGD").reduce((sum, a) => sum + Number(a.balance), 0);
  const eurTotal = accounts.filter((a) => a.currency === "EUR").reduce((sum, a) => sum + Number(a.balance), 0);

  const nonINRTotals = [
    { currency: "USD" as Currency, total: usdTotal },
    { currency: "SGD" as Currency, total: sgdTotal },
    { currency: "EUR" as Currency, total: eurTotal },
  ].filter(({ total }) => total > 0);

  const hasNonINR = nonINRTotals.length > 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manually update balances to track available cash.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAccounts} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={accounts.length === 0} title="Export CSV">
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
          <AddAccountModal onAdded={fetchAccounts} />
        </div>
      </div>

      {/* Total Cash Card */}
      <div className="mb-6 rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total Cash Available
        </p>
        <p className="mt-2 text-3xl font-bold">{formatAmount(inrTotal, "INR")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {`Across ${accounts.length} account${accounts.length !== 1 ? "s" : ""}${hasNonINR ? " · non-INR converted at entered rates" : ""}`}
        </p>
        {hasNonINR && (
          <div className="mt-3 flex flex-wrap gap-4 border-t pt-3">
            {nonINRTotals.map(({ currency, total }) => (
              <div key={currency} className="text-sm">
                <span className="text-muted-foreground">{currency} </span>
                <span className="font-semibold tabular-nums">
                  {formatAmount(total, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accounts Table */}
      {loading ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No accounts yet. Add your first account above.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bank</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Currency</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Last Updated</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{account.bank_name}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{account.account_name}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs font-medium text-muted-foreground">
                      {account.currency ?? "INR"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatAmount(Number(account.balance), account.currency ?? "INR")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                    {formatDate(account.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                    {account.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <UpdateBalanceModal account={account} onUpdated={fetchAccounts} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(account.id, account.account_name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
