-- supervisor.html: gerencia_tmg passa a ser SOMENTE VISUALIZACAO (sem cadastrar/editar/excluir/
-- importar supervisores) — reverte a inclusao de gerencia_tmg feita em
-- 2026-07-21_add_gerencia_tmg_rls.sql para usuario_pode_gerenciar_cadastros(), que dava acesso
-- de escrita igual a gerencia. A leitura continua liberada normalmente via
-- nivel_permissoes.paginas_permitidas (usuario_pode_acessar_pagina).
-- Execute no SQL Editor do Supabase.

create or replace function public.usuario_pode_gerenciar_cadastros()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia')
  );
$$;

notify pgrst, 'reload schema';
