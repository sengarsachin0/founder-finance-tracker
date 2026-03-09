create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  category        text not null default 'Other',
  amount          numeric(15, 2) not null default 0,
  currency        text not null default 'INR'
                    check (currency in ('INR', 'USD', 'SGD', 'EUR')),
  conversion_rate numeric(10, 4) not null default 1,
  amount_in_inr   numeric(15, 2) not null default 0,
  due_date        date,
  paid_date       date,
  is_paid         boolean not null default false,
  is_recurring    boolean not null default false,
  recurrence      text check (recurrence in ('monthly', 'quarterly', 'annual')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "Users manage own expenses"
  on public.expenses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
