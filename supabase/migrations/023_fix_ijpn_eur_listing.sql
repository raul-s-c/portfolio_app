-- IE00B02KXH56 trades in EUR on Xetra as IQQJ. IJPN remains a broker alias.

update public.asset_identifiers
set is_primary = false
where provider = 'yahoo'
  and asset_id = '05b81b6e-0005-514c-8ace-63dff08d02d3';

insert into public.asset_identifiers
  (asset_id, provider, symbol, exchange, valid_from, valid_to, is_primary)
values
  ('05b81b6e-0005-514c-8ace-63dff08d02d3', 'yahoo', 'IQQJ.DE', 'XETRA', current_date, null, true)
on conflict (provider, symbol, exchange) do update set
  asset_id = excluded.asset_id,
  valid_from = excluded.valid_from,
  valid_to = null,
  is_primary = true;

update public.assets
set
  name = 'iShares MSCI Japan UCITS ETF USD (Dist)',
  isin = 'IE00B02KXH56',
  currency = 'EUR'
where id = '05b81b6e-0005-514c-8ace-63dff08d02d3';
