-- Define filial = 'SP' para todas as coletas de KM ja existentes, sem alterar data_coleta
-- nem qualquer outro campo.

do $$
declare
  v_total integer;
begin
  update public.coleta_km
  set filial = 'SP';

  get diagnostics v_total = row_count;
  raise notice 'Coletas de KM atualizadas com filial SP: %', v_total;
end $$;

-- Conferencia
select filial, count(*) as qtd
from public.coleta_km
group by filial
order by filial;
