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

-- Atualizar função de trigger para incluir geração de código de marca de fogo
CREATE OR REPLACE FUNCTION atualizar_estoque_pneus()
RETURNS TRIGGER AS $$
DECLARE
  novo_codigo TEXT;
  i INTEGER;
BEGIN
  -- Para INSERT
  IF TG_OP = 'INSERT' THEN
    -- Gerar códigos de marca de fogo para pneus NOVOS com descrição 'ESTOQUE' e status 'ENTRADA'
    IF NEW.tipo = 'NOVO' AND NEW.descricao = 'ESTOQUE' AND NEW.status = 'ENTRADA' THEN
      -- Para múltiplas unidades, gerar códigos na tabela separada
      IF NEW.quantidade > 1 THEN
        -- Gerar códigos para cada unidade na tabela marcas_fogo_lancamento
        FOR i IN 1..NEW.quantidade LOOP
          novo_codigo := gerar_codigo_marca_fogo();

          -- Inserir código na tabela separada
          INSERT INTO marcas_fogo_lancamento (
            lancamento_id,
            codigo_marca_fogo,
            usuario_criacao
          ) VALUES (
            NEW.id,
            novo_codigo,
            NEW.usuario
          );
        END LOOP;

        -- Manter o registro único com quantidade original para exibição em grid
        RETURN NEW;
      ELSE
        -- Para quantidade = 1, gerar código único
        novo_codigo := gerar_codigo_marca_fogo();
        NEW.codigo_marca_fogo := novo_codigo;
        NEW.quantidade := 1;
        RETURN NEW;
      END IF;
    END IF;

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
    -- Se mudou para ENTRADA e é NOVO/ESTOQUE, gerar código se não tiver
    IF NEW.status = 'ENTRADA' AND OLD.status != 'ENTRADA' AND NEW.tipo = 'NOVO' AND NEW.descricao = 'ESTOQUE' AND NEW.codigo_marca_fogo IS NULL THEN
      novo_codigo := gerar_codigo_marca_fogo();
      NEW.codigo_marca_fogo := novo_codigo;
    END IF;

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

-- Criar trigger AFTER INSERT para gerar códigos de marca de fogo
CREATE OR REPLACE FUNCTION gerar_codigos_marca_fogo_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  novo_codigo TEXT;
  i INTEGER;
BEGIN
  -- Gerar códigos de marca de fogo para pneus NOVOS com descrição 'ESTOQUE' e status 'ENTRADA' com múltiplas unidades
  IF NEW.tipo = 'NOVO' AND NEW.descricao = 'ESTOQUE' AND NEW.status = 'ENTRADA' AND NEW.quantidade > 1 THEN
    -- Gerar códigos para cada unidade na tabela marcas_fogo_lancamento
    FOR i IN 1..NEW.quantidade LOOP
      novo_codigo := gerar_codigo_marca_fogo();

      -- Inserir código na tabela separada
      INSERT INTO marcas_fogo_lancamento (
        lancamento_id,
        codigo_marca_fogo,
        usuario_criacao
      ) VALUES (
        NEW.id,
        novo_codigo,
        NEW.usuario
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger AFTER INSERT
DROP TRIGGER IF EXISTS trigger_gerar_codigos_after_insert ON pneus;
CREATE TRIGGER trigger_gerar_codigos_after_insert
  AFTER INSERT ON pneus
  FOR EACH ROW EXECUTE FUNCTION gerar_codigos_marca_fogo_after_insert();

-- Verificar se o trigger foi criado
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'pneus' AND trigger_name = 'trigger_atualizar_estoque_pneus';
