-- Adiciona campos de ajuste financeiro aos orcamentos da cotacao.
-- valor_desconto subtrai do total final; valor_imposto soma ao total final.
ALTER TABLE public.cotacao_orcamentos
ADD COLUMN IF NOT EXISTS valor_desconto numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_imposto numeric(12,2) DEFAULT 0;

UPDATE public.cotacao_orcamentos
SET
  valor_desconto = COALESCE(valor_desconto, 0),
  valor_imposto = COALESCE(valor_imposto, 0);
