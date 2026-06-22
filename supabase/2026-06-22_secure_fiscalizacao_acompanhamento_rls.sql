-- Protecao de acesso para fiscalizacao-acompanhamento.html/mobile.
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

create or replace function public.usuario_pode_acessar_fiscalizacao_acompanhamento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('fiscalizacao-acompanhamento.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-acompanhamento-mobile.html');
$$;

create or replace function public.usuario_pode_excluir_fiscalizacao_acompanhamento()
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
      and public.usuario_pode_acessar_fiscalizacao_acompanhamento()
  );
$$;

create or replace function public.usuario_pode_ler_funcionarios_fiscalizacao_acompanhamento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_fiscalizacao_acompanhamento();
$$;

revoke all on table public.fiscalizacao_acompanhamentos from anon;
grant select, insert, update, delete on table public.fiscalizacao_acompanhamentos to authenticated;
grant select on table public.funcionario to authenticated;

alter table public.fiscalizacao_acompanhamentos enable row level security;
alter table public.funcionario enable row level security;

drop policy if exists "Permitir leitura fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
drop policy if exists "Permitir inserir fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
drop policy if exists "Permitir atualizar fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
drop policy if exists "Permitir excluir fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
drop policy if exists fiscalizacao_acompanhamentos_select_permitidos on public.fiscalizacao_acompanhamentos;
drop policy if exists fiscalizacao_acompanhamentos_insert_permitidos on public.fiscalizacao_acompanhamentos;
drop policy if exists fiscalizacao_acompanhamentos_update_permitidos on public.fiscalizacao_acompanhamentos;
drop policy if exists fiscalizacao_acompanhamentos_delete_permitidos on public.fiscalizacao_acompanhamentos;

create policy fiscalizacao_acompanhamentos_select_permitidos
on public.fiscalizacao_acompanhamentos
for select
to authenticated
using ((select public.usuario_pode_acessar_fiscalizacao_acompanhamento()));

create policy fiscalizacao_acompanhamentos_insert_permitidos
on public.fiscalizacao_acompanhamentos
for insert
to authenticated
with check ((select public.usuario_pode_acessar_fiscalizacao_acompanhamento()));

create policy fiscalizacao_acompanhamentos_update_permitidos
on public.fiscalizacao_acompanhamentos
for update
to authenticated
using ((select public.usuario_pode_acessar_fiscalizacao_acompanhamento()))
with check ((select public.usuario_pode_acessar_fiscalizacao_acompanhamento()));

create policy fiscalizacao_acompanhamentos_delete_permitidos
on public.fiscalizacao_acompanhamentos
for delete
to authenticated
using ((select public.usuario_pode_excluir_fiscalizacao_acompanhamento()));

drop policy if exists funcionario_select_fiscalizacao_acompanhamento on public.funcionario;
create policy funcionario_select_fiscalizacao_acompanhamento
on public.funcionario
for select
to authenticated
using ((select public.usuario_pode_ler_funcionarios_fiscalizacao_acompanhamento()));

create index if not exists idx_fiscalizacao_acompanhamentos_data
on public.fiscalizacao_acompanhamentos (data_acompanhamento);

create index if not exists idx_fiscalizacao_acompanhamentos_placa
on public.fiscalizacao_acompanhamentos (placa);

create index if not exists idx_fiscalizacao_acompanhamentos_motorista
on public.fiscalizacao_acompanhamentos (motorista);

create index if not exists idx_fiscalizacao_acompanhamentos_rota
on public.fiscalizacao_acompanhamentos (rota);

notify pgrst, 'reload schema';
