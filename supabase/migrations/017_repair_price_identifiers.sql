-- Repair Yahoo symbols for open positions whose exchange suffix was missing or stale.
-- The asset id remains stable; only the market-data identifier changes.

update public.asset_identifiers
set is_primary = false
where provider = 'yahoo'
  and asset_id in (
    'c7dc5ba7-8aa3-5b77-8817-0f74c6f08287',
    'cbd11937-5ecd-554a-a135-647c0ba00df6',
    '56212374-94fb-5d20-af84-cad4116b1c3d',
    'b34edd76-73ce-5c31-856c-a525c9a264b5',
    '0f318f20-65d0-5691-90b3-9051fcd417d0',
    '36dc4a94-b732-5b38-a799-2264223801a4',
    'aa077c3f-76bb-5476-8e72-890f3d587e34',
    '09096588-5c94-5243-826e-b696c379a1a2',
    '6b7c0565-5242-5c9f-9f3a-ab40b1cdd8e8',
    '5a119206-6149-58e5-abff-cb0ef7fe9101',
    '9a345642-49c0-5bcd-9cde-a2997b6caceb',
    '739a4984-bac4-5ba1-a12b-0a8aee13d6e7',
    '311482d5-f90a-5170-aa9c-e328a12975ba'
  );

insert into public.asset_identifiers
  (asset_id, provider, symbol, exchange, valid_from, valid_to, is_primary)
values
  ('c7dc5ba7-8aa3-5b77-8817-0f74c6f08287', 'yahoo', 'CNYB.L', 'LSE', current_date, null, true),
  ('cbd11937-5ecd-554a-a135-647c0ba00df6', 'yahoo', 'INFR.MI', 'MIL', current_date, null, true),
  ('56212374-94fb-5d20-af84-cad4116b1c3d', 'yahoo', 'ERNE.L', 'LSE', current_date, null, true),
  ('b34edd76-73ce-5c31-856c-a525c9a264b5', 'yahoo', 'IHYG.L', 'LSE', current_date, null, true),
  ('0f318f20-65d0-5691-90b3-9051fcd417d0', 'yahoo', 'FXC.MI', 'MIL', current_date, null, true),
  ('36dc4a94-b732-5b38-a799-2264223801a4', 'yahoo', 'WQDV.L', 'LSE', current_date, null, true),
  ('aa077c3f-76bb-5476-8e72-890f3d587e34', 'yahoo', 'XCHA.L', 'LSE', current_date, null, true),
  ('09096588-5c94-5243-826e-b696c379a1a2', 'yahoo', 'CTT.AX', 'ASX', current_date, null, true),
  ('6b7c0565-5242-5c9f-9f3a-ab40b1cdd8e8', 'yahoo', 'GBSE.MI', 'MIL', current_date, null, true),
  ('5a119206-6149-58e5-abff-cb0ef7fe9101', 'yahoo', 'IS3Q.DE', 'XETRA', current_date, null, true),
  ('9a345642-49c0-5bcd-9cde-a2997b6caceb', 'yahoo', 'IS3R.DE', 'XETRA', current_date, null, true),
  ('739a4984-bac4-5ba1-a12b-0a8aee13d6e7', 'yahoo', 'MAGR.DE', 'XETRA', current_date, null, true),
  ('311482d5-f90a-5170-aa9c-e328a12975ba', 'yahoo', 'SPP1.DE', 'XETRA', current_date, null, true)
on conflict (provider, symbol, exchange) do update set
  asset_id = excluded.asset_id,
  valid_from = excluded.valid_from,
  valid_to = null,
  is_primary = true;

-- These imported symbols are ETFs/ETCs rather than ordinary shares.
update public.assets
set asset_type = 'etf'
where id in (
  '6b7c0565-5242-5c9f-9f3a-ab40b1cdd8e8',
  '5a119206-6149-58e5-abff-cb0ef7fe9101',
  '9a345642-49c0-5bcd-9cde-a2997b6caceb',
  '739a4984-bac4-5ba1-a12b-0a8aee13d6e7',
  '311482d5-f90a-5170-aa9c-e328a12975ba'
);

update public.assets
set currency = 'AUD'
where id = '09096588-5c94-5243-826e-b696c379a1a2';

update public.assets
set isin = 'JE00B8DFY052', currency = 'EUR', name = 'WisdomTree Physical Gold EUR Hedged'
where id = '6b7c0565-5242-5c9f-9f3a-ab40b1cdd8e8';
