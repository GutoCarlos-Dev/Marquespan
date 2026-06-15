-- Permite que usuarios com acesso ao monitoramento da frota consultem
-- os dados da escala visiveis para sua filial.

create or replace function public.usuario_pode_ver_filial_escala(p_filial text)
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
        or 'escala.html' = any(coalesce(np.paginas_permitidas, array[]::text[]))
        or 'controle-de-jornada.html' = any(coalesce(np.paginas_permitidas, array[]::text[]))
        or 'monitoramento-frota.html' = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
      and (
        lower(u.nivel) in ('administrador', 'gerencia')
        or coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;
