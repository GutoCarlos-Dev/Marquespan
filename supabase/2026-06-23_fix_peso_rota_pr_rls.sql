-- Corrige permissao de escrita do peso-rota para usuarios com acesso a pagina.
-- Execute no SQL Editor do Supabase.

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
        public.peso_rota_normalizar_nivel(u.nivel) in ('administrador', 'gerencia')
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
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and public.usuario_pode_acessar_pagina('peso-rota.html')
      and (
        public.peso_rota_normalizar_nivel(u.nivel) in ('administrador', 'gerencia')
        or public.peso_rota_filial_equivalente(p_filial, u.filial)
      )
  );
$$;

notify pgrst, 'reload schema';
