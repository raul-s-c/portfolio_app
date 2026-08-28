create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('portfolio_periodic', 'rebalance_opportunity')),
  title text not null,
  period_start date,
  period_end date,
  prompt text not null,
  portfolio_context jsonb not null default '{}'::jsonb,
  web_context jsonb not null default '{}'::jsonb,
  content_markdown text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_research_reports_type_created_at
on public.research_reports(report_type, created_at desc);

alter table public.research_reports enable row level security;

grant select on public.research_reports to authenticated;
grant select, insert, update, delete on public.research_reports to service_role;

drop policy if exists "authenticated read research reports" on public.research_reports;
create policy "authenticated read research reports"
on public.research_reports for select to authenticated using (true);

drop policy if exists "service writes research reports" on public.research_reports;
create policy "service writes research reports"
on public.research_reports for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
