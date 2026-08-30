-- Add deterministic public NAV sources for the MyInvestor mutual funds.

do $$
declare
  target_asset_id uuid;
begin
  select id into target_asset_id
  from public.assets
  where isin = 'LU0625737910'
  limit 1;

  if target_asset_id is not null then
    update public.assets
    set notes = 'Fondo MyInvestor. Valor liquidativo e historico diario obtenidos de OCU por ISIN; entrada manual disponible como respaldo.'
    where id = target_asset_id;

    insert into public.asset_identifiers (asset_id, provider, symbol, exchange, is_primary)
    values (target_asset_id, 'ocu', 'pictet-china-index-p-eur', 'WEB', false)
    on conflict (provider, symbol, exchange)
    do update set asset_id = excluded.asset_id,
                  valid_to = null;
  end if;
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

  if target_asset_id is not null then
    update public.assets
    set notes = 'Fondo MyInvestor. Valor liquidativo e historico diario obtenidos de OCU por ISIN; entrada manual disponible como respaldo.'
    where id = target_asset_id;

    insert into public.asset_identifiers (asset_id, provider, symbol, exchange, is_primary)
    values (target_asset_id, 'ocu', 'gamma-global-a', 'WEB', false)
    on conflict (provider, symbol, exchange)
    do update set asset_id = excluded.asset_id,
                  valid_to = null;
  end if;
end;
$$;
