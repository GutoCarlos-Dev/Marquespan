-- Corrige rotas importadas sem filial.
-- Execute no SQL Editor do Supabase.
--
-- Ajuste o valor de v_filial para a filial correta antes de executar.

do $$
declare
  v_filial text := 'SP';
  v_total integer;
begin
  update public.rotas
  set filial = v_filial
  where filial is null
     or btrim(filial) = '';

  get diagnostics v_total = row_count;
  raise notice 'Rotas atualizadas com filial %: %', v_filial, v_total;
end $$;

create index if not exists idx_rotas_filial
on public.rotas (filial);

-- Conferencia apos a atualizacao:
select
  coalesce(nullif(btrim(filial), ''), 'SEM FILIAL') as filial,
  count(*) as total_rotas
from public.rotas
group by coalesce(nullif(btrim(filial), ''), 'SEM FILIAL')
order by filial;
