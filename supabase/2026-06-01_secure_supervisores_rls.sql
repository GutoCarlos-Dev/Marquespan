-- Protecao de dados de supervisores.
-- Execute no SQL Editor do Supabase depois de conferir os nomes das colunas.
-- A pagina usa usuarios.auth_user_id vinculado a auth.users.id e
-- nivel_permissoes.paginas_permitidas como text[].

create or replace function public.usuario_pode_acessar_pagina(p_pagina text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    left join public.nivel_permissoes np
      on lower(np.nivel) = lower(u.nivel)
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and (
        lower(u.nivel) = 'administrador'
        or p_pagina = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
  );
$$;

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

alter table public.supervisores enable row level security;

drop policy if exists supervisores_select_permitidos on public.supervisores;
create policy supervisores_select_permitidos
on public.supervisores
for select
to authenticated
using (public.usuario_pode_acessar_pagina('supervisor.html'));

drop policy if exists supervisores_insert_gerencia on public.supervisores;
create policy supervisores_insert_gerencia
on public.supervisores
for insert
to authenticated
with check (public.usuario_pode_gerenciar_cadastros());

drop policy if exists supervisores_update_gerencia on public.supervisores;
create policy supervisores_update_gerencia
on public.supervisores
for update
to authenticated
using (public.usuario_pode_gerenciar_cadastros())
with check (public.usuario_pode_gerenciar_cadastros());

drop policy if exists supervisores_delete_gerencia on public.supervisores;
create policy supervisores_delete_gerencia
on public.supervisores
for delete
to authenticated
using (public.usuario_pode_gerenciar_cadastros());
