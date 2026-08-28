create table if not exists public.personal_app_state (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_personal_app_state_touch_updated_at on public.personal_app_state;
create trigger trg_personal_app_state_touch_updated_at
before update on public.personal_app_state
for each row execute function public.touch_updated_at();

alter table public.personal_app_state enable row level security;

grant select, insert, update on public.personal_app_state to authenticated;
grant select, insert, update, delete on public.personal_app_state to service_role;

drop policy if exists "authenticated read personal app state" on public.personal_app_state;
create policy "authenticated read personal app state"
on public.personal_app_state for select to authenticated using (true);

drop policy if exists "authenticated writes personal app state" on public.personal_app_state;
create policy "authenticated writes personal app state"
on public.personal_app_state for insert to authenticated with check (true);

drop policy if exists "authenticated updates personal app state" on public.personal_app_state;
create policy "authenticated updates personal app state"
on public.personal_app_state for update to authenticated using (true) with check (true);

drop policy if exists "service writes personal app state" on public.personal_app_state;
create policy "service writes personal app state"
on public.personal_app_state for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
