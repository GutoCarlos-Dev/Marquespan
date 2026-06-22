-- Protecao de acesso para pedagio.html e tabelas relacionadas.
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

create or replace function public.usuario_pode_ler_pedagio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('pedagio.html')
    or public.usuario_pode_acessar_pagina('relatorio-pedagio.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html');
$$;

create or replace function public.usuario_pode_editar_pedagio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('pedagio.html');
$$;

revoke all on table public.pedagios_lancamentos from anon;
grant select, insert, update, delete on table public.pedagios_lancamentos to authenticated;

alter table public.pedagios_lancamentos enable row level security;

drop policy if exists pedagios_lancamentos_select_permitidos on public.pedagios_lancamentos;
create policy pedagios_lancamentos_select_permitidos
on public.pedagios_lancamentos
for select
to authenticated
using (public.usuario_pode_ler_pedagio());

drop policy if exists pedagios_lancamentos_insert_permitidos on public.pedagios_lancamentos;
create policy pedagios_lancamentos_insert_permitidos
on public.pedagios_lancamentos
for insert
to authenticated
with check (public.usuario_pode_editar_pedagio());

drop policy if exists pedagios_lancamentos_update_permitidos on public.pedagios_lancamentos;
create policy pedagios_lancamentos_update_permitidos
on public.pedagios_lancamentos
for update
to authenticated
using (public.usuario_pode_editar_pedagio())
with check (public.usuario_pode_editar_pedagio());

drop policy if exists pedagios_lancamentos_delete_permitidos on public.pedagios_lancamentos;
create policy pedagios_lancamentos_delete_permitidos
on public.pedagios_lancamentos
for delete
to authenticated
using (public.usuario_pode_editar_pedagio());

revoke all on table public.pedagios_importacoes from anon;
grant select, insert, update, delete on table public.pedagios_importacoes to authenticated;

alter table public.pedagios_importacoes enable row level security;

drop policy if exists "pedagios_importacoes_select_table" on public.pedagios_importacoes;
drop policy if exists "pedagios_importacoes_insert_table" on public.pedagios_importacoes;
drop policy if exists "pedagios_importacoes_update_table" on public.pedagios_importacoes;
drop policy if exists "pedagios_importacoes_delete_table" on public.pedagios_importacoes;

drop policy if exists pedagios_importacoes_select_permitidos on public.pedagios_importacoes;
create policy pedagios_importacoes_select_permitidos
on public.pedagios_importacoes
for select
to authenticated
using (public.usuario_pode_editar_pedagio());

drop policy if exists pedagios_importacoes_insert_permitidos on public.pedagios_importacoes;
create policy pedagios_importacoes_insert_permitidos
on public.pedagios_importacoes
for insert
to authenticated
with check (public.usuario_pode_editar_pedagio());

drop policy if exists pedagios_importacoes_update_permitidos on public.pedagios_importacoes;
create policy pedagios_importacoes_update_permitidos
on public.pedagios_importacoes
for update
to authenticated
using (public.usuario_pode_editar_pedagio())
with check (public.usuario_pode_editar_pedagio());

drop policy if exists pedagios_importacoes_delete_permitidos on public.pedagios_importacoes;
create policy pedagios_importacoes_delete_permitidos
on public.pedagios_importacoes
for delete
to authenticated
using (public.usuario_pode_editar_pedagio());

do $$
begin
  if to_regclass('public.pedagios_empresas') is not null then
    revoke all on table public.pedagios_empresas from anon;
    grant select, insert, update, delete on table public.pedagios_empresas to authenticated;
    alter table public.pedagios_empresas enable row level security;

    drop policy if exists pedagios_empresas_select_permitidos on public.pedagios_empresas;
    create policy pedagios_empresas_select_permitidos
    on public.pedagios_empresas
    for select
    to authenticated
    using (public.usuario_pode_ler_pedagio());

    drop policy if exists pedagios_empresas_insert_permitidos on public.pedagios_empresas;
    create policy pedagios_empresas_insert_permitidos
    on public.pedagios_empresas
    for insert
    to authenticated
    with check (public.usuario_pode_editar_pedagio());

    drop policy if exists pedagios_empresas_update_permitidos on public.pedagios_empresas;
    create policy pedagios_empresas_update_permitidos
    on public.pedagios_empresas
    for update
    to authenticated
    using (public.usuario_pode_editar_pedagio())
    with check (public.usuario_pode_editar_pedagio());

    drop policy if exists pedagios_empresas_delete_permitidos on public.pedagios_empresas;
    create policy pedagios_empresas_delete_permitidos
    on public.pedagios_empresas
    for delete
    to authenticated
    using (public.usuario_pode_editar_pedagio());
  end if;
end $$;

drop policy if exists "pedagios_importacoes_select" on storage.objects;
create policy "pedagios_importacoes_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pedagios_importacoes'
  and public.usuario_pode_editar_pedagio()
);

drop policy if exists "pedagios_importacoes_insert" on storage.objects;
create policy "pedagios_importacoes_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pedagios_importacoes'
  and public.usuario_pode_editar_pedagio()
);

drop policy if exists "pedagios_importacoes_delete" on storage.objects;
create policy "pedagios_importacoes_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pedagios_importacoes'
  and public.usuario_pode_editar_pedagio()
);

revoke execute on function public.pedagios_contar_duplicados() from anon;
revoke execute on function public.pedagios_expurgar_duplicados() from anon;
grant execute on function public.pedagios_contar_duplicados() to authenticated;
grant execute on function public.pedagios_expurgar_duplicados() to authenticated;

notify pgrst, 'reload schema';
