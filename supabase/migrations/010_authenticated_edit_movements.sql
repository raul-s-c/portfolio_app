grant update, delete on public.transactions to authenticated;
grant update, delete on public.dividends to authenticated;

drop policy if exists "authenticated updates transactions" on public.transactions;
create policy "authenticated updates transactions"
on public.transactions for update to authenticated
using (true)
with check (true);

drop policy if exists "authenticated deletes transactions" on public.transactions;
create policy "authenticated deletes transactions"
on public.transactions for delete to authenticated
using (true);

drop policy if exists "authenticated updates dividends" on public.dividends;
create policy "authenticated updates dividends"
on public.dividends for update to authenticated
using (true)
with check (true);

drop policy if exists "authenticated deletes dividends" on public.dividends;
create policy "authenticated deletes dividends"
on public.dividends for delete to authenticated
using (true);
