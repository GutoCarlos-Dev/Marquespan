-- Script para adicionar a coluna 'filial' na tabela 'titulo_manutencao'
-- Execute este comando no Editor SQL do Supabase

ALTER TABLE public.titulo_manutencao 
ADD COLUMN IF NOT EXISTS filial text;

-- Criar um índice para otimizar buscas e filtros por filial
CREATE INDEX IF NOT EXISTS idx_titulo_manutencao_filial ON public.titulo_manutencao(filial);