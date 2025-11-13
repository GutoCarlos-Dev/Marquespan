-- Script SQL para atualizar o trigger de estoque de pneus para gerar código de marca de fogo
-- Execute este script no SQL Editor do Supabase após adicionar a coluna codigo_marca_fogo

-- Criar função para gerar próximo código de marca de fogo
CREATE OR REPLACE FUNCTION gerar_codigo_marca_fogo()
RETURNS TEXT AS $$
DECLARE
  ultimo_codigo TEXT;
  proximo_numero INTEGER;
BEGIN
  -- Buscar o último código de marca de fogo
  SELECT codigo_marca_fogo INTO ultimo_codigo
  FROM pneus
  WHERE codigo_marca_fogo IS NOT NULL
  ORDER BY codigo_marca_fogo DESC
  LIMIT 1;

  -- Se não há códigos, começar com 000001
  IF ultimo_codigo IS NULL THEN
    RETURN '000001';
  END IF;

  -- Extrair o número e incrementar
  proximo_numero := CAST(ultimo_codigo AS INTEGER) + 1;

  -- Retornar com zeros à esquerda (6 dígitos)
  RETURN LPAD(proximo_numero::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Atualizar função de trigger para apenas atualizar estoque (sem geração de códigos)
CREATE OR REPLACE FUNCTION atualizar_estoque_pneus()
RETURNS TRIGGER AS $$
BEGIN
  -- Para INSERT
  IF TG_OP = 'INSERT' THEN
    -- Verificar se já existe registro na tabela estoque_pneus
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

  -- Para UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Atualizar estoque baseado na diferença
    UPDATE estoque_pneus
    SET quantidade = quantidade +
      CASE WHEN NEW.status = 'ENTRADA' THEN NEW.quantidade ELSE -NEW.quantidade END -
      CASE WHEN OLD.status = 'ENTRADA' THEN OLD.quantidade ELSE -OLD.quantidade END
    WHERE marca = NEW.marca
      AND modelo = NEW.modelo
      AND vida = NEW.vida
      AND tipo = NEW.tipo;

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
    WHERE marca = OLD.marca
      AND modelo = OLD.modelo
      AND vida = OLD.vida
      AND tipo = OLD.tipo;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recriar trigger na tabela pneus
DROP TRIGGER IF EXISTS trigger_atualizar_estoque_pneus ON pneus;
CREATE TRIGGER trigger_atualizar_estoque_pneus
  BEFORE INSERT OR UPDATE OR DELETE ON pneus
  FOR EACH ROW EXECUTE FUNCTION atualizar_estoque_pneus();

-- Remover trigger AFTER INSERT problemático
DROP TRIGGER IF EXISTS trigger_gerar_codigos_after_insert ON pneus;
DROP FUNCTION IF EXISTS gerar_codigos_marca_fogo_after_insert();

-- Verificar se o trigger foi criado
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'pneus' AND trigger_name = 'trigger_atualizar_estoque_pneus';
