-- Protecao de acesso para buscar-carregamento.html e tabelas relacionadas.
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

create or replace function public.usuario_pode_ler_carregamento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('buscar-carregamento.html')
    or public.usuario_pode_acessar_pagina('cadastro-carregamento.html')
    or public.usuario_pode_acessar_pagina('iniciar-carregamento.html');
$$;

create or replace function public.usuario_pode_editar_carregamento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('cadastro-carregamento.html')
    or public.usuario_pode_acessar_pagina('iniciar-carregamento.html');
$$;

revoke all on table public.saidas_carregamento from anon;
revoke all on table public.requisicoes_carregamento from anon;
grant select, insert, update, delete on table public.saidas_carregamento to authenticated;
grant select, insert, update, delete on table public.requisicoes_carregamento to authenticated;

alter table public.saidas_carregamento enable row level security;
alter table public.requisicoes_carregamento enable row level security;

drop policy if exists "saidas_carregamento_select_permitidos" on public.saidas_carregamento;
drop policy if exists "saidas_carregamento_insert_permitidos" on public.saidas_carregamento;
drop policy if exists "saidas_carregamento_update_permitidos" on public.saidas_carregamento;
drop policy if exists "saidas_carregamento_delete_permitidos" on public.saidas_carregamento;

create policy saidas_carregamento_select_permitidos
on public.saidas_carregamento
for select
to authenticated
using (public.usuario_pode_ler_carregamento());

create policy saidas_carregamento_insert_permitidos
on public.saidas_carregamento
for insert
to authenticated
with check (public.usuario_pode_editar_carregamento());

create policy saidas_carregamento_update_permitidos
on public.saidas_carregamento
for update
to authenticated
using (public.usuario_pode_editar_carregamento())
with check (public.usuario_pode_editar_carregamento());

create policy saidas_carregamento_delete_permitidos
on public.saidas_carregamento
for delete
to authenticated
using (public.usuario_pode_editar_carregamento());

drop policy if exists "Permitir leitura requisicoes carregamento" on public.requisicoes_carregamento;
drop policy if exists "Permitir inserir requisicoes carregamento" on public.requisicoes_carregamento;
drop policy if exists "Permitir atualizar requisicoes carregamento" on public.requisicoes_carregamento;
drop policy if exists "Permitir excluir requisicoes carregamento" on public.requisicoes_carregamento;

create policy requisicoes_carregamento_select_permitidos
on public.requisicoes_carregamento
for select
to authenticated
using (public.usuario_pode_ler_carregamento());

create policy requisicoes_carregamento_insert_permitidos
on public.requisicoes_carregamento
for insert
to authenticated
with check (public.usuario_pode_editar_carregamento());

create policy requisicoes_carregamento_update_permitidos
on public.requisicoes_carregamento
for update
to authenticated
using (public.usuario_pode_editar_carregamento())
with check (public.usuario_pode_editar_carregamento());

create policy requisicoes_carregamento_delete_permitidos
on public.requisicoes_carregamento
for delete
to authenticated
using (public.usuario_pode_editar_carregamento());

drop policy if exists "Requisicoes carregamento anexos leitura" on storage.objects;
create policy "Requisicoes carregamento anexos leitura"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'requisicoes-carregamento'
  and public.usuario_pode_ler_carregamento()
);

drop policy if exists "Requisicoes carregamento anexos inserir" on storage.objects;
create policy "Requisicoes carregamento anexos inserir"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'requisicoes-carregamento'
  and public.usuario_pode_editar_carregamento()
);

drop policy if exists "Requisicoes carregamento anexos atualizar" on storage.objects;
create policy "Requisicoes carregamento anexos atualizar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'requisicoes-carregamento'
  and public.usuario_pode_editar_carregamento()
)
with check (
  bucket_id = 'requisicoes-carregamento'
  and public.usuario_pode_editar_carregamento()
);

drop policy if exists "Requisicoes carregamento anexos excluir" on storage.objects;
create policy "Requisicoes carregamento anexos excluir"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'requisicoes-carregamento'
  and public.usuario_pode_editar_carregamento()
);

notify pgrst, 'reload schema';
