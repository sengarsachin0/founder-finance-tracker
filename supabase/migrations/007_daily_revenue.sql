-- ── Revenue Verticals ─────────────────────────────────────────────────────────
-- Represents business lines (e.g., Academy, B2B). Team-shared, not per-user.
create table revenue_verticals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  description text,
  color       text not null default '#6366f1',
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) not null,
  created_at  timestamptz default now() not null
);

-- ── Monthly Revenue Targets ────────────────────────────────────────────────────
-- One target per vertical per calendar month.
create table monthly_revenue_targets (
  id             uuid primary key default gen_random_uuid(),
  vertical_id    uuid references revenue_verticals(id) on delete cascade not null,
  month          smallint not null check (month between 1 and 12),
  year           smallint not null,
  target_amount  numeric(14, 2) not null check (target_amount > 0),
  set_by         uuid references auth.users(id) not null,
  created_at     timestamptz default now() not null,
  unique (vertical_id, month, year)
);

-- ── Daily Revenue Entries ──────────────────────────────────────────────────────
-- Team members log actual revenue collected each day (INR only).
create table daily_revenue_entries (
  id          uuid primary key default gen_random_uuid(),
  vertical_id uuid references revenue_verticals(id) on delete cascade not null,
  date        date not null,
  amount      numeric(14, 2) not null check (amount >= 0),
  notes       text,
  entered_by  uuid references auth.users(id) not null,
  created_at  timestamptz default now() not null
);

-- ── Revenue Report Templates ───────────────────────────────────────────────────
-- Flexible per-vertical WhatsApp / text report templates.
-- Use {{variable_name}} placeholders (see docs for supported vars).
create table revenue_report_templates (
  id          uuid primary key default gen_random_uuid(),
  vertical_id uuid references revenue_verticals(id) on delete cascade not null,
  name        text not null,
  template    text not null,
  is_default  boolean not null default false,
  created_by  uuid references auth.users(id) not null,
  created_at  timestamptz default now() not null
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- All four tables are team-shared: any authenticated user can read & write.
-- Individual audit fields (entered_by, created_by) are stored for traceability.
alter table revenue_verticals         enable row level security;
alter table monthly_revenue_targets   enable row level security;
alter table daily_revenue_entries     enable row level security;
alter table revenue_report_templates  enable row level security;

create policy "Authenticated users — verticals"
  on revenue_verticals for all to authenticated
  using (true) with check (true);

create policy "Authenticated users — targets"
  on monthly_revenue_targets for all to authenticated
  using (true) with check (true);

create policy "Authenticated users — daily entries"
  on daily_revenue_entries for all to authenticated
  using (true) with check (true);

create policy "Authenticated users — report templates"
  on revenue_report_templates for all to authenticated
  using (true) with check (true);

-- ── Default Vertical: Academy ──────────────────────────────────────────────────
-- Seeded after running; replace <founder_user_id> with actual UUID if needed,
-- or run via app on first login (the page will prompt to create first vertical).
