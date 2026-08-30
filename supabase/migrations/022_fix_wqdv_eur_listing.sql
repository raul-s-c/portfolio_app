-- MyInvestor WQDV trades were paid in EUR. The official Xetra EUR ticker is QDVW.

update public.asset_identifiers
set is_primary = false
where provider = 'yahoo'
  and asset_id = '36dc4a94-b732-5b38-a799-2264223801a4';

insert into public.asset_identifiers
  (asset_id, provider, symbol, exchange, valid_from, valid_to, is_primary)
values
  ('36dc4a94-b732-5b38-a799-2264223801a4', 'yahoo', 'QDVW.DE', 'XETRA', current_date, null, true)
on conflict (provider, symbol, exchange) do update set
  asset_id = excluded.asset_id,
  valid_from = excluded.valid_from,
  valid_to = null,
  is_primary = true;

update public.assets
set currency = 'EUR'
where id = '36dc4a94-b732-5b38-a799-2264223801a4';

update public.transactions
set
  currency = 'EUR',
  raw_payload = raw_payload || jsonb_build_object(
    'normalized_currency', 'EUR',
    'currency_correction', 'User confirmed MyInvestor purchases were paid in EUR.'
  )
where asset_id = '36dc4a94-b732-5b38-a799-2264223801a4';
