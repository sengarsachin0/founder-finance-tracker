-- ── Add vertical_id + source to revenue_entries ───────────────────────────────
-- vertical_id is nullable so existing entries are unaffected.
-- source distinguishes manually added entries from future integrations.
alter table revenue_entries
  add column if not exists vertical_id uuid references revenue_verticals(id) on delete set null,
  add column if not exists source text not null default 'manual';

create index if not exists revenue_entries_vertical_id_idx on revenue_entries(vertical_id);

-- ── Revenue Monthly Logs ───────────────────────────────────────────────────────
-- Snapshot of computed daily-revenue metrics per vertical per month.
-- Upserted automatically whenever a daily revenue entry is created/updated/deleted.
create table revenue_monthly_logs (
  id                    uuid primary key default gen_random_uuid(),
  vertical_id           uuid references revenue_verticals(id) on delete cascade not null,
  month                 smallint not null check (month between 1 and 12),
  year                  smallint not null,
  mtd_revenue           numeric(14, 2) not null default 0,
  target_amount         numeric(14, 2),
  target_till_date      numeric(14, 2),
  surplus_or_deficit    numeric(14, 2),
  gap_to_target         numeric(14, 2),
  pct_target_achieved   numeric(8, 2),
  daily_avg_achieved    numeric(14, 2),
  required_daily_avg    numeric(14, 2),
  pipeline_next_7_days  numeric(14, 2) not null default 0,
  updated_at            timestamptz default now() not null,
  unique (vertical_id, month, year)
);

alter table revenue_monthly_logs enable row level security;

create policy "Authenticated users — monthly logs"
  on revenue_monthly_logs for all to authenticated
  using (true) with check (true);
