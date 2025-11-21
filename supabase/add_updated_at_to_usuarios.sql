-- Script para adicionar coluna updated_at na tabela usuarios
-- e criar trigger para atualizar automaticamente

BEGIN;

-- Adicionar coluna updated_at se não existir
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Criar função para trigger se não existir
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE t.tgname = 'tg_update_timestamp_usuarios' AND c.relname = 'usuarios'
  ) THEN
    CREATE OR REPLACE FUNCTION fn_update_timestamp_usuarios()
    RETURNS trigger AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER tg_update_timestamp_usuarios
      BEFORE UPDATE ON public.usuarios
      FOR EACH ROW
      EXECUTE FUNCTION fn_update_timestamp_usuarios();
  END IF;
END$do$;

COMMIT;

-- Observações:
-- Execute este script no SQL Editor do Supabase para adicionar a coluna updated_at e o trigger na tabela usuarios.
-- Isso resolverá o erro "record \"new\" has no field \"updated_at\"".
