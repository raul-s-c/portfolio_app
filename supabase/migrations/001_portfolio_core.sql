create extension if not exists pgcrypto;

create table if not exists public.brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('stock', 'etf', 'fund', 'cash')),
  name text not null,
  isin text,
  currency text not null default 'EUR',
  country text,
  sector text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_identifiers (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  provider text not null,
  symbol text not null,
  exchange text,
  valid_from date,
  valid_to date,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, symbol, exchange)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  broker_id uuid not null references public.brokers(id),
  trade_date date not null,
  type text not null check (type in ('buy', 'sell', 'transfer_in', 'transfer_out')),
  quantity numeric not null,
  gross_amount numeric not null,
  fees numeric not null default 0,
  tax numeric not null default 0,
  currency text not null,
  source_file text,
  source_row_hash text unique,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dividends (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  broker_id uuid not null references public.brokers(id),
  pay_date date not null,
  gross_amount numeric not null,
  tax numeric not null default 0,
  net_amount numeric not null,
  currency text not null,
  source_file text,
  source_row_hash text unique,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  priced_at timestamptz not null,
  price numeric not null,
  previous_close numeric,
  currency text not null,
  provider text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (asset_id, priced_at, provider)
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  asset_id uuid not null references public.assets(id),
  broker_id uuid not null references public.brokers(id),
  quantity numeric not null,
  average_cost numeric not null,
  cost_basis numeric not null,
  market_value numeric,
  latent_gain numeric,
  daily_gain numeric,
  currency text not null,
  created_at timestamptz not null default now(),
  unique (snapshot_date, asset_id, broker_id)
);

create index if not exists idx_asset_identifiers_asset on public.asset_identifiers(asset_id);
create index if not exists idx_asset_identifiers_lookup on public.asset_identifiers(provider, symbol);
create index if not exists idx_transactions_asset_broker_date on public.transactions(asset_id, broker_id, trade_date);
create index if not exists idx_dividends_asset_broker_date on public.dividends(asset_id, broker_id, pay_date);
create index if not exists idx_price_snapshots_asset_date on public.price_snapshots(asset_id, priced_at desc);
create index if not exists idx_portfolio_snapshots_date on public.portfolio_snapshots(snapshot_date desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_assets_touch_updated_at on public.assets;
create trigger trg_assets_touch_updated_at
before update on public.assets
for each row execute function public.touch_updated_at();

create or replace view public.v_latest_prices as
select distinct on (ps.asset_id)
  ps.asset_id,
  ps.priced_at,
  ps.price,
  ps.previous_close,
  ps.currency,
  ps.provider
from public.price_snapshots ps
order by ps.asset_id, ps.priced_at desc;

create or replace view public.v_open_positions as
with movements as (
  select
    t.asset_id,
    t.broker_id,
    sum(
      case
        when t.type in ('buy', 'transfer_in') then t.quantity
        when t.type in ('sell', 'transfer_out') then -abs(t.quantity)
        else 0
      end
    ) as quantity,
    sum(
      case
        when t.type in ('buy', 'transfer_in') then abs(t.gross_amount) + abs(t.fees)
        when t.type in ('sell', 'transfer_out') then 0
        else 0
      end
    ) as bought_amount
  from public.transactions t
  group by t.asset_id, t.broker_id
)
select
  m.asset_id,
  m.broker_id,
  a.asset_type,
  a.name,
  b.name as broker,
  m.quantity,
  case when m.quantity <> 0 then m.bought_amount / nullif(m.quantity, 0) else 0 end as average_cost_naive,
  m.bought_amount as cost_basis_naive,
  lp.price,
  lp.previous_close,
  lp.currency as price_currency,
  lp.priced_at,
  m.quantity * lp.price as market_value,
  m.quantity * (lp.price - lp.previous_close) as daily_gain
from movements m
join public.assets a on a.id = m.asset_id
join public.brokers b on b.id = m.broker_id
left join public.v_latest_prices lp on lp.asset_id = m.asset_id
where m.quantity > 0.00000001;

alter table public.brokers enable row level security;
alter table public.assets enable row level security;
alter table public.asset_identifiers enable row level security;
alter table public.transactions enable row level security;
alter table public.dividends enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.portfolio_snapshots enable row level security;

create policy "authenticated read brokers" on public.brokers for select to authenticated using (true);
create policy "authenticated read assets" on public.assets for select to authenticated using (true);
create policy "authenticated read identifiers" on public.asset_identifiers for select to authenticated using (true);
create policy "authenticated read transactions" on public.transactions for select to authenticated using (true);
create policy "authenticated read dividends" on public.dividends for select to authenticated using (true);
create policy "authenticated read prices" on public.price_snapshots for select to authenticated using (true);
create policy "authenticated read portfolio snapshots" on public.portfolio_snapshots for select to authenticated using (true);

create policy "service writes brokers" on public.brokers for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service writes assets" on public.assets for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service writes identifiers" on public.asset_identifiers for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service writes transactions" on public.transactions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service writes dividends" on public.dividends for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service writes prices" on public.price_snapshots for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service writes portfolio snapshots" on public.portfolio_snapshots for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into public.brokers (name)
values ('MyInvestor'), ('IBKR'), ('Trade Republic')
on conflict (name) do nothing;
