-- Bank Accounts table
create table if not exists public.bank_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  bank_name   text not null,
  account_name text not null,
  balance     numeric(15, 2) not null default 0,
  notes       text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Index for fast user lookups
create index if not exists bank_accounts_user_id_idx on public.bank_accounts(user_id);

-- Row Level Security
alter table public.bank_accounts enable row level security;

create policy "Users can read own bank accounts"
  on public.bank_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own bank accounts"
  on public.bank_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own bank accounts"
  on public.bank_accounts for update
  using (auth.uid() = user_id);

create policy "Users can delete own bank accounts"
  on public.bank_accounts for delete
  using (auth.uid() = user_id);
