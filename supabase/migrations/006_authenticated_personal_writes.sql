grant insert, update on public.assets to authenticated;
grant insert, update on public.asset_identifiers to authenticated;
grant insert on public.transactions to authenticated;
grant insert on public.dividends to authenticated;
grant insert, update on public.asset_resolution_queue to authenticated;

drop policy if exists "authenticated writes assets" on public.assets;
create policy "authenticated writes assets"
on public.assets for insert to authenticated
with check (true);

drop policy if exists "authenticated updates assets" on public.assets;
create policy "authenticated updates assets"
on public.assets for update to authenticated
using (true)
with check (true);

drop policy if exists "authenticated writes identifiers" on public.asset_identifiers;
create policy "authenticated writes identifiers"
on public.asset_identifiers for insert to authenticated
with check (true);

drop policy if exists "authenticated updates identifiers" on public.asset_identifiers;
create policy "authenticated updates identifiers"
on public.asset_identifiers for update to authenticated
using (true)
with check (true);

drop policy if exists "authenticated writes transactions" on public.transactions;
create policy "authenticated writes transactions"
on public.transactions for insert to authenticated
with check (true);

drop policy if exists "authenticated writes dividends" on public.dividends;
create policy "authenticated writes dividends"
on public.dividends for insert to authenticated
with check (true);

drop policy if exists "authenticated writes asset resolution queue" on public.asset_resolution_queue;
create policy "authenticated writes asset resolution queue"
on public.asset_resolution_queue for insert to authenticated
with check (true);

drop policy if exists "authenticated updates asset resolution queue" on public.asset_resolution_queue;
create policy "authenticated updates asset resolution queue"
on public.asset_resolution_queue for update to authenticated
using (true)
with check (true);
