-- Adiciona a coluna supervisor na tabela mapa_rotas
ALTER TABLE public.mapa_rotas 
ADD COLUMN IF NOT EXISTS supervisor text;

-- Adiciona o nome do cliente/parada nos pontos da rota
ALTER TABLE public.mapa_pontos
ADD COLUMN IF NOT EXISTS cliente_nome text;
