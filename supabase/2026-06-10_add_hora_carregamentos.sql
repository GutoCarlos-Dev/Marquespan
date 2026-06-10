-- Adiciona um campo padronizado para a data e hora dos carregamentos.
-- Execute no SQL Editor do Supabase antes de usar o novo campo Data/Hora.

begin;

alter table public.carregamentos
  add column if not exists data_hora timestamptz;

-- Recupera o historico usando a coluna antiga disponível na tabela.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'carregamentos'
      and column_name = 'data'
  ) then
    execute $sql$
      update public.carregamentos
      set data_hora = data::timestamp at time zone 'America/Sao_Paulo'
      where data_hora is null
        and data is not null
    $sql$;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'carregamentos'
      and column_name = 'data_carregamento'
  ) then
    execute $sql$
      update public.carregamentos
      set data_hora = data_carregamento::timestamp at time zone 'America/Sao_Paulo'
      where data_hora is null
        and data_carregamento is not null
    $sql$;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'carregamentos'
      and column_name = 'created_at'
  ) then
    execute $sql$
      update public.carregamentos
      set data_hora = created_at
      where data_hora is null
        and created_at is not null
    $sql$;
  end if;
end;
$$;

alter table public.carregamentos
  alter column data_hora set default now();

update public.carregamentos
set data_hora = now()
where data_hora is null;

alter table public.carregamentos
  alter column data_hora set not null;

create index if not exists idx_carregamentos_data_hora
  on public.carregamentos (data_hora desc);

commit;

select
  id,
  data_hora at time zone 'America/Sao_Paulo' as data_hora_sao_paulo
from public.carregamentos
order by data_hora desc
limit 20;
