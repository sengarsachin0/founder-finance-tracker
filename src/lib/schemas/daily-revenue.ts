import { z } from "zod";

// ── Revenue Vertical ──────────────────────────────────────────────────────────

export const verticalSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  slug: z.string().min(1).max(30).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  description: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  is_active: z.boolean().default(true),
});

export const updateVerticalSchema = verticalSchema.partial();

export type VerticalInput = z.infer<typeof verticalSchema>;

export type RevenueVertical = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

// ── Monthly Revenue Target ────────────────────────────────────────────────────

export const targetSchema = z.object({
  vertical_id: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
  target_amount: z.number().positive("Target must be greater than 0"),
});

export type TargetInput = z.infer<typeof targetSchema>;

export type MonthlyRevenueTarget = {
  id: string;
  vertical_id: string;
  month: number;
  year: number;
  target_amount: number;
  set_by: string;
  created_at: string;
};

// ── Daily Revenue Entry ───────────────────────────────────────────────────────

export const dailyEntrySchema = z.object({
  vertical_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.number().min(0, "Amount must be non-negative"),
  notes: z.string().max(500).optional(),
});

export const updateDailyEntrySchema = z.object({
  amount: z.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export type DailyEntryInput = z.infer<typeof dailyEntrySchema>;

export type DailyRevenueEntry = {
  id: string;
  vertical_id: string;
  date: string;
  amount: number;
  notes: string | null;
  entered_by: string;
  created_at: string;
};

// ── Report Template ───────────────────────────────────────────────────────────

export const reportTemplateSchema = z.object({
  vertical_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  template: z.string().min(1),
  is_default: z.boolean().default(false),
});

export const updateReportTemplateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  template: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
});

export type ReportTemplateInput = z.infer<typeof reportTemplateSchema>;

export type RevenueReportTemplate = {
  id: string;
  vertical_id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
};

// ── Computed Metrics ──────────────────────────────────────────────────────────

export type DailyRevenueMetrics = {
  today: number;           // sum of entries for today
  mtd: number;             // month-to-date total
  target: number | null;   // monthly target (null if not set)
  targetTillDate: number | null;   // pro-rated target for days elapsed
  surplusDeficit: number | null;   // mtd - targetTillDate
  pctAchieved: number | null;      // mtd / target * 100
  gapToTarget: number | null;      // target - mtd (negative = exceeded)
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  dailyAvgAchieved: number | null; // mtd / daysElapsed
  requiredDailyAvg: number | null; // gapToTarget / daysRemaining
  pipeline7d: number;              // from revenue module
};

// ── Default WhatsApp report template ─────────────────────────────────────────

export const DEFAULT_WHATSAPP_TEMPLATE = `📊 *{{vertical_name}} Revenue Report*
📅 {{date}} | {{month_name}} {{year}}

💰 *Today's Revenue:* ₹{{today}}
📈 *Month-to-Date:* ₹{{mtd}} / ₹{{target}}
📊 *Progress:* {{pct_achieved}}% achieved

🎯 *Target till today:* ₹{{target_till_date}}
{{surplus_deficit_label}}: ₹{{surplus_deficit_abs}}

📉 *Gap to month target:* ₹{{gap_to_target}}
📆 *Days remaining:* {{days_remaining}} of {{days_in_month}}

📊 *Daily avg (actual):* ₹{{daily_avg_achieved}}
⚡ *Required daily avg:* ₹{{required_daily_avg}}

🔭 *Pipeline (next 7 days):* ₹{{pipeline_7d}}`;

export const TEMPLATE_VARIABLES = [
  { key: "{{vertical_name}}", desc: "Vertical name (e.g., Academy)" },
  { key: "{{date}}", desc: "Today's date (e.g., 9 Mar 2026)" },
  { key: "{{month_name}}", desc: "Month name (e.g., March)" },
  { key: "{{year}}", desc: "Year (e.g., 2026)" },
  { key: "{{today}}", desc: "Today's revenue (formatted)" },
  { key: "{{mtd}}", desc: "Month-to-date total (formatted)" },
  { key: "{{target}}", desc: "Monthly target (formatted)" },
  { key: "{{pct_achieved}}", desc: "% of target achieved" },
  { key: "{{target_till_date}}", desc: "Pro-rated target for days elapsed" },
  { key: "{{surplus_deficit_label}}", desc: "✅ Surplus or ⚠️ Deficit" },
  { key: "{{surplus_deficit_abs}}", desc: "Surplus/deficit amount (absolute)" },
  { key: "{{gap_to_target}}", desc: "Remaining gap to hit month target" },
  { key: "{{days_elapsed}}", desc: "Days elapsed in month" },
  { key: "{{days_remaining}}", desc: "Days remaining in month" },
  { key: "{{days_in_month}}", desc: "Total days in month" },
  { key: "{{daily_avg_achieved}}", desc: "MTD ÷ days elapsed" },
  { key: "{{required_daily_avg}}", desc: "Gap ÷ days remaining" },
  { key: "{{pipeline_7d}}", desc: "Revenue pipeline for next 7 days" },
];
