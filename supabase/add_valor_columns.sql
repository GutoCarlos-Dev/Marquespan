-- Adiciona a coluna 'valor_total' na tabela 'coletas_manutencao' para armazenar a soma
ALTER TABLE coletas_manutencao ADD COLUMN IF NOT EXISTS valor_total NUMERIC(15, 2) DEFAULT 0.00;

-- Adiciona a coluna 'valor' na tabela 'coletas_manutencao_checklist' para armazenar o valor individual do item
ALTER TABLE coletas_manutencao_checklist ADD COLUMN IF NOT EXISTS valor NUMERIC(15, 2) DEFAULT 0.00;