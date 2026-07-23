-- Registra o ÚLTIMO ACESSO (visualização) de cada usuário à escala/planejamento de uma
-- filial + semana + contexto (dia da semana ou 'PLANEJAMENTO') — separado da "última
-- alteração" (ultima_alteracao_por/em nas tabelas escala/faltas_afastamentos/planejamento_semanal),
-- que passa a refletir só edições reais feitas pelo usuário (ver script/escala.js).
--
-- Execute este arquivo no SQL Editor do Supabase:
-- https://hlzcycvlcuhgnnjkmslt.supabase.co

create table if not exists public.escala_acessos (
  filial text not null,
  semana text not null,
  contexto text not null, -- ex.: 'SEGUNDA', 'TERÇA'... ou 'PLANEJAMENTO'
  usuario text,
  acessado_em timestamptz not null default now(),
  primary key (filial, semana, contexto)
);

create index if not exists idx_escala_acessos_semana
  on public.escala_acessos (semana);

alter table public.escala_acessos enable row level security;

drop policy if exists escala_acessos_select_filial on public.escala_acessos;
create policy escala_acessos_select_filial
on public.escala_acessos
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists escala_acessos_insert_filial on public.escala_acessos;
create policy escala_acessos_insert_filial
on public.escala_acessos
for insert
to authenticated
with check (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists escala_acessos_update_filial on public.escala_acessos;
create policy escala_acessos_update_filial
on public.escala_acessos
for update
to authenticated
using (public.usuario_pode_ver_filial_escala(filial))
with check (public.usuario_pode_ver_filial_escala(filial));

revoke all on table public.escala_acessos from anon;
grant select, insert, update on table public.escala_acessos to authenticated;

-- Atualiza imediatamente o cache de estrutura usado pela API REST.
notify pgrst, 'reload schema';
