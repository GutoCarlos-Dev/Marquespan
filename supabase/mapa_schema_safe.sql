-- Arquivo: supabase/mapa_schema_safe.sql
-- Objetivo: Criar as tabelas para o novo módulo de Mapa de Rotas, garantindo que o script possa ser executado múltiplas vezes sem erros.

-- Tabela para armazenar as rotas
CREATE TABLE IF NOT EXISTS public.rotas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_rota text NOT NULL,
  cor_rgb text NULL DEFAULT 'rgb(51, 136, 255)', -- Cor padrão azul
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rotas_pkey PRIMARY KEY (id)
);

-- Habilita RLS (é seguro executar múltiplas vezes)
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;

-- Cria a policy para 'rotas' apenas se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Permitir acesso total para usuários autenticados' AND polrelid = 'public.rotas'::regclass) THEN
        CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.rotas FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;


-- Tabela para armazenar os pontos (endereços/marcadores) de cada rota
CREATE TABLE IF NOT EXISTS public.pontos_rota (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL,
  endereco text NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  observacao text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pontos_rota_pkey PRIMARY KEY (id)
);

-- Habilita RLS para 'pontos_rota'
ALTER TABLE public.pontos_rota ENABLE ROW LEVEL SECURITY;

-- Cria a policy para 'pontos_rota' apenas se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Permitir acesso total para usuários autenticados' AND polrelid = 'public.pontos_rota'::regclass) THEN
        CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.pontos_rota FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;