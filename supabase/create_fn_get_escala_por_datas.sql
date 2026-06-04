-- ═══════════════════════════════════════════════════════════════════
--  Função RPC: get_escala_por_datas
--  Retorna linhas da escala para um array de datas específicas e
--  uma filial. Usada pelo Controle de Jornada para cruzar as
--  datas exatas do arquivo CONTROLE com a escala do banco.
--
--  Execute no SQL Editor do Supabase:
--  https://hlzcycvlcuhgnnjkmslt.supabase.co
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_escala_por_datas(
  p_datas  date[],
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
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  WHERE e.data_escala = ANY(p_datas)
    AND e.filial      = p_filial
  ORDER BY e.data_escala ASC, e.placa ASC
  LIMIT 5000;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_escala_por_datas(date[], text) TO authenticated;
