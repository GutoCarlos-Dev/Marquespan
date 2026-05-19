-- Adiciona motorista aos registros de abastecimento externo.
-- Execute este SQL no Supabase antes de importar/cadastrar abastecimentos externos com motorista.

ALTER TABLE public.abastecimento_externo
ADD COLUMN IF NOT EXISTS motorista text;

CREATE INDEX IF NOT EXISTS idx_abastecimento_externo_motorista
ON public.abastecimento_externo (motorista);
