-- Add currency column to bank_accounts
alter table public.bank_accounts
  add column if not exists currency text not null default 'INR'
    check (currency in ('INR', 'USD', 'SGD', 'EUR'));
