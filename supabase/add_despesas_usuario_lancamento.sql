-- Adiciona dados de auditoria para exibir usuario e data/hora do lancamento em despesas.
-- Execute no SQL Editor do Supabase se a tabela public.despesas ainda nao tiver estas colunas.

ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS usuario text;

ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
