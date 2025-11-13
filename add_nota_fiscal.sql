-- Script SQL para adicionar a coluna "nota_fiscal" à tabela "pneus" no Supabase
-- Execute este script no SQL Editor do Supabase para atualizar a tabela

-- Adicionar coluna para nota fiscal
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS nota_fiscal TEXT;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_pneus_nota_fiscal ON pneus(nota_fiscal);

-- Verificar se a coluna foi adicionada
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pneus' AND column_name = 'nota_fiscal';
