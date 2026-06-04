-- ═══════════════════════════════════════════════════════════════════
--  Função RPC: get_escala_semana
--  Permite que qualquer usuário AUTENTICADO leia a escala de uma
--  filial/semana específica sem precisar da permissão escala.html.
--  Usada pelo módulo Controle de Jornada.
--
--  Execute no SQL Editor do Supabase:
--  https://hlzcycvlcuhgnnjkmslt.supabase.co
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_escala_semana(
  p_semana text,
  p_filial text
)
RETURNS TABLE (
  data_escala date,
  placa       text,
  rota        text,
  motorista   text,
  auxiliar    text,
  status      text,
  tipo_escala text
)
LANGUAGE plpgsql
SECURITY DEFINER          -- executa com privilégios do owner, bypassa RLS
SET search_path = public
AS $$
BEGIN
  -- Garante que só usuários autenticados do sistema podem chamar
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado.';
  END IF;

  RETURN QUERY
  SELECT
    e.data_escala::date,
    e.placa::text,
    e.rota::text,
    e.motorista::text,
    e.auxiliar::text,
    e.status::text,
    e.tipo_escala::text
  FROM public.escala e
  WHERE e.semana_nome = p_semana
    AND e.filial      = p_filial
  ORDER BY e.data_escala ASC, e.placa ASC
  LIMIT 2000;
END;
$$;

-- Permite que usuários autenticados chamem esta função
GRANT EXECUTE ON FUNCTION public.get_escala_semana(text, text) TO authenticated;
