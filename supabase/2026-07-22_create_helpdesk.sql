-- HelpDesk: chamados para o Setor de Tecnologia + vídeos de ajuda do sistema.
-- Execute no SQL Editor do Supabase.
--
-- Regras:
-- - Qualquer usuário autenticado pode abrir chamado e ver apenas os próprios chamados.
-- - Usuários com nível 'administrador' ou 'tecnologia' veem e respondem TODOS os chamados.
-- - Vídeos de ajuda: visíveis a todos quando não vinculados a nenhuma página, ou apenas
--   para quem tem acesso à página vinculada (reaproveita nivel_permissoes.paginas_permitidas).
-- - Cadastro/edição/remoção de vídeos: apenas nível 'administrador'.

create extension if not exists "pgcrypto";

-- ── Tabelas ──────────────────────────────────────────────────────────────

create table if not exists public.helpdesk_chamados (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  usuario_nome text not null,
  usuario_nivel text,
  filial text,
  categoria text not null default 'Outro'
    check (categoria in ('Hardware','Software','Rede/Internet','Sistema Marquespan','Acesso/Senha','Outro')),
  prioridade text not null default 'media'
    check (prioridade in ('baixa','media','alta')),
  assunto text not null,
  descricao text not null,
  status text not null default 'aberto'
    check (status in ('aberto','em_andamento','concluido')),
  resposta text,
  respondido_por text,
  respondido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_helpdesk_chamados_usuario_id on public.helpdesk_chamados (usuario_id);
create index if not exists idx_helpdesk_chamados_status on public.helpdesk_chamados (status);
create index if not exists idx_helpdesk_chamados_created_at on public.helpdesk_chamados (created_at desc);

create or replace function public.update_helpdesk_chamados_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_helpdesk_chamados_updated_at on public.helpdesk_chamados;
create trigger trg_helpdesk_chamados_updated_at
before update on public.helpdesk_chamados
for each row
execute function public.update_helpdesk_chamados_updated_at();

create table if not exists public.helpdesk_videos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  url text not null,
  pagina_vinculada text,
  categoria text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_helpdesk_videos_pagina on public.helpdesk_videos (pagina_vinculada);

create or replace function public.update_helpdesk_videos_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_helpdesk_videos_updated_at on public.helpdesk_videos;
create trigger trg_helpdesk_videos_updated_at
before update on public.helpdesk_videos
for each row
execute function public.update_helpdesk_videos_updated_at();

-- ── Funções auxiliares de permissão ──────────────────────────────────────

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

create or replace function public.usuario_e_administrador_ou_tecnologia()
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
      and lower(u.nivel) in ('administrador', 'tecnologia')
  );
$$;

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
    where u.auth_user_id::text = auth.uid()::text
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and (
        lower(u.nivel) = 'administrador'
        or p_pagina = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.helpdesk_chamados enable row level security;
alter table public.helpdesk_videos enable row level security;

revoke all on table public.helpdesk_chamados from anon;
revoke all on table public.helpdesk_videos from anon;
grant select, insert, update, delete on table public.helpdesk_chamados to authenticated;
grant select, insert, update, delete on table public.helpdesk_videos to authenticated;

drop policy if exists helpdesk_chamados_select on public.helpdesk_chamados;
create policy helpdesk_chamados_select
on public.helpdesk_chamados
for select
to authenticated
using (
  usuario_id = (select u.id::text from public.usuarios u where u.auth_user_id::text = auth.uid()::text)
  or (select public.usuario_e_administrador_ou_tecnologia())
);

drop policy if exists helpdesk_chamados_insert on public.helpdesk_chamados;
create policy helpdesk_chamados_insert
on public.helpdesk_chamados
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists helpdesk_chamados_update on public.helpdesk_chamados;
create policy helpdesk_chamados_update
on public.helpdesk_chamados
for update
to authenticated
using ((select public.usuario_e_administrador_ou_tecnologia()))
with check ((select public.usuario_e_administrador_ou_tecnologia()));

drop policy if exists helpdesk_chamados_delete on public.helpdesk_chamados;
create policy helpdesk_chamados_delete
on public.helpdesk_chamados
for delete
to authenticated
using ((select public.usuario_e_administrador()));

drop policy if exists helpdesk_videos_select on public.helpdesk_videos;
create policy helpdesk_videos_select
on public.helpdesk_videos
for select
to authenticated
using (
  (select public.usuario_e_administrador_ou_tecnologia())
  or (
    ativo = true
    and (
      pagina_vinculada is null
      or pagina_vinculada = ''
      or (select public.usuario_pode_acessar_pagina(pagina_vinculada))
    )
  )
);

drop policy if exists helpdesk_videos_insert on public.helpdesk_videos;
create policy helpdesk_videos_insert
on public.helpdesk_videos
for insert
to authenticated
with check ((select public.usuario_e_administrador()));

drop policy if exists helpdesk_videos_update on public.helpdesk_videos;
create policy helpdesk_videos_update
on public.helpdesk_videos
for update
to authenticated
using ((select public.usuario_e_administrador()))
with check ((select public.usuario_e_administrador()));

drop policy if exists helpdesk_videos_delete on public.helpdesk_videos;
create policy helpdesk_videos_delete
on public.helpdesk_videos
for delete
to authenticated
using ((select public.usuario_e_administrador()));

notify pgrst, 'reload schema';
