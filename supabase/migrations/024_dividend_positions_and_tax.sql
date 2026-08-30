-- Keep dividend forecasts tied to live asset/broker positions and retain fiscal detail.

alter table public.dividends
  add column if not exists withholding_origin numeric,
  add column if not exists withholding_destination numeric,
  add column if not exists withholding_destination_rate numeric;

alter table public.dividends
  drop constraint if exists dividends_withholding_origin_nonnegative,
  add constraint dividends_withholding_origin_nonnegative
    check (withholding_origin is null or withholding_origin >= 0),
  drop constraint if exists dividends_withholding_destination_nonnegative,
  add constraint dividends_withholding_destination_nonnegative
    check (withholding_destination is null or withholding_destination >= 0),
  drop constraint if exists dividends_withholding_destination_rate_range,
  add constraint dividends_withholding_destination_rate_range
    check (
      withholding_destination_rate is null
      or withholding_destination_rate between 0 and 1
    );

comment on column public.dividends.withholding_origin is
  'Tax withheld in the security source jurisdiction. Null means not classified.';
comment on column public.dividends.withholding_destination is
  'Tax withheld in the investor destination jurisdiction. Null means not classified.';
comment on column public.dividends.withholding_destination_rate is
  'Destination withholding rate expressed as a decimal. New manual entries default to 0.19.';

delete from public.dividend_calendar_events e
where not exists (
  select 1
  from public.v_open_positions op
  where op.asset_id = e.asset_id
    and op.broker_id = e.broker_id
    and op.quantity > 0.00000001
);

create or replace view public.v_open_dividend_calendar_events
with (security_invoker = true)
as
select
  e.id,
  e.asset_id,
  e.broker_id,
  e.symbol,
  e.asset_name,
  e.asset_type,
  op.broker,
  op.quantity,
  e.declaration_date,
  e.ex_date,
  e.record_date,
  e.payment_date,
  e.dividend_amount,
  e.currency,
  op.quantity * e.dividend_amount as expected_gross_amount,
  e.status,
  e.confidence,
  e.source_url,
  e.source_title,
  e.notes,
  e.raw_payload,
  e.created_at,
  e.updated_at
from public.dividend_calendar_events e
join public.v_open_positions op
  on op.asset_id = e.asset_id
 and op.broker_id = e.broker_id
where op.quantity > 0.00000001;

grant select on public.v_open_dividend_calendar_events to authenticated, service_role;
