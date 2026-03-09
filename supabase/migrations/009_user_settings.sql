-- User settings: notification email + alert thresholds
create table user_settings (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  notification_email       text,
  runway_warning_months    int not null default 6,
  large_payment_threshold  numeric(14, 2) not null default 100000,
  updated_at               timestamptz default now() not null
);

alter table user_settings enable row level security;

create policy "Users manage own settings"
  on user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
