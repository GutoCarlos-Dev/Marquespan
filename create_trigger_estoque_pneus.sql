-- Script SQL para criar trigger que mantém a tabela estoque_pneus atualizada
-- Execute este script no SQL Editor do Supabase

-- Primeiro, remover a constraint única existente que está causando conflito
ALTER TABLE estoque_pneus DROP CONSTRAINT IF EXISTS estoque_pneus_marca_modelo_tipo_vida_key;

-- Remover constraint se já existir
ALTER TABLE estoque_pneus DROP CONSTRAINT IF EXISTS estoque_pneus_placa_marca_modelo_tipo_vida_key;

-- Criar nova constraint única SEM placa (apenas marca, modelo, tipo, vida)
ALTER TABLE estoque_pneus ADD CONSTRAINT estoque_pneus_marca_modelo_tipo_vida_key UNIQUE (marca, modelo, tipo, vida);

-- Criar função para atualizar estoque de pneus
CREATE OR REPLACE FUNCTION atualizar_estoque_pneus()
RETURNS TRIGGER AS $$
BEGIN
  -- Para INSERT ou UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Verificar se já existe registro na tabela estoque_pneus (SEM placa)
    IF EXISTS (
      SELECT 1 FROM estoque_pneus
      WHERE marca = NEW.marca
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
      WHERE marca = NEW.marca
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
    -- Reverter a movimentação (SEM placa)
    UPDATE estoque_pneus
    SET quantidade = quantidade - CASE
      WHEN OLD.status = 'ENTRADA' THEN OLD.quantidade
      WHEN OLD.status = 'SAIDA' THEN -OLD.quantidade
      ELSE 0
    END
    WHERE marca = OLD.marca
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
