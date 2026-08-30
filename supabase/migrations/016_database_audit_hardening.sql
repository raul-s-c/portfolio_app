alter view public.v_latest_prices set (security_invoker = true);
alter view public.v_virtual_portfolio_positions set (security_invoker = true);
alter view public.v_latest_asset_price_history set (security_invoker = true);

alter function public.touch_updated_at() set search_path = public;

create index if not exists idx_asset_resolution_queue_resolved_asset
  on public.asset_resolution_queue(resolved_asset_id);
create index if not exists idx_dividend_calendar_events_broker
  on public.dividend_calendar_events(broker_id);
create index if not exists idx_dividends_broker
  on public.dividends(broker_id);
create index if not exists idx_portfolio_cash_flows_asset
  on public.portfolio_cash_flows(asset_id);
create index if not exists idx_portfolio_cash_flows_broker
  on public.portfolio_cash_flows(broker_id);
create index if not exists idx_portfolio_cash_flows_virtual_portfolio
  on public.portfolio_cash_flows(virtual_portfolio_id);
create index if not exists idx_portfolio_snapshots_asset
  on public.portfolio_snapshots(asset_id);
create index if not exists idx_portfolio_snapshots_broker
  on public.portfolio_snapshots(broker_id);
create index if not exists idx_transactions_broker
  on public.transactions(broker_id);
create index if not exists idx_virtual_portfolio_assignments_broker
  on public.virtual_portfolio_assignments(broker_id);
create index if not exists idx_virtual_portfolios_strategy
  on public.virtual_portfolios(strategy_id);
