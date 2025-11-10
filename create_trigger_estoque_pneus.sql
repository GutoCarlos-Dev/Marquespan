-- Script SQL para criar trigger que mantém a tabela estoque_pneus atualizada
-- Execute este script no SQL Editor do Supabase

-- Criar função para atualizar estoque de pneus
CREATE OR REPLACE FUNCTION atualizar_estoque_pneus()
RETURNS TRIGGER AS $$
BEGIN
  -- Para INSERT ou UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Verificar se já existe registro na tabela estoque_pneus
    IF EXISTS (
      SELECT 1 FROM estoque_pneus
      WHERE placa = NEW.placa
        AND marca = NEW.marca
        AND modelo = NEW.modelo
        AND vida = NEW.vida
        AND tipo = NEW.tipo
    ) THEN
      -- Atualizar quantidade existente
      UPDATE estoque_pneus
      SET quantidade = quantidade + CASE
        WHEN NEW.status = 'ENTRADA' THEN NEW.quantidade
        WHEN NEW.status = 'SAIDA' THEN -NEW.quantidade
        ELSE 0
      END
      WHERE placa = NEW.placa
        AND marca = NEW.marca
        AND modelo = NEW.modelo
        AND vida = NEW.vida
        AND tipo = NEW.tipo;
    ELSE
      -- Inserir novo registro se for entrada
      IF NEW.status = 'ENTRADA' THEN
        INSERT INTO estoque_pneus (placa, marca, modelo, vida, tipo, quantidade)
        VALUES (NEW.placa, NEW.marca, NEW.modelo, NEW.vida, NEW.tipo, NEW.quantidade);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Para DELETE
  IF TG_OP = 'DELETE' THEN
    -- Reverter a movimentação
    UPDATE estoque_pneus
    SET quantidade = quantidade - CASE
      WHEN OLD.status = 'ENTRADA' THEN OLD.quantidade
      WHEN OLD.status = 'SAIDA' THEN -OLD.quantidade
      ELSE 0
    END
    WHERE placa = OLD.placa
      AND marca = OLD.marca
      AND modelo = OLD.modelo
      AND vida = OLD.vida
      AND tipo = OLD.tipo;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger na tabela pneus
DROP TRIGGER IF EXISTS trigger_atualizar_estoque_pneus ON pneus;
CREATE TRIGGER trigger_atualizar_estoque_pneus
  AFTER INSERT OR UPDATE OR DELETE ON pneus
  FOR EACH ROW EXECUTE FUNCTION atualizar_estoque_pneus();

-- Verificar se o trigger foi criado
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'pneus' AND trigger_name = 'trigger_atualizar_estoque_pneus';
