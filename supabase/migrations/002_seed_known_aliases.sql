-- Known ticker changes from the migrated personal portfolio.
-- These rows create one stable asset per real instrument and attach old and new symbols.

insert into public.assets (id, asset_type, name, isin, currency, notes)
values
  ('b34edd76-73ce-5c31-856c-a525c9a264b5', 'etf', 'iShares Euro High Yield Corporate Bond UCITS ETF', 'IE00B66F4759', 'EUR', 'Migrated alias: IHYG is now EUNW'),
  ('05b81b6e-0005-514c-8ace-63dff08d02d3', 'etf', 'iShares MSCI Japan UCITS ETF', 'IE00B02KXH56', 'EUR', 'Migrated alias: IQQJ is now IJPN')
on conflict (id) do update set
  name = excluded.name,
  isin = excluded.isin,
  currency = excluded.currency,
  notes = excluded.notes;

with eunw as (
  select 'b34edd76-73ce-5c31-856c-a525c9a264b5'::uuid as id
),
ijpn as (
  select '05b81b6e-0005-514c-8ace-63dff08d02d3'::uuid as id
)
insert into public.asset_identifiers (asset_id, provider, symbol, exchange, valid_to, is_primary)
select id, 'manual', 'IHYG', '', date '2026-08-28', false from eunw
union all
select id, 'yahoo', 'IHYG.DE', 'XETRA', date '2026-08-28', false from eunw
union all
select id, 'manual', 'EUNW', '', null, true from eunw
union all
select id, 'yahoo', 'EUNW.DE', 'XETRA', null, true from eunw
union all
select id, 'manual', 'IQQJ', '', date '2026-08-28', false from ijpn
union all
select id, 'yahoo', 'IQQJ.DE', 'XETRA', date '2026-08-28', false from ijpn
union all
select id, 'manual', 'IJPN', '', null, true from ijpn
union all
select id, 'yahoo', 'IJPN.DE', 'XETRA', null, true from ijpn
on conflict (provider, symbol, exchange) do nothing;
