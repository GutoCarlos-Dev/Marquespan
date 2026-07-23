-- Registra a ÚLTIMA ALTERAÇÃO por filial + semana + contexto (dia da semana) mesmo quando a
-- ação apaga/substitui linhas inteiras (ex.: "Atualizar as abas diárias pelo Planejamento"),
-- caso em que a linha que carregava ultima_alteracao_por/em pode deixar de existir e a tela
-- passaria a mostrar "Nenhuma alteração registrada" mesmo tendo acabado de ser alterada.
--
-- Serve como complemento aos campos ultima_alteracao_por/em das tabelas escala/
-- faltas_afastamentos/planejamento_semanal (ver script/escala.js: carregarUltimaAuditoriaEscala).
--
-- Execute este arquivo no SQL Editor do Supabase:
-- https://hlzcycvlcuhgnnjkmslt.supabase.co

create table if not exists public.escala_alteracoes (
  filial text not null,
  semana text not null,
  contexto text not null, -- ex.: 'SEGUNDA', 'TERCA'... (mesmo valor de IMPORT_DAYS/data-dia)
  usuario text,
  alterado_em timestamptz not null default now(),
  primary key (filial, semana, contexto)
);

create index if not exists idx_escala_alteracoes_semana
  on public.escala_alteracoes (semana);

alter table public.escala_alteracoes enable row level security;

drop policy if exists escala_alteracoes_select_filial on public.escala_alteracoes;
create policy escala_alteracoes_select_filial
on public.escala_alteracoes
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists escala_alteracoes_insert_gerencia on public.escala_alteracoes;
create policy escala_alteracoes_insert_gerencia
on public.escala_alteracoes
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_alteracoes_update_gerencia on public.escala_alteracoes;
create policy escala_alteracoes_update_gerencia
on public.escala_alteracoes
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

revoke all on table public.escala_alteracoes from anon;
grant select, insert, update on table public.escala_alteracoes to authenticated;

-- Atualiza imediatamente o cache de estrutura usado pela API REST.
notify pgrst, 'reload schema';
