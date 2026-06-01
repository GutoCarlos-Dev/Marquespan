-- Protecao da pagina usuarios.html e da tabela de permissoes.
-- Execute no SQL Editor do Supabase.
-- Regra:
-- - usuario autenticado le apenas o proprio cadastro para login/menu;
-- - administrador le e gerencia todos os usuarios;
-- - nivel_permissoes pode ser lida por usuarios autenticados para montar menu;
-- - somente administrador altera usuarios e permissoes.

create or replace function public.usuario_e_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id::text = auth.uid()::text
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) = 'administrador'
  );
$$;

alter table public.usuarios enable row level security;
alter table public.nivel_permissoes enable row level security;

drop policy if exists usuarios_select_admin_ou_proprio on public.usuarios;
create policy usuarios_select_admin_ou_proprio
on public.usuarios
for select
to authenticated
using (
  auth_user_id::text = auth.uid()::text
  or public.usuario_e_administrador()
);

drop policy if exists usuarios_insert_admin on public.usuarios;
create policy usuarios_insert_admin
on public.usuarios
for insert
to authenticated
with check (public.usuario_e_administrador());

drop policy if exists usuarios_update_admin on public.usuarios;
create policy usuarios_update_admin
on public.usuarios
for update
to authenticated
using (public.usuario_e_administrador())
with check (public.usuario_e_administrador());

drop policy if exists usuarios_delete_admin on public.usuarios;
create policy usuarios_delete_admin
on public.usuarios
for delete
to authenticated
using (public.usuario_e_administrador());

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
with check (public.usuario_e_administrador());

drop policy if exists nivel_permissoes_update_admin on public.nivel_permissoes;
create policy nivel_permissoes_update_admin
on public.nivel_permissoes
for update
to authenticated
using (public.usuario_e_administrador())
with check (public.usuario_e_administrador());

drop policy if exists nivel_permissoes_delete_admin on public.nivel_permissoes;
create policy nivel_permissoes_delete_admin
on public.nivel_permissoes
for delete
to authenticated
using (public.usuario_e_administrador());
