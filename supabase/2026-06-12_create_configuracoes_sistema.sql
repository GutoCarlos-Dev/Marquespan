-- Configuracao global de expiracao de sessao por inatividade.
-- Execute este arquivo no SQL Editor do Supabase.

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

alter table public.usuarios
add column if not exists tempo_inatividade_minutos integer null
check (tempo_inatividade_minutos is null or (
  tempo_inatividade_minutos >= 0
  and tempo_inatividade_minutos <= 1440
));

create table if not exists public.configuracoes_sistema (
  id text primary key,
  tempo_inatividade_minutos integer not null default 30
    check (tempo_inatividade_minutos >= 0 and tempo_inatividade_minutos <= 1440),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid null default auth.uid()
);

insert into public.configuracoes_sistema (id, tempo_inatividade_minutos)
values ('global', 30)
on conflict (id) do nothing;

alter table public.configuracoes_sistema enable row level security;

drop policy if exists configuracoes_sistema_select_authenticated
on public.configuracoes_sistema;
create policy configuracoes_sistema_select_authenticated
on public.configuracoes_sistema
for select
to authenticated
using (true);

drop policy if exists configuracoes_sistema_insert_admin
on public.configuracoes_sistema;
create policy configuracoes_sistema_insert_admin
on public.configuracoes_sistema
for insert
to authenticated
with check (public.usuario_e_administrador());

drop policy if exists configuracoes_sistema_update_admin
on public.configuracoes_sistema;
create policy configuracoes_sistema_update_admin
on public.configuracoes_sistema
for update
to authenticated
using (public.usuario_e_administrador())
with check (public.usuario_e_administrador());

revoke all on table public.configuracoes_sistema from anon;
grant select on table public.configuracoes_sistema to authenticated;
grant insert, update on table public.configuracoes_sistema to authenticated;

-- Atualiza imediatamente o cache de estrutura usado pela API REST.
notify pgrst, 'reload schema';
