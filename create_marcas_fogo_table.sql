-- Script SQL para criar tabela de marcas de fogo por lançamento
-- Execute este script no SQL Editor do Supabase

-- Criar tabela para armazenar códigos de marca de fogo por lançamento
CREATE TABLE IF NOT EXISTS marcas_fogo_lancamento (
  id SERIAL PRIMARY KEY,
  lancamento_id INTEGER REFERENCES pneus(id) ON DELETE CASCADE,
  codigo_marca_fogo TEXT NOT NULL UNIQUE,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usuario_criacao TEXT
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_marcas_fogo_lancamento_lancamento_id ON marcas_fogo_lancamento(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_marcas_fogo_lancamento_codigo ON marcas_fogo_lancamento(codigo_marca_fogo);

-- Verificar se a tabela foi criada
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'marcas_fogo_lancamento' AND table_schema = 'public';
