-- Corrige filial de uma lista especifica de rotas.
-- Execute no SQL Editor do Supabase.
--
-- Ajuste o valor de v_filial para a filial correta antes de executar.

do $$
declare
  v_filial text := 'PR';
  v_total integer;
begin
  update public.rotas
  set filial = v_filial
  where numero in (
    '2002',
    '2003',
    '2004',
    '2011',
    '2026',
    '2028',
    '2031',
    '2038',
    '2052',
    '2005',
    '2008',
    '2015',
    '2037',
    '2040',
    '2047',
    '2057',
    '2001',
    '2020',
    '2035',
    '2036',
    '2043',
    '2053',
    '2054',
    '2058',
    '2059',
    '2012',
    '2021',
    '2025',
    '2027',
    '2029',
    '2030',
    '2033',
    '2039',
    '2045',
    '2006',
    '2007',
    '2016',
    '2024',
    '2032'
  );

  get diagnostics v_total = row_count;
  raise notice 'Rotas atualizadas com filial %: %', v_filial, v_total;
end $$;

-- Conferencia das rotas informadas:
select
  numero,
  coalesce(nullif(btrim(filial), ''), 'SEM FILIAL') as filial
from public.rotas
where numero in (
  '2002',
  '2003',
  '2004',
  '2011',
  '2026',
  '2028',
  '2031',
  '2038',
  '2052',
  '2005',
  '2008',
  '2015',
  '2037',
  '2040',
  '2047',
  '2057',
  '2001',
  '2020',
  '2035',
  '2036',
  '2043',
  '2053',
  '2054',
  '2058',
  '2059',
  '2012',
  '2021',
  '2025',
  '2027',
  '2029',
  '2030',
  '2033',
  '2039',
  '2045',
  '2006',
  '2007',
  '2016',
  '2024',
  '2032'
)
order by numero;
