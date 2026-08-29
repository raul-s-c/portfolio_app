create table if not exists public.portfolio_strategies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  objective text,
  target_return_min numeric,
  target_return_max numeric,
  target_income_spread_over_inflation numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.virtual_portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  strategy_id uuid references public.portfolio_strategies(id) on delete set null,
  base_currency text not null default 'EUR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.virtual_portfolio_assignments (
  id uuid primary key default gen_random_uuid(),
  virtual_portfolio_id uuid not null references public.virtual_portfolios(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  broker_id uuid not null references public.brokers(id) on delete cascade,
  target_weight numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, broker_id)
);

create table if not exists public.asset_price_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  priced_on date not null,
  close_price numeric not null,
  currency text not null,
  provider text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (asset_id, priced_on, provider)
);

create table if not exists public.portfolio_cash_flows (
  id uuid primary key default gen_random_uuid(),
  flow_date date not null,
  virtual_portfolio_id uuid references public.virtual_portfolios(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  broker_id uuid references public.brokers(id) on delete set null,
  flow_type text not null check (flow_type in ('contribution','withdrawal','buy','sell','dividend','fee','tax','transfer_in','transfer_out')),
  amount numeric not null,
  currency text not null default 'EUR',
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_virtual_portfolio_assignments_portfolio
on public.virtual_portfolio_assignments(virtual_portfolio_id);

create index if not exists idx_asset_price_history_asset_date
on public.asset_price_history(asset_id, priced_on desc);

create index if not exists idx_portfolio_cash_flows_date
on public.portfolio_cash_flows(flow_date desc, virtual_portfolio_id);

drop trigger if exists trg_portfolio_strategies_touch_updated_at on public.portfolio_strategies;
create trigger trg_portfolio_strategies_touch_updated_at
before update on public.portfolio_strategies
for each row execute function public.touch_updated_at();

drop trigger if exists trg_virtual_portfolios_touch_updated_at on public.virtual_portfolios;
create trigger trg_virtual_portfolios_touch_updated_at
before update on public.virtual_portfolios
for each row execute function public.touch_updated_at();

drop trigger if exists trg_virtual_portfolio_assignments_touch_updated_at on public.virtual_portfolio_assignments;
create trigger trg_virtual_portfolio_assignments_touch_updated_at
before update on public.virtual_portfolio_assignments
for each row execute function public.touch_updated_at();

alter table public.portfolio_strategies enable row level security;
alter table public.virtual_portfolios enable row level security;
alter table public.virtual_portfolio_assignments enable row level security;
alter table public.asset_price_history enable row level security;
alter table public.portfolio_cash_flows enable row level security;

grant select, insert, update, delete on public.portfolio_strategies to authenticated;
grant select, insert, update, delete on public.virtual_portfolios to authenticated;
grant select, insert, update, delete on public.virtual_portfolio_assignments to authenticated;
grant select on public.asset_price_history to authenticated;
grant select on public.portfolio_cash_flows to authenticated;
grant all on public.asset_price_history to service_role;
grant all on public.portfolio_cash_flows to service_role;

drop policy if exists "authenticated manage strategies" on public.portfolio_strategies;
create policy "authenticated manage strategies"
on public.portfolio_strategies for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage virtual portfolios" on public.virtual_portfolios;
create policy "authenticated manage virtual portfolios"
on public.virtual_portfolios for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage virtual assignments" on public.virtual_portfolio_assignments;
create policy "authenticated manage virtual assignments"
on public.virtual_portfolio_assignments for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read asset price history" on public.asset_price_history;
create policy "authenticated read asset price history"
on public.asset_price_history for select to authenticated using (true);

drop policy if exists "service writes asset price history" on public.asset_price_history;
create policy "service writes asset price history"
on public.asset_price_history for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "authenticated read portfolio cash flows" on public.portfolio_cash_flows;
create policy "authenticated read portfolio cash flows"
on public.portfolio_cash_flows for select to authenticated using (true);

drop policy if exists "service writes portfolio cash flows" on public.portfolio_cash_flows;
create policy "service writes portfolio cash flows"
on public.portfolio_cash_flows for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into public.portfolio_strategies (
  name,
  objective,
  target_return_min,
  target_return_max,
  target_income_spread_over_inflation
)
values (
  'Cartera ETF resistente',
  'Cartera de ETFs MyInvestor resistente a varios entornos macro, con foco en dividendo real e incremento de capital a largo plazo.',
  0.04,
  0.06,
  0.02
)
on conflict (name) do nothing;

insert into public.virtual_portfolios (name, strategy_id, base_currency, notes)
select
  'ETF MyInvestor resistente',
  ps.id,
  'EUR',
  'Cartera virtual para analizar los ETFs de MyInvestor asociados a la estrategia resistente.'
from public.portfolio_strategies ps
where ps.name = 'Cartera ETF resistente'
on conflict (name) do nothing;

create or replace view public.v_virtual_portfolio_positions as
select
  vp.id as virtual_portfolio_id,
  vp.name as virtual_portfolio,
  ps.name as strategy,
  ps.objective as strategy_objective,
  vpa.asset_id,
  vpa.broker_id,
  op.name as asset_name,
  op.asset_type,
  op.broker,
  op.quantity,
  op.market_value,
  op.cost_basis_naive,
  op.market_value - coalesce(op.cost_basis_naive, 0) as latent_gain,
  case
    when coalesce(op.cost_basis_naive, 0) <> 0
      then (op.market_value - op.cost_basis_naive) / op.cost_basis_naive
    else null
  end as simple_return,
  vpa.target_weight,
  sum(op.market_value) over (partition by vp.id) as virtual_portfolio_market_value,
  case
    when sum(op.market_value) over (partition by vp.id) <> 0
      then op.market_value / sum(op.market_value) over (partition by vp.id)
    else null
  end as current_weight,
  case
    when vpa.target_weight is not null
      and sum(op.market_value) over (partition by vp.id) <> 0
      then op.market_value / sum(op.market_value) over (partition by vp.id) - vpa.target_weight
    else null
  end as weight_drift,
  vpa.notes
from public.virtual_portfolio_assignments vpa
join public.virtual_portfolios vp on vp.id = vpa.virtual_portfolio_id
left join public.portfolio_strategies ps on ps.id = vp.strategy_id
join public.v_open_positions op
  on op.asset_id = vpa.asset_id
 and op.broker_id = vpa.broker_id;

create or replace view public.v_latest_asset_price_history as
select distinct on (aph.asset_id)
  aph.asset_id,
  a.name,
  a.asset_type,
  a.isin,
  aph.priced_on,
  aph.close_price,
  aph.currency,
  aph.provider
from public.asset_price_history aph
join public.assets a on a.id = aph.asset_id
order by aph.asset_id, aph.priced_on desc;

grant select on public.v_virtual_portfolio_positions to authenticated, service_role;
grant select on public.v_latest_asset_price_history to authenticated, service_role;
