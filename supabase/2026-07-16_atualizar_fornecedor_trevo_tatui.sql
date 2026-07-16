/* Atualiza o fornecedor "AUTO POSTO DE MOLAS TREVO DE TATUI LTDA" para incluir o CNPJ apenas
   nos lancamentos ja feitos na tabela manutencao (titulo ENGRAXAMENTO) - o cadastro de
   fornecedores (fornecedor_manutencao) NAO e alterado.
   Execute no SQL Editor do Supabase. */

do $$
declare
  v_nome_antigo text := 'AUTO POSTO DE MOLAS TREVO DE TATUI LTDA';
  v_nome_novo   text := 'AUTO POSTO DE MOLAS TREVO DE TATUI LTDA (CNPJ: 14.136.586/0001-20)';
  v_total_manutencao integer;
begin
  update public.manutencao
  set fornecedor = v_nome_novo
  where titulo = 'ENGRAXAMENTO'
    and fornecedor = v_nome_antigo;

  get diagnostics v_total_manutencao = row_count;
  raise notice 'Manutencoes (ENGRAXAMENTO) atualizadas: %', v_total_manutencao;
end $$;

-- Conferencia
select id, titulo, fornecedor, veiculo, data, filial
from public.manutencao
where titulo = 'ENGRAXAMENTO'
  and fornecedor ilike '%TREVO DE TATUI%'
order by data desc;
