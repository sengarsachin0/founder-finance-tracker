import { z } from "zod";
import { CURRENCIES } from "./bank-account";

export const EXPENSE_CATEGORIES = [
  "Salaries",
  "SaaS / Subscriptions",
  "Infrastructure",
  "Marketing",
  "Office",
  "Professional Services",
  "Travel",
  "Taxes",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const RECURRENCES = ["monthly", "quarterly", "annual"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export const expenseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1).default("Other"),
  amount: z.number(),
  currency: z.enum(CURRENCIES).default("INR"),
  conversion_rate: z.number().min(0).default(1),
  due_date: z.string().optional().nullable(),
  is_paid: z.boolean().default(false),
  paid_date: z.string().optional().nullable(),
  is_recurring: z.boolean().default(false),
  recurrence: z.enum(RECURRENCES).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateExpenseSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  amount: z.number().optional(),
  currency: z.enum(CURRENCIES).optional(),
  conversion_rate: z.number().min(0).optional(),
  due_date: z.string().optional().nullable(),
  is_paid: z.boolean().optional(),
  paid_date: z.string().optional().nullable(),
  is_recurring: z.boolean().optional(),
  recurrence: z.enum(RECURRENCES).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export type Expense = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  conversion_rate: number;
  amount_in_inr: number;
  due_date: string | null;
  paid_date: string | null;
  is_paid: boolean;
  is_recurring: boolean;
  recurrence: Recurrence | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
