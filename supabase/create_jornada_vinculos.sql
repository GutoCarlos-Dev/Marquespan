-- ═══════════════════════════════════════════════════════════════════
--  Tabela: jornada_vinculos
--  Armazena os vínculos entre nomes do Roteiro/Escala e os nomes
--  completos do sistema de Ponto (Secullum).
--  Permite que o Controle de Jornada reconheça automaticamente os
--  nomes sem precisar revincular a cada execução.
--
--  Execute no SQL Editor do Supabase:
--  https://hlzcycvlcuhgnnjkmslt.supabase.co
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.jornada_vinculos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_roteiro text        NOT NULL,        -- nome curto (escala/roteiro), UPPER CASE
  nome_ponto   text        NOT NULL,        -- nome completo (ponto/Secullum)
  tipo         text        NOT NULL CHECK (tipo IN ('MOTORISTA','AUXILIAR')),
  filial       text        NOT NULL,
  criado_por   uuid,                        -- auth.users.id
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome_roteiro, filial, tipo)       -- evita duplicatas
);

CREATE INDEX IF NOT EXISTS idx_jornada_vinculos_filial ON public.jornada_vinculos (filial);

-- RLS: só usuários autenticados acessam
ALTER TABLE public.jornada_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jornada_vinculos_auth" ON public.jornada_vinculos;
CREATE POLICY "jornada_vinculos_auth"
  ON public.jornada_vinculos
  FOR ALL
  TO authenticated
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Função RPC: busca todos os vínculos de uma filial ──────────────
CREATE OR REPLACE FUNCTION public.get_jornada_vinculos(p_filial text)
RETURNS TABLE (
  id           uuid,
  nome_roteiro text,
  nome_ponto   text,
  tipo         text,
  filial       text,
  criado_por   uuid,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  RETURN QUERY
  SELECT v.id, v.nome_roteiro, v.nome_ponto, v.tipo, v.filial, v.criado_por, v.created_at
  FROM public.jornada_vinculos v
  WHERE v.filial = p_filial
  ORDER BY v.tipo, v.nome_roteiro;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_jornada_vinculos(text) TO authenticated;

-- ── Trigger updated_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_jornada_vinculos_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.jornada_vinculos;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.jornada_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.trg_jornada_vinculos_updated();
