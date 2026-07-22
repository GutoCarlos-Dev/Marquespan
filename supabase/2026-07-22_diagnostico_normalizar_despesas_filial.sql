-- Diagnóstico + normalização do campo "filial" na tabela despesas.
-- Execute no SQL Editor do Supabase, PASSO A PASSO (não rode tudo de uma vez).

-- ═══════════════════════════════════════════════════════════════
-- PASSO 1 — DIAGNÓSTICO (somente leitura, seguro rodar)
-- Mostra cada valor distinto gravado em "filial" (incluindo nulo/vazio)
-- e quantos lançamentos têm cada um. É aqui que aparece o motivo real
-- da diferença entre "Todas as Filiais" (60) e "SP" (15) no Histórico.
-- ═══════════════════════════════════════════════════════════════
select
  filial,
  filial is null as "e_nulo",
  length(filial) as tamanho_texto,
  count(*) as qtd_lancamentos
from public.despesas
group by filial
order by qtd_lancamentos desc;

-- ═══════════════════════════════════════════════════════════════
-- PASSO 2 — Ver quais lançamentos do Anderson especificamente têm
-- filial diferente de "SP" (ou nula), pra conferir antes de alterar.
-- Troque o nome se quiser checar outro funcionário.
-- ═══════════════════════════════════════════════════════════════
select d.id, d.filial, d.data_checkin, d.numero_rota, d.created_at
from public.despesas d
left join public.funcionario f1 on f1.id = d.id_funcionario1
left join public.funcionario f2 on f2.id = d.id_funcionario2
where (f1.nome_completo ilike '%ANDERSON DOS SANTOS%' or f2.nome_completo ilike '%ANDERSON DOS SANTOS%')
  and (d.filial is null or trim(upper(d.filial)) <> 'SP')
order by d.data_checkin desc;

-- ═══════════════════════════════════════════════════════════════
-- PASSO 3 — ATUALIZAÇÃO (só rode depois de conferir os passos acima).
-- Preenche/normaliza para 'SP' todo lançamento cujo filial esteja
-- nulo, vazio ou com qualquer variação (espaço, caixa) de "SP".
-- NÃO mexe em lançamentos que já tenham outra filial diferente de SP
-- cadastrada de propósito (ex.: se um dia a empresa abrir outra filial
-- e algum registro antigo já estiver corretamente marcado com ela).
-- ═══════════════════════════════════════════════════════════════
update public.despesas
set filial = 'SP'
where filial is null
   or trim(filial) = ''
   or (trim(upper(filial)) <> 'SP' and filial ilike '%SP%');

-- ═══════════════════════════════════════════════════════════════
-- PASSO 4 — Conferir o resultado (deve mostrar só 'SP' com a contagem total)
-- ═══════════════════════════════════════════════════════════════
select filial, count(*) as qtd_lancamentos
from public.despesas
group by filial
order by qtd_lancamentos desc;
