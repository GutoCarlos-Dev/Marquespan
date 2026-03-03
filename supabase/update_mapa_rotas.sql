-- Adiciona a coluna supervisor na tabela mapa_rotas
ALTER TABLE public.mapa_rotas 
ADD COLUMN IF NOT EXISTS supervisor text;