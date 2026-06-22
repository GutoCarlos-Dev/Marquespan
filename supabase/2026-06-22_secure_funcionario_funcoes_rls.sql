-- Protecao de acesso para o modal Cadastro de Funcao em funcionario.html.
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

create or replace function public.usuario_pode_gerenciar_funcionario_funcoes()
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
      and public.usuario_pode_acessar_pagina('funcionario.html')
  );
$$;

revoke all on table public.funcionario_funcoes from anon;
grant select, insert, update, delete on table public.funcionario_funcoes to authenticated;

alter table public.funcionario_funcoes enable row level security;

drop policy if exists funcionario_funcoes_select_permitidos on public.funcionario_funcoes;
drop policy if exists funcionario_funcoes_insert_permitidos on public.funcionario_funcoes;
drop policy if exists funcionario_funcoes_update_permitidos on public.funcionario_funcoes;
drop policy if exists funcionario_funcoes_delete_permitidos on public.funcionario_funcoes;

create policy funcionario_funcoes_select_permitidos
on public.funcionario_funcoes
for select
to authenticated
using ((select public.usuario_pode_acessar_pagina('funcionario.html')));

create policy funcionario_funcoes_insert_permitidos
on public.funcionario_funcoes
for insert
to authenticated
with check ((select public.usuario_pode_gerenciar_funcionario_funcoes()));

create policy funcionario_funcoes_update_permitidos
on public.funcionario_funcoes
for update
to authenticated
using ((select public.usuario_pode_gerenciar_funcionario_funcoes()))
with check ((select public.usuario_pode_gerenciar_funcionario_funcoes()));

create policy funcionario_funcoes_delete_permitidos
on public.funcionario_funcoes
for delete
to authenticated
using ((select public.usuario_pode_gerenciar_funcionario_funcoes()));

create index if not exists idx_funcionario_funcoes_nome
on public.funcionario_funcoes (nome);

create index if not exists idx_funcionario_funcoes_ativo
on public.funcionario_funcoes (ativo);

notify pgrst, 'reload schema';
