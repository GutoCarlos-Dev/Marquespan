-- Atualiza o campo 'tipo' para 'CAMINHAO' onde estiver nulo ou vazio na tabela veiculos
UPDATE public.veiculos
SET tipo = 'CAMINHAO'
WHERE tipo IS NULL OR tipo = '';