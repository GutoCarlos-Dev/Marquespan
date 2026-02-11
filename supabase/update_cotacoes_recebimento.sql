-- Adiciona colunas para rastrear o recebimento na tabela de cotações
ALTER TABLE public.cotacoes
ADD COLUMN IF NOT EXISTS data_recebimento timestamp with time zone,
ADD COLUMN IF NOT EXISTS usuario_recebimento text;

-- Comentário: As colunas aceitam nulo pois o registro nasce sem recebimento.