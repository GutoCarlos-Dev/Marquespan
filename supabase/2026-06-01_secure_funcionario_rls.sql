-- Protecao de dados de funcionarios.
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

create or replace function public.usuario_pode_gerenciar_funcionarios()
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

alter table public.funcionario enable row level security;
alter table public.funcionario_historico_funcao enable row level security;

drop policy if exists funcionario_select_permitidos on public.funcionario;
create policy funcionario_select_permitidos
on public.funcionario
for select
to authenticated
using (public.usuario_pode_acessar_pagina('funcionario.html'));

drop policy if exists funcionario_insert_admin on public.funcionario;
create policy funcionario_insert_admin
on public.funcionario
for insert
to authenticated
with check (public.usuario_pode_gerenciar_funcionarios());

drop policy if exists funcionario_update_admin on public.funcionario;
create policy funcionario_update_admin
on public.funcionario
for update
to authenticated
using (public.usuario_pode_gerenciar_funcionarios())
with check (public.usuario_pode_gerenciar_funcionarios());

drop policy if exists funcionario_delete_admin on public.funcionario;
create policy funcionario_delete_admin
on public.funcionario
for delete
to authenticated
using (public.usuario_pode_gerenciar_funcionarios());

drop policy if exists funcionario_historico_select_permitidos on public.funcionario_historico_funcao;
create policy funcionario_historico_select_permitidos
on public.funcionario_historico_funcao
for select
to authenticated
using (public.usuario_pode_acessar_pagina('funcionario.html'));

drop policy if exists funcionario_historico_insert_admin on public.funcionario_historico_funcao;
create policy funcionario_historico_insert_admin
on public.funcionario_historico_funcao
for insert
to authenticated
with check (public.usuario_pode_gerenciar_funcionarios());

drop policy if exists funcionario_historico_update_admin on public.funcionario_historico_funcao;
create policy funcionario_historico_update_admin
on public.funcionario_historico_funcao
for update
to authenticated
using (public.usuario_pode_gerenciar_funcionarios())
with check (public.usuario_pode_gerenciar_funcionarios());

drop policy if exists funcionario_historico_delete_admin on public.funcionario_historico_funcao;
create policy funcionario_historico_delete_admin
on public.funcionario_historico_funcao
for delete
to authenticated
using (public.usuario_pode_gerenciar_funcionarios());
