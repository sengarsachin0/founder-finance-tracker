import { z } from "zod";

export const CURRENCIES = ["INR", "USD", "SGD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  INR: "₹",
  USD: "$",
  SGD: "S$",
  EUR: "€",
};

export const bankAccountSchema = z.object({
  bank_name: z.string().min(1, "Bank name is required"),
  account_name: z.string().min(1, "Account name is required"),
  currency: z.enum(CURRENCIES).default("INR"),
  balance: z.number().min(0),
  conversion_rate: z.number().min(0).default(1),
  balance_in_inr: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export const updateBalanceSchema = z.object({
  balance: z.number().min(0),
  conversion_rate: z.number().min(0).default(1),
  balance_in_inr: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type UpdateBalanceInput = z.infer<typeof updateBalanceSchema>;

export type BankAccount = {
  id: string;
  user_id: string;
  bank_name: string;
  account_name: string;
  currency: Currency;
  balance: number;
  conversion_rate: number;
  balance_in_inr: number;
  notes: string | null;
  updated_at: string;
  created_at: string;
};
