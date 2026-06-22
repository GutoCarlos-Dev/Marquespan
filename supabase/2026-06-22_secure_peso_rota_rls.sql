-- Protecao de acesso para peso-rota.html e tabela peso_rota.
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

create or replace function public.usuario_pode_ver_filial_peso_rota(p_filial text)
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
      and public.usuario_pode_acessar_pagina('peso-rota.html')
      and (
        lower(u.nivel) in ('administrador', 'gerencia')
        or coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;

create or replace function public.usuario_pode_editar_filial_peso_rota(p_filial text)
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
      and public.usuario_pode_acessar_pagina('peso-rota.html')
      and lower(u.nivel) in ('administrador', 'gerencia', 'balanca', 'equipe_noturno', 'adm_logistica', 'logistica')
      and (
        lower(u.nivel) in ('administrador', 'gerencia')
        or coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;

revoke all on table public.peso_rota from anon;
grant select, insert, update, delete on table public.peso_rota to authenticated;

alter table public.peso_rota enable row level security;

drop policy if exists "Permitir leitura peso rota" on public.peso_rota;
drop policy if exists "Permitir inserir peso rota" on public.peso_rota;
drop policy if exists "Permitir atualizar peso rota" on public.peso_rota;
drop policy if exists "Permitir excluir peso rota" on public.peso_rota;
drop policy if exists peso_rota_select_filial on public.peso_rota;
drop policy if exists peso_rota_insert_gerencia on public.peso_rota;
drop policy if exists peso_rota_update_gerencia on public.peso_rota;
drop policy if exists peso_rota_delete_gerencia on public.peso_rota;

create policy peso_rota_select_permitidos
on public.peso_rota
for select
to authenticated
using ((select public.usuario_pode_ver_filial_peso_rota(filial)));

create policy peso_rota_insert_permitidos
on public.peso_rota
for insert
to authenticated
with check ((select public.usuario_pode_editar_filial_peso_rota(filial)));

create policy peso_rota_update_permitidos
on public.peso_rota
for update
to authenticated
using ((select public.usuario_pode_editar_filial_peso_rota(filial)))
with check ((select public.usuario_pode_editar_filial_peso_rota(filial)));

create policy peso_rota_delete_permitidos
on public.peso_rota
for delete
to authenticated
using ((select public.usuario_pode_editar_filial_peso_rota(filial)));

create index if not exists idx_peso_rota_filial_dia_rota
on public.peso_rota (filial, dia_retorno, rota);

create index if not exists idx_peso_rota_semana_ano
on public.peso_rota (semana_ano);

alter table public.escala enable row level security;
grant select on table public.escala to authenticated;

drop policy if exists escala_select_peso_rota on public.escala;
create policy escala_select_peso_rota
on public.escala
for select
to authenticated
using ((select public.usuario_pode_ver_filial_peso_rota(filial)));

notify pgrst, 'reload schema';
