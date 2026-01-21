-- Script para adicionar a coluna oficina_id na tabela coletas_manutencao_checklist
-- Execute este script no SQL Editor do Supabase

-- 1. Adiciona a coluna como chave estrangeira (Foreign Key) para a tabela oficinas
ALTER TABLE public.coletas_manutencao_checklist
ADD COLUMN IF NOT EXISTS oficina_id bigint REFERENCES public.oficinas(id);

-- 2. Cria um índice para melhorar a performance das buscas e relatórios por oficina
CREATE INDEX IF NOT EXISTS idx_coletas_checklist_oficina_id 
ON public.coletas_manutencao_checklist(oficina_id);