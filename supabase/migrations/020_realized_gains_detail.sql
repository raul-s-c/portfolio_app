create or replace view public.v_realized_gains_detail
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
    null::uuid as transaction_id,
    null::date as trade_date,
    null::text as movement_type,
    0::numeric as quantity,
    0::numeric as cost_basis,
    0::numeric as quantity_before,
    0::numeric as average_cost_before,
    0::numeric as sale_proceeds,
    0::numeric as released_cost_basis,
    0::numeric as realized_gain
  from position_keys k

  union all

  select
    previous.asset_id,
    previous.broker_id,
    movement.movement_number,
    movement.id,
    movement.trade_date,
    movement.type,
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
        previous.cost_basis - abs(movement.quantity) * case
          when previous.quantity > 0 then previous.cost_basis / previous.quantity
          else 0
        end
      )
    end,
    previous.quantity,
    case when previous.quantity > 0 then previous.cost_basis / previous.quantity else 0 end,
    case
      when movement.type = 'sell' then greatest(0, abs(movement.gross_amount) - abs(movement.fees) - abs(movement.tax))
      else 0
    end,
    case
      when movement.type <> 'sell' then 0
      when previous.quantity - abs(movement.quantity) <= 0.00000001 then previous.cost_basis
      else abs(movement.quantity) * case
        when previous.quantity > 0 then previous.cost_basis / previous.quantity
        else 0
      end
    end,
    case
      when movement.type <> 'sell' then 0
      else greatest(0, abs(movement.gross_amount) - abs(movement.fees) - abs(movement.tax)) - case
        when previous.quantity - abs(movement.quantity) <= 0.00000001 then previous.cost_basis
        else abs(movement.quantity) * case
          when previous.quantity > 0 then previous.cost_basis / previous.quantity
          else 0
        end
      end
    end
  from ledger previous
  join ordered movement
    on movement.asset_id = previous.asset_id
   and movement.broker_id = previous.broker_id
   and movement.movement_number = previous.movement_number + 1
)
select
  ledger.transaction_id,
  ledger.trade_date,
  ledger.asset_id,
  asset.name as asset_name,
  asset.asset_type,
  ledger.broker_id,
  broker.name as broker,
  abs(transaction.quantity) as sold_quantity,
  ledger.quantity_before,
  ledger.average_cost_before,
  ledger.sale_proceeds,
  ledger.released_cost_basis,
  ledger.realized_gain,
  case
    when ledger.released_cost_basis <> 0 then ledger.realized_gain / ledger.released_cost_basis
    else null
  end as realized_return,
  transaction.fees,
  transaction.tax,
  'EUR'::text as calculation_currency
from ledger
join public.transactions transaction on transaction.id = ledger.transaction_id
join public.assets asset on asset.id = ledger.asset_id
join public.brokers broker on broker.id = ledger.broker_id
where ledger.movement_type = 'sell';

grant select on public.v_realized_gains_detail to authenticated, service_role;

