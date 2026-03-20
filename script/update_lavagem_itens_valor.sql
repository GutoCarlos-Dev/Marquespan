-- Script para adicionar a coluna 'valor' na tabela 'lavagem_itens'
-- Execute este comando no "SQL Editor" do seu painel Supabase

ALTER TABLE public.lavagem_itens 
ADD COLUMN IF NOT EXISTS valor numeric(10,2);

-- Comentário: O tipo numeric(10,2) é ideal para valores monetários, 
-- permitindo até 10 dígitos no total, sendo 2 casas decimais.