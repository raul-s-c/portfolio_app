create or replace view public.v_position_ledger_summary
with (security_invoker = true)
as
with recursive ordered as (
  select
    t.*,
    row_number() over (
      partition by t.asset_id, t.broker_id
      order by
        t.trade_date,
        case when t.type in ('buy', 'transfer_in') then 0 else 1 end,
        t.created_at,
        t.id
    ) as movement_number
  from public.transactions t
),
position_keys as (
  select distinct asset_id, broker_id
  from ordered
),
ledger as (
  select
    k.asset_id,
    k.broker_id,
    0::bigint as movement_number,
    0::numeric as quantity,
    0::numeric as cost_basis,
    0::numeric as total_purchases,
    0::numeric as total_sale_proceeds,
    0::numeric as realized_gain
  from position_keys k

  union all

  select
    previous.asset_id,
    previous.broker_id,
    movement.movement_number,
    previous.quantity + case
      when movement.type in ('buy', 'transfer_in') then abs(movement.quantity)
      else -abs(movement.quantity)
    end,
    case
      when movement.type in ('buy', 'transfer_in') then
        previous.cost_basis + abs(movement.gross_amount) + abs(movement.fees) + abs(movement.tax)
      when previous.quantity - abs(movement.quantity) <= 0.00000001 then 0
      else greatest(
        0,
        previous.cost_basis
          - abs(movement.quantity) * case
              when previous.quantity > 0 then previous.cost_basis / previous.quantity
              else 0
            end
      )
    end,
    previous.total_purchases + case
      when movement.type = 'buy' then abs(movement.gross_amount) + abs(movement.fees) + abs(movement.tax)
      else 0
    end,
    previous.total_sale_proceeds + case
      when movement.type = 'sell' then greatest(0, abs(movement.gross_amount) - abs(movement.fees) - abs(movement.tax))
      else 0
    end,
    previous.realized_gain + case
      when movement.type = 'sell' then
        greatest(0, abs(movement.gross_amount) - abs(movement.fees) - abs(movement.tax))
          - case
              when previous.quantity - abs(movement.quantity) <= 0.00000001 then previous.cost_basis
              else abs(movement.quantity) * case
                when previous.quantity > 0 then previous.cost_basis / previous.quantity
                else 0
              end
            end
      else 0
    end
  from ledger previous
  join ordered movement
    on movement.asset_id = previous.asset_id
   and movement.broker_id = previous.broker_id
   and movement.movement_number = previous.movement_number + 1
),
latest as (
  select distinct on (asset_id, broker_id)
    asset_id,
    broker_id,
    quantity,
    cost_basis,
    total_purchases,
    total_sale_proceeds,
    realized_gain
  from ledger
  order by asset_id, broker_id, movement_number desc
)
select
  asset_id,
  broker_id,
  quantity,
  case when quantity > 0.00000001 then cost_basis else 0 end as cost_basis,
  case when quantity > 0.00000001 then cost_basis / quantity else 0 end as average_cost,
  total_purchases,
  total_sale_proceeds,
  realized_gain
from latest;

create or replace view public.v_open_positions
with (security_invoker = true)
as
with priced as (
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
  ledger.asset_id,
  ledger.broker_id,
  asset.asset_type,
  asset.name,
  broker.name as broker,
  ledger.quantity,
  ledger.average_cost as average_cost_naive,
  ledger.cost_basis as cost_basis_naive,
  price.price,
  price.previous_close,
  price.currency as price_currency,
  price.to_eur,
  price.priced_at,
  ledger.quantity * price.price * coalesce(price.to_eur, 1) as market_value,
  case
    when price.previous_close is null then null
    else ledger.quantity * (price.price - price.previous_close) * coalesce(price.to_eur, 1)
  end as daily_gain,
  ledger.total_purchases,
  ledger.total_sale_proceeds,
  ledger.realized_gain
from public.v_position_ledger_summary ledger
join public.assets asset on asset.id = ledger.asset_id
join public.brokers broker on broker.id = ledger.broker_id
left join priced price on price.asset_id = ledger.asset_id
where ledger.quantity > 0.00000001;

create or replace view public.v_portfolio_reconciliation
with (security_invoker = true)
as
select
  coalesce(sum(total_purchases), 0) as total_purchases_eur,
  coalesce(sum(total_sale_proceeds), 0) as total_sale_proceeds_eur,
  coalesce(sum(realized_gain), 0) as realized_gain_eur,
  coalesce(sum(cost_basis), 0) as open_cost_basis_eur,
  coalesce(sum(total_purchases - total_sale_proceeds + realized_gain - cost_basis), 0) as reconciliation_difference_eur,
  count(*) filter (where quantity > 0.00000001) as open_positions,
  count(*) as asset_broker_ledgers
from public.v_position_ledger_summary;

grant select on public.v_position_ledger_summary to authenticated, service_role;
grant select on public.v_open_positions to authenticated, service_role;
grant select on public.v_portfolio_reconciliation to authenticated, service_role;
