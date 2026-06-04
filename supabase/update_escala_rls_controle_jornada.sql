-- ═══════════════════════════════════════════════════════════════════
--  Permite que usuários com acesso a controle-de-jornada.html
--  também possam LER a tabela escala (somente sua filial).
--
--  Executa no SQL Editor do Supabase:
--  https://hlzcycvlcuhgnnjkmslt.supabase.co
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.usuario_pode_ver_filial_escala(p_filial text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    LEFT JOIN public.nivel_permissoes np
      ON lower(np.nivel) = lower(u.nivel)
    WHERE u.auth_user_id = auth.uid()
      AND coalesce(u.status, 'ATIVO') <> 'INATIVO'
      AND (
        lower(u.nivel) = 'administrador'
        OR 'escala.html'               = any(coalesce(np.paginas_permitidas, array[]::text[]))
        OR 'controle-de-jornada.html'  = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
      AND (
        lower(u.nivel) IN ('administrador', 'gerencia')
        OR coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;
