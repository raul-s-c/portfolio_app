create or replace view public.v_latest_prices as
select distinct on (ps.asset_id)
  ps.asset_id,
  ps.priced_at,
  ps.price,
  ps.previous_close,
  ps.currency,
  ps.provider,
  ps.raw_payload
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
),
priced as (
  select
    lp.*,
    coalesce(
      nullif(lp.raw_payload->>'to_eur', '')::numeric,
      nullif(lp.raw_payload->>'toEUR', '')::numeric,
      case when lp.currency = 'EUR' then 1::numeric else null end
    ) as to_eur
  from public.v_latest_prices lp
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
  p.price,
  p.previous_close,
  p.currency as price_currency,
  p.to_eur,
  p.priced_at,
  m.quantity * p.price * coalesce(p.to_eur, 1) as market_value,
  case
    when p.previous_close is null then null
    else m.quantity * (p.price - p.previous_close) * coalesce(p.to_eur, 1)
  end as daily_gain
from movements m
join public.assets a on a.id = m.asset_id
join public.brokers b on b.id = m.broker_id
left join priced p on p.asset_id = m.asset_id
where m.quantity > 0.00000001;

grant select on public.v_latest_prices to authenticated, service_role;
grant select on public.v_open_positions to authenticated, service_role;
