import { z } from "zod";
import { CURRENCIES } from "./bank-account";

export const STAGES = ["expected", "invoice_sent", "received"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  expected: "Expected",
  invoice_sent: "Invoice Sent",
  received: "Received",
};

export const revenueEntrySchema = z.object({
  client_name: z.string().min(1, "Client name is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0),
  currency: z.enum(CURRENCIES).default("INR"),
  conversion_rate: z.number().min(0).default(1),
  stage: z.enum(STAGES).default("expected"),
  expected_date: z.string().optional(),
  notes: z.string().optional(),
  vertical_id: z.string().uuid().optional().nullable(),
  source: z.string().optional().default("manual"),
});

export const updateRevenueEntrySchema = z.object({
  client_name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  currency: z.enum(CURRENCIES).optional(),
  conversion_rate: z.number().min(0).optional(),
  stage: z.enum(STAGES).optional(),
  expected_date: z.string().optional().nullable(),
  received_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  archived: z.boolean().optional(),
  vertical_id: z.string().uuid().optional().nullable(),
});

export type RevenueEntryInput = z.infer<typeof revenueEntrySchema>;
export type UpdateRevenueEntryInput = z.infer<typeof updateRevenueEntrySchema>;

export type RevenueEntry = {
  id: string;
  user_id: string;
  client_name: string;
  description: string;
  amount: number;
  currency: string;
  conversion_rate: number;
  amount_in_inr: number;
  stage: Stage;
  expected_date: string | null;
  received_date: string | null;
  notes: string | null;
  archived: boolean;
  vertical_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};
