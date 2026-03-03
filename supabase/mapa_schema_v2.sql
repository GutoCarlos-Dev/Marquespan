-- Arquivo: supabase/mapa_schema_v2.sql
-- Objetivo: Criar tabelas isoladas para o módulo de Mapa para evitar conflitos com tabelas existentes.

-- Tabela para armazenar as rotas do mapa
CREATE TABLE IF NOT EXISTS public.mapa_rotas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_rota text NOT NULL,
  cor_rgb text NULL DEFAULT 'rgb(51, 136, 255)',
  endereco text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mapa_rotas_pkey PRIMARY KEY (id)
);

-- Habilita RLS
ALTER TABLE public.mapa_rotas ENABLE ROW LEVEL SECURITY;

-- Cria policy se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Acesso total mapa_rotas' AND polrelid = 'public.mapa_rotas'::regclass) THEN
        CREATE POLICY "Acesso total mapa_rotas" ON public.mapa_rotas FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;

-- Tabela para armazenar os pontos do mapa
CREATE TABLE IF NOT EXISTS public.mapa_pontos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL,
  endereco text NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  observacao text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mapa_pontos_pkey PRIMARY KEY (id),
  CONSTRAINT mapa_pontos_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES mapa_rotas(id) ON DELETE CASCADE
);

ALTER TABLE public.mapa_pontos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Acesso total mapa_pontos' AND polrelid = 'public.mapa_pontos'::regclass) THEN
        CREATE POLICY "Acesso total mapa_pontos" ON public.mapa_pontos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;