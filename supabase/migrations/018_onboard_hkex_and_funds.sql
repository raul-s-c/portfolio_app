do $$
declare
  target_asset_id uuid;
begin
  select ai.asset_id
    into target_asset_id
  from public.asset_identifiers ai
  where ai.provider = 'yahoo'
    and ai.symbol = '0388.HK'
  limit 1;

  if target_asset_id is null then
    insert into public.assets (asset_type, name, currency, country, sector, notes)
    values (
      'stock',
      'Hong Kong Exchanges and Clearing',
      'HKD',
      'Hong Kong',
      'Financial Services',
      'SEHK stock code 388. Yahoo Finance symbol 0388.HK.'
    )
    returning id into target_asset_id;
  else
    update public.assets
    set name = 'Hong Kong Exchanges and Clearing',
        asset_type = 'stock',
        currency = 'HKD',
        country = 'Hong Kong',
        sector = 'Financial Services',
        notes = 'SEHK stock code 388. Yahoo Finance symbol 0388.HK.'
    where id = target_asset_id;
  end if;

  insert into public.asset_identifiers (asset_id, provider, symbol, exchange, is_primary)
  values
    (target_asset_id, 'yahoo', '0388.HK', 'SEHK', true),
    (target_asset_id, 'broker_alias', '388', 'SEHK', false)
  on conflict (provider, symbol, exchange)
  do update set asset_id = excluded.asset_id,
                is_primary = excluded.is_primary,
                valid_to = null;
end;
$$;

do $$
declare
  target_asset_id uuid;
begin
  select id into target_asset_id
  from public.assets
  where isin = 'LU0625737910'
  limit 1;

  if target_asset_id is null then
    insert into public.assets (asset_type, name, isin, currency, country, notes)
    values (
      'fund',
      'Pictet - China Index P EUR',
      'LU0625737910',
      'EUR',
      'Luxembourg',
      'Fondo MyInvestor. Identidad estable por ISIN; valor liquidativo manual hasta disponer de una fuente verificable.'
    )
    returning id into target_asset_id;
  else
    update public.assets
    set name = 'Pictet - China Index P EUR',
        asset_type = 'fund',
        currency = 'EUR',
        country = 'Luxembourg'
    where id = target_asset_id;
  end if;

  insert into public.asset_identifiers (asset_id, provider, symbol, exchange, is_primary)
  values (target_asset_id, 'isin', 'LU0625737910', '', true)
  on conflict (provider, symbol, exchange)
  do update set asset_id = excluded.asset_id,
                is_primary = true,
                valid_to = null;
end;
$$;

do $$
declare
  target_asset_id uuid;
begin
  select id into target_asset_id
  from public.assets
  where isin = 'ES0140794001'
  limit 1;

  if target_asset_id is null then
    insert into public.assets (asset_type, name, isin, currency, country, notes)
    values (
      'fund',
      'Gamma Global FI Clase A',
      'ES0140794001',
      'EUR',
      'Spain',
      'Fondo MyInvestor. Identidad estable por ISIN; valor liquidativo manual hasta disponer de una fuente verificable.'
    )
    returning id into target_asset_id;
  else
    update public.assets
    set name = 'Gamma Global FI Clase A',
        asset_type = 'fund',
        currency = 'EUR',
        country = 'Spain'
    where id = target_asset_id;
  end if;

  insert into public.asset_identifiers (asset_id, provider, symbol, exchange, is_primary)
  values (target_asset_id, 'isin', 'ES0140794001', '', true)
  on conflict (provider, symbol, exchange)
  do update set asset_id = excluded.asset_id,
                is_primary = true,
                valid_to = null;
end;
$$;
