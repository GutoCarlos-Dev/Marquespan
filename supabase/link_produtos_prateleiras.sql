-- Script para vincular a tabela produtos com a tabela prateleiras
-- Execute este script no SQL Editor do seu projeto

ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS prateleira_id BIGINT REFERENCES public.prateleiras(id) ON DELETE SET NULL;