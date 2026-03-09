-- Add conversion rate and INR equivalent columns to bank_accounts
alter table public.bank_accounts
  add column if not exists conversion_rate numeric(10, 4) not null default 1,
  add column if not exists balance_in_inr  numeric(15, 2) not null default 0;

-- Backfill existing INR rows (conversion_rate=1, balance_in_inr=balance)
update public.bank_accounts
  set conversion_rate = 1,
      balance_in_inr  = balance
  where currency = 'INR' or currency is null;
