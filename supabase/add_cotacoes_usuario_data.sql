-- Script para adicionar colunas necessárias na tabela `cotacoes`
-- Adiciona `data_cotacao` (timestamp with time zone) e `usuario` (texto)
-- Execute este script no SQL Editor do Supabase para habilitar gravação consistente de data/hora e usuário

BEGIN;

-- adiciona coluna para data/hora da cotação (quando criada/atualizada)
ALTER TABLE public.cotacoes
  ADD COLUMN IF NOT EXISTS data_cotacao timestamptz DEFAULT now();

-- adiciona coluna para registrar o usuário (email ou id) responsável pela ação
ALTER TABLE public.cotacoes
  ADD COLUMN IF NOT EXISTS usuario text;

-- adiciona coluna para nota fiscal (quando recebido)
ALTER TABLE public.cotacoes
  ADD COLUMN IF NOT EXISTS nota_fiscal text;

-- opcional: coluna para marcação de última atualização
ALTER TABLE public.cotacoes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- opcional: trigger para manter updated_at automaticamente
-- Observação: usamos delimitadores diferentes para evitar conflito de dollar-quoting aninhado
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE t.tgname = 'tg_update_timestamp' AND c.relname = 'cotacoes'
  ) THEN
    CREATE OR REPLACE FUNCTION fn_update_timestamp()
    RETURNS trigger AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER tg_update_timestamp
      BEFORE UPDATE ON public.cotacoes
      FOR EACH ROW
      EXECUTE FUNCTION fn_update_timestamp();
  END IF;
END$do$;

COMMIT;

-- Observações:
-- 1) O script adiciona `data_cotacao`, `usuario` e `updated_at` (opcional). Se preferir apenas as duas primeiras, remova os blocos relacionados a `updated_at`.
-- 2) Após aplicar, o front-end já modificado gravará `data_cotacao` e `usuario` quando criar/alterar status de cotações.
-- 3) Para produção, considere usar RLS/roles apropriados e gravar `usuario` a partir do ID autenticado em vez de confiar apenas em e-mail.
