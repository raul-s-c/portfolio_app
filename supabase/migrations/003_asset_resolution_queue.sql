create table if not exists public.asset_resolution_queue (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  raw_name text,
  symbol text,
  isin text,
  broker text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'ignored')),
  resolved_asset_id uuid references public.assets(id),
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asset_resolution_queue_status on public.asset_resolution_queue(status, created_at);
create index if not exists idx_asset_resolution_queue_symbol on public.asset_resolution_queue(symbol);
create index if not exists idx_asset_resolution_queue_isin on public.asset_resolution_queue(isin);

drop trigger if exists trg_asset_resolution_queue_touch_updated_at on public.asset_resolution_queue;
create trigger trg_asset_resolution_queue_touch_updated_at
before update on public.asset_resolution_queue
for each row execute function public.touch_updated_at();

alter table public.asset_resolution_queue enable row level security;

create policy "authenticated read asset resolution queue"
on public.asset_resolution_queue for select to authenticated using (true);

create policy "service writes asset resolution queue"
on public.asset_resolution_queue for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
