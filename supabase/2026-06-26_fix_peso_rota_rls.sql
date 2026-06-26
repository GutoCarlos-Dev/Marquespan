-- Corrige RLS da tabela peso_rota.
-- Execute este arquivo inteiro no SQL Editor do Supabase.
--
-- O erro "new row violates row-level security policy" acontece quando o
-- WITH CHECK da policy de insert/update retorna falso. Esta versao:
-- - usa a permissao da pagina peso-rota.html;
-- - aceita equivalencia entre sigla e nome da filial, ex: SP e Sao Paulo;
-- - permite escrita para usuarios com acesso a pagina na propria filial;
-- - trata usuarios sem filial no cadastro como acesso total;
-- - mantem administrador e gerencia com acesso a todas as filiais.

create or replace function public.peso_rota_normalizar_nivel(p_nivel text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(lower(trim(coalesce(p_nivel, ''))), '[^a-z0-9]+', '_', 'g'), '_');
$$;

create or replace function public.peso_rota_filial_equivalente(p_filial_registro text, p_filial_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with valores as (
    select
      lower(trim(coalesce(p_filial_registro, ''))) as filial_registro,
      lower(trim(coalesce(p_filial_usuario, ''))) as filial_usuario
  )
  select exists (
    select 1
    from valores v
    where v.filial_registro <> ''
      and v.filial_usuario <> ''
      and (
        v.filial_registro = v.filial_usuario
        or exists (
          select 1
          from public.filiais f
          where v.filial_registro in (
              lower(trim(coalesce(f.sigla, ''))),
              lower(trim(coalesce(f.nome, '')))
            )
            and v.filial_usuario in (
              lower(trim(coalesce(f.sigla, ''))),
              lower(trim(coalesce(f.nome, '')))
            )
        )
      )
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
        public.peso_rota_normalizar_nivel(u.nivel) = 'administrador'
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
    where u.auth_user_id::text = auth.uid()::text
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and public.usuario_pode_acessar_pagina('peso-rota.html')
      and (
        public.peso_rota_normalizar_nivel(u.nivel) in ('administrador', 'gerencia')
        or coalesce(trim(u.filial), '') = ''
        or public.peso_rota_filial_equivalente(p_filial, u.filial)
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
    where u.auth_user_id::text = auth.uid()::text
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and public.usuario_pode_acessar_pagina('peso-rota.html')
      and (
        public.peso_rota_normalizar_nivel(u.nivel) in ('administrador', 'gerencia')
        or coalesce(trim(u.filial), '') = ''
        or public.peso_rota_filial_equivalente(p_filial, u.filial)
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
drop policy if exists peso_rota_select_permitidos on public.peso_rota;
drop policy if exists peso_rota_insert_permitidos on public.peso_rota;
drop policy if exists peso_rota_update_permitidos on public.peso_rota;
drop policy if exists peso_rota_delete_permitidos on public.peso_rota;
drop policy if exists peso_rota_insert_pagina_filial on public.peso_rota;
drop policy if exists peso_rota_update_pagina_filial on public.peso_rota;
drop policy if exists peso_rota_delete_pagina_filial on public.peso_rota;

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

notify pgrst, 'reload schema';
