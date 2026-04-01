-- Script para adicionar a coluna 'acao' e migrar o status 'Preliminar'

-- 1. Adicionar a coluna 'acao' na tabela tacografos
ALTER TABLE public.tacografos 
ADD COLUMN IF NOT EXISTS acao text;

-- 2. Migrar dados: registros com status 'Preliminar' movem para a nova coluna 'acao'
-- e o status é resetado para 'Em Dia'
UPDATE public.tacografos 
SET acao = 'Preliminar', 
    status = 'Em Dia'
WHERE status = 'Preliminar';

-- 3. Definir valor padrão para a nova coluna
ALTER TABLE public.tacografos 
ALTER COLUMN acao SET DEFAULT '';