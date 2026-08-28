grant usage on schema public to anon, authenticated, service_role;

grant select on public.brokers to authenticated;
grant select on public.assets to authenticated;
grant select on public.asset_identifiers to authenticated;
grant select on public.transactions to authenticated;
grant select on public.dividends to authenticated;
grant select on public.price_snapshots to authenticated;
grant select on public.portfolio_snapshots to authenticated;
grant select on public.asset_resolution_queue to authenticated;
grant select on public.v_latest_prices to authenticated;
grant select on public.v_open_positions to authenticated;

grant select, insert, update, delete on public.brokers to service_role;
grant select, insert, update, delete on public.assets to service_role;
grant select, insert, update, delete on public.asset_identifiers to service_role;
grant select, insert, update, delete on public.transactions to service_role;
grant select, insert, update, delete on public.dividends to service_role;
grant select, insert, update, delete on public.price_snapshots to service_role;
grant select, insert, update, delete on public.portfolio_snapshots to service_role;
grant select, insert, update, delete on public.asset_resolution_queue to service_role;
grant select on public.v_latest_prices to service_role;
grant select on public.v_open_positions to service_role;

grant execute on function public.touch_updated_at() to service_role;
