drop policy if exists "solo sync insert" on public.user_sync_states;
drop policy if exists "solo sync read" on public.user_sync_states;
drop policy if exists "solo sync update" on public.user_sync_states;

revoke all privileges on public.user_sync_states from anon;

drop policy if exists "service role only sync access" on public.user_sync_states;
create policy "service role only sync access"
on public.user_sync_states
for all
to service_role
using (true)
with check (true);
