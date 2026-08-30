grant usage on schema public to service_role;

grant select, insert, update, delete on public.portfolio_strategies to service_role;
grant select, insert, update, delete on public.virtual_portfolios to service_role;
grant select, insert, update, delete on public.virtual_portfolio_assignments to service_role;
grant select, insert, update, delete on public.asset_tags to service_role;

grant select on public.v_virtual_portfolio_positions to service_role;
grant select on public.v_latest_asset_price_history to service_role;
