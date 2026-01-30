-- Adiciona a coluna para registrar o usuário que fez a leitura da bomba.
ALTER TABLE public.leituras_bomba
ADD COLUMN IF NOT EXISTS usuario_cadastro TEXT;