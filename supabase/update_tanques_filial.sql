-- Adiciona a coluna 'filial' na tabela de tanques
ALTER TABLE public.tanques ADD COLUMN IF NOT EXISTS filial text;