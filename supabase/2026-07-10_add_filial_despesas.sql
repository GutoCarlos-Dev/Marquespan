alter table if exists public.despesas
    add column if not exists filial text;

update public.despesas
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

create index if not exists idx_despesas_filial
    on public.despesas (filial);
