-- Adiciona a coluna 'endereco' na tabela 'rotas'
ALTER TABLE public.rotas 
ADD COLUMN IF NOT EXISTS endereco text;

-- Execute este script no SQL Editor do Supabase para corrigir o erro 400.