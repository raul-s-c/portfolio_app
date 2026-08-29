create table if not exists public.dividend_calendar_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  broker_id uuid not null references public.brokers(id) on delete cascade,
  symbol text,
  asset_name text,
  asset_type text not null check (asset_type in ('stock', 'etf')),
  broker text,
  quantity numeric not null,
  declaration_date date,
  ex_date date,
  record_date date,
  payment_date date,
  dividend_amount numeric not null,
  currency text not null,
  expected_gross_amount numeric not null,
  status text not null default 'unconfirmed',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  source_url text,
  source_title text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, broker_id, ex_date, payment_date, dividend_amount, currency)
);

create index if not exists idx_dividend_calendar_payment_date
on public.dividend_calendar_events(payment_date desc nulls last, ex_date desc nulls last);

create index if not exists idx_dividend_calendar_asset
on public.dividend_calendar_events(asset_id, broker_id);

drop trigger if exists trg_dividend_calendar_touch_updated_at on public.dividend_calendar_events;
create trigger trg_dividend_calendar_touch_updated_at
before update on public.dividend_calendar_events
for each row execute function public.touch_updated_at();

alter table public.dividend_calendar_events enable row level security;

grant select on public.dividend_calendar_events to authenticated;
grant select, insert, update, delete on public.dividend_calendar_events to service_role;

drop policy if exists "authenticated read dividend calendar" on public.dividend_calendar_events;
create policy "authenticated read dividend calendar"
on public.dividend_calendar_events for select to authenticated using (true);

drop policy if exists "service writes dividend calendar" on public.dividend_calendar_events;
create policy "service writes dividend calendar"
on public.dividend_calendar_events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
