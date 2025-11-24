-- Script SQL para adicionar a coluna "codigo_marca_fogo" à tabela "pneus" no Supabase
-- Execute este script no SQL Editor do Supabase para atualizar a tabela

-- Adicionar coluna para código de marca de fogo
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS codigo_marca_fogo TEXT UNIQUE;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_pneus_codigo_marca_fogo ON pneus(codigo_marca_fogo);

-- Verificar se a coluna foi adicionada
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pneus' AND column_name = 'codigo_marca_fogo';
