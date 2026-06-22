-- Permite acesso a usuarios.html conforme nivel_permissoes.
-- Execute no SQL Editor do Supabase.

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

create or replace function public.usuario_pode_gerenciar_usuarios()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('usuarios.html');
$$;

alter table public.usuarios enable row level security;
alter table public.nivel_permissoes enable row level security;

grant select, insert, update, delete on table public.usuarios to authenticated;
grant select, insert, update, delete on table public.nivel_permissoes to authenticated;

drop policy if exists usuarios_select_admin_ou_proprio on public.usuarios;
create policy usuarios_select_admin_ou_proprio
on public.usuarios
for select
to authenticated
using (
  auth_user_id::text = auth.uid()::text
  or (select public.usuario_pode_gerenciar_usuarios())
);

drop policy if exists usuarios_insert_admin on public.usuarios;
create policy usuarios_insert_admin
on public.usuarios
for insert
to authenticated
with check ((select public.usuario_pode_gerenciar_usuarios()));

drop policy if exists usuarios_update_admin on public.usuarios;
create policy usuarios_update_admin
on public.usuarios
for update
to authenticated
using ((select public.usuario_pode_gerenciar_usuarios()))
with check ((select public.usuario_pode_gerenciar_usuarios()));

drop policy if exists usuarios_delete_admin on public.usuarios;
create policy usuarios_delete_admin
on public.usuarios
for delete
to authenticated
using ((select public.usuario_pode_gerenciar_usuarios()));

drop policy if exists nivel_permissoes_select_authenticated on public.nivel_permissoes;
create policy nivel_permissoes_select_authenticated
on public.nivel_permissoes
for select
to authenticated
using (true);

drop policy if exists nivel_permissoes_insert_admin on public.nivel_permissoes;
create policy nivel_permissoes_insert_admin
on public.nivel_permissoes
for insert
to authenticated
with check ((select public.usuario_pode_gerenciar_usuarios()));

drop policy if exists nivel_permissoes_update_admin on public.nivel_permissoes;
create policy nivel_permissoes_update_admin
on public.nivel_permissoes
for update
to authenticated
using ((select public.usuario_pode_gerenciar_usuarios()))
with check ((select public.usuario_pode_gerenciar_usuarios()));

drop policy if exists nivel_permissoes_delete_admin on public.nivel_permissoes;
create policy nivel_permissoes_delete_admin
on public.nivel_permissoes
for delete
to authenticated
using ((select public.usuario_pode_gerenciar_usuarios()));

notify pgrst, 'reload schema';
