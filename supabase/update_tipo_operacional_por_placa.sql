-- Atualiza o campo 'tipo' para 'OPERACIONAL' para uma lista específica de placas.
-- Adicione ou remova placas da lista dentro dos parênteses conforme necessário.

UPDATE public.veiculos
SET tipo = 'OPERACIONAL'
WHERE placa IN (
    'IWD0921',
    'IWE4698'
    -- Adicione mais placas aqui, separadas por vírgula. Ex: 'ABC1234',
);