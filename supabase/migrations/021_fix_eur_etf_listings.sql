-- MyInvestor purchases for these two ETFs are denominated in EUR.
-- Keep the stable asset ids and point market data to their EUR listings.

update public.asset_identifiers
set is_primary = false
where provider = 'yahoo'
  and asset_id in (
    'c7dc5ba7-8aa3-5b77-8817-0f74c6f08287',
    'aa077c3f-76bb-5476-8e72-890f3d587e34'
  );

insert into public.asset_identifiers
  (asset_id, provider, symbol, exchange, valid_from, valid_to, is_primary)
values
  ('c7dc5ba7-8aa3-5b77-8817-0f74c6f08287', 'yahoo', 'CNYB.MI', 'MIL', current_date, null, true),
  ('aa077c3f-76bb-5476-8e72-890f3d587e34', 'yahoo', 'XCHA.DE', 'XETRA', current_date, null, true)
on conflict (provider, symbol, exchange) do update set
  asset_id = excluded.asset_id,
  valid_from = excluded.valid_from,
  valid_to = null,
  is_primary = true;

update public.assets
set
  name = 'iShares China CNY Bond UCITS ETF USD (Dist)',
  isin = 'IE00BYPC1H27',
  currency = 'EUR'
where id = 'c7dc5ba7-8aa3-5b77-8817-0f74c6f08287';

update public.assets
set
  name = 'Xtrackers CSI 300 Swap UCITS ETF 1C',
  isin = 'LU0779800910',
  currency = 'EUR'
where id = 'aa077c3f-76bb-5476-8e72-890f3d587e34';

