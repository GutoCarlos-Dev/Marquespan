-- ==============================================================
-- Script: Atualização do campo tipo_motor em Veículos
-- Aplica-se somente a caminhões com fabricante VOLVO ou M.BENZ
-- Regra: anofab >= 2023 → EURO 6 | anofab < 2023 → EURO 5
-- ==============================================================

-- 1. Adicionar coluna tipo_motor (se ainda não existir)
ALTER TABLE veiculos
ADD COLUMN IF NOT EXISTS tipo_motor VARCHAR(20);

-- 2. Atualizar tipo_motor com base no ano de fabricação
UPDATE veiculos
SET tipo_motor = CASE
    WHEN anofab >= 2023 THEN 'EURO 6'
    ELSE 'EURO 5'
END
WHERE
    UPPER(TRIM(COALESCE(fabricante, marca))) IN ('VOLVO', 'M.BENZ')
    AND tipo IN ('CAMINHÃO 3/4', 'BITREM', 'BITRUCK', 'LS', 'TRUCK')
    AND anofab IS NOT NULL;

-- 3. Verificação: revisar registros atualizados
SELECT placa, fabricante, tipo, anofab, tipo_motor
FROM veiculos
WHERE
    UPPER(TRIM(COALESCE(fabricante, marca))) IN ('VOLVO', 'M.BENZ')
    AND tipo IN ('CAMINHÃO 3/4', 'BITREM', 'BITRUCK', 'LS', 'TRUCK')
    AND anofab IS NOT NULL
ORDER BY placa;
