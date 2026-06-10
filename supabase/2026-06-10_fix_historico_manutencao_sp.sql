-- Corrige o historico: todas as manutencoes existentes ocorreram em SP.
-- Execute uma unica vez no SQL Editor do Supabase.
-- Novos lancamentos continuarao usando a filial informada no momento da coleta.

begin;

-- Auditoria antes da correcao.
select
  coalesce(nullif(upper(trim(filial)), ''), 'SEM FILIAL') as filial_anterior,
  count(*) as total_lancamentos
from public.coletas_manutencao
group by coalesce(nullif(upper(trim(filial)), ''), 'SEM FILIAL')
order by filial_anterior;

-- Evita que o gatilho valide a filial do usuario durante esta correcao administrativa.
alter table public.coletas_manutencao
  disable trigger trg_definir_filial_coleta_manutencao;

update public.coletas_manutencao
set filial = 'SP'
where filial is distinct from 'SP';

alter table public.coletas_manutencao
  enable trigger trg_definir_filial_coleta_manutencao;

-- A execucao deve retornar apenas SP.
select
  coalesce(nullif(upper(trim(filial)), ''), 'SEM FILIAL') as filial_atual,
  count(*) as total_lancamentos
from public.coletas_manutencao
group by coalesce(nullif(upper(trim(filial)), ''), 'SEM FILIAL')
order by filial_atual;

commit;
