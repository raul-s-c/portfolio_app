with ranked as (
  select
    id,
    row_number() over (
      partition by provider, symbol, coalesce(exchange, '')
      order by created_at, id
    ) as row_number
  from public.asset_identifiers
)
delete from public.asset_identifiers ai
using ranked r
where ai.id = r.id
  and r.row_number > 1;

update public.asset_identifiers
set exchange = ''
where exchange is null;

alter table public.asset_identifiers
alter column exchange set default '',
alter column exchange set not null;
