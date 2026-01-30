-- Atualização para suportar a troca de Motorista por Rota na saída de combustível

-- Adiciona a coluna 'rota' na tabela 'saidas_combustivel'
ALTER TABLE public.saidas_combustivel 
ADD COLUMN IF NOT EXISTS rota text;