create table if not exists public.asset_tags (
  asset_id uuid not null references public.assets(id) on delete cascade,
  tag text not null,
  notes text,
  created_at timestamptz not null default now(),
  primary key (asset_id, tag)
);

alter table public.asset_tags enable row level security;

grant select, insert, update, delete on public.asset_tags to authenticated;
grant select, insert, update, delete on public.asset_tags to service_role;

drop policy if exists "authenticated read asset tags" on public.asset_tags;
create policy "authenticated read asset tags"
on public.asset_tags for select to authenticated using (true);

drop policy if exists "authenticated writes asset tags" on public.asset_tags;
create policy "authenticated writes asset tags"
on public.asset_tags for all to authenticated
using (true)
with check (true);

drop policy if exists "service writes asset tags" on public.asset_tags;
create policy "service writes asset tags"
on public.asset_tags for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'research_reports'
      and constraint_name = 'research_reports_report_type_check'
  ) then
    alter table public.research_reports
      drop constraint research_reports_report_type_check;
  end if;
end $$;

alter table public.research_reports
  add constraint research_reports_report_type_check
  check (
    report_type in (
      'portfolio_periodic',
      'rebalance_opportunity',
      'portfolio_group_analysis',
      'etf_resilient_portfolio'
    )
  );

insert into public.asset_tags (asset_id, tag, notes)
select distinct
  op.asset_id,
  'myinvestor_resilient_etf',
  'ETF de MyInvestor para cartera resistente: largo plazo, inflacion +2% en dividendo esperado y crecimiento +4/6% anual.'
from public.v_open_positions op
where lower(op.broker) = 'myinvestor'
  and op.asset_type = 'etf'
on conflict (asset_id, tag) do update
set notes = excluded.notes;
