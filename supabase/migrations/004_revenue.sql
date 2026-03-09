create table public.revenue_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_name     text not null,
  description     text not null,
  amount          numeric(15, 2) not null default 0,
  currency        text not null default 'INR'
                    check (currency in ('INR', 'USD', 'SGD', 'EUR')),
  conversion_rate numeric(10, 4) not null default 1,
  amount_in_inr   numeric(15, 2) not null default 0,
  stage           text not null default 'expected'
                    check (stage in ('expected', 'invoice_sent', 'received')),
  expected_date   date,
  received_date   date,
  notes           text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS
alter table public.revenue_entries enable row level security;

create policy "Users manage own revenue entries"
  on public.revenue_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
