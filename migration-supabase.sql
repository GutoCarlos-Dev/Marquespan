-- Script de Migração para Supabase - Sistema de Gestão de Pneus Marquespan
-- Este script cria as tabelas necessárias para migrar os dados do localStorage para o Supabase

-- =====================================================
-- TABELA: pneus
-- Descrição: Registra todas as movimentações de pneus (entradas, saídas, contagens, etc.)
-- =====================================================
CREATE TABLE pneus (
    id SERIAL PRIMARY KEY,
    data TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    marca VARCHAR(100) NOT NULL,
    modelo VARCHAR(100) NOT NULL,
    vida INTEGER DEFAULT 0,
    tipo VARCHAR(50) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('ENTRADA', 'SAIDA')),
    descricao VARCHAR(200),
    quantidade INTEGER NOT NULL DEFAULT 0,
    usuario VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELA: estoque_pneus
-- Descrição: Mantém o saldo atual do estoque por combinação marca-modelo-tipo-vida
-- =====================================================
CREATE TABLE estoque_pneus (
    id SERIAL PRIMARY KEY,
    marca VARCHAR(100) NOT NULL,
    modelo VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    vida INTEGER DEFAULT 0,
    quantidade INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(marca, modelo, tipo, vida)
);

-- =====================================================
-- TABELA: usuarios
-- Descrição: Usuários do sistema (se existir dados de usuários)
-- =====================================================
-- CREATE TABLE usuarios (
--     id SERIAL PRIMARY KEY,
--     nome VARCHAR(100) NOT NULL,
--     email VARCHAR(150) UNIQUE,
--     senha_hash VARCHAR(255),
--     ativo BOOLEAN DEFAULT TRUE,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );
-- NOTA: Tabela usuarios já existe, comentada para evitar erro

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================
CREATE INDEX idx_pneus_data ON pneus(data);
CREATE INDEX idx_pneus_marca ON pneus(marca);
CREATE INDEX idx_pneus_modelo ON pneus(modelo);
CREATE INDEX idx_pneus_tipo ON pneus(tipo);
CREATE INDEX idx_pneus_status ON pneus(status);
CREATE INDEX idx_pneus_usuario ON pneus(usuario);

CREATE INDEX idx_estoque_marca ON estoque_pneus(marca);
CREATE INDEX idx_estoque_modelo ON estoque_pneus(modelo);
CREATE INDEX idx_estoque_tipo ON estoque_pneus(tipo);

-- =====================================================
-- POLÍTICAS RLS (Row Level Security) - SUPABASE
-- =====================================================

-- Habilitar RLS nas tabelas
ALTER TABLE pneus ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pneus ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Políticas para tabela pneus
CREATE POLICY "Permitir leitura para todos os usuários autenticados" ON pneus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção para usuários autenticados" ON pneus
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização para usuários autenticados" ON pneus
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir exclusão para usuários autenticados" ON pneus
    FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas para tabela estoque_pneus
CREATE POLICY "Permitir leitura do estoque para todos os usuários autenticados" ON estoque_pneus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização do estoque para usuários autenticados" ON estoque_pneus
    FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para tabela usuarios
CREATE POLICY "Usuários podem ler seus próprios dados" ON usuarios
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Permitir leitura de usuários para admin" ON usuarios
    FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Permitir atualização de usuários para admin" ON usuarios
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- =====================================================
-- FUNCTIONS E TRIGGERS PARA MANTER ESTOQUE ATUALIZADO
-- =====================================================

-- Function para atualizar estoque automaticamente
CREATE OR REPLACE FUNCTION atualizar_estoque()
RETURNS TRIGGER AS $$
BEGIN
    -- Para INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'ENTRADA' THEN
            INSERT INTO estoque_pneus (marca, modelo, tipo, vida, quantidade)
            VALUES (NEW.marca, NEW.modelo, NEW.tipo, NEW.vida, NEW.quantidade)
            ON CONFLICT (marca, modelo, tipo, vida)
            DO UPDATE SET
                quantidade = estoque_pneus.quantidade + NEW.quantidade,
                updated_at = NOW();
        ELSIF NEW.status = 'SAIDA' THEN
            UPDATE estoque_pneus
            SET quantidade = quantidade - NEW.quantidade,
                updated_at = NOW()
            WHERE marca = NEW.marca AND modelo = NEW.modelo AND tipo = NEW.tipo AND vida = NEW.vida;
        END IF;
        RETURN NEW;
    END IF;

    -- Para UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Reverter movimento antigo
        IF OLD.status = 'ENTRADA' THEN
            UPDATE estoque_pneus
            SET quantidade = quantidade - OLD.quantidade,
                updated_at = NOW()
            WHERE marca = OLD.marca AND modelo = OLD.modelo AND tipo = OLD.tipo AND vida = OLD.vida;
        ELSIF OLD.status = 'SAIDA' THEN
            UPDATE estoque_pneus
            SET quantidade = quantidade + OLD.quantidade,
                updated_at = NOW()
            WHERE marca = OLD.marca AND modelo = OLD.modelo AND tipo = OLD.tipo AND vida = OLD.vida;
        END IF;

        -- Aplicar novo movimento
        IF NEW.status = 'ENTRADA' THEN
            INSERT INTO estoque_pneus (marca, modelo, tipo, vida, quantidade)
            VALUES (NEW.marca, NEW.modelo, NEW.tipo, NEW.vida, NEW.quantidade)
            ON CONFLICT (marca, modelo, tipo, vida)
            DO UPDATE SET
                quantidade = estoque_pneus.quantidade + NEW.quantidade,
                updated_at = NOW();
        ELSIF NEW.status = 'SAIDA' THEN
            UPDATE estoque_pneus
            SET quantidade = quantidade - NEW.quantidade,
                updated_at = NOW()
            WHERE marca = NEW.marca AND modelo = NEW.modelo AND tipo = NEW.tipo AND vida = NEW.vida;
        END IF;
        RETURN NEW;
    END IF;

    -- Para DELETE
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'ENTRADA' THEN
            UPDATE estoque_pneus
            SET quantidade = quantidade - OLD.quantidade,
                updated_at = NOW()
            WHERE marca = OLD.marca AND modelo = OLD.modelo AND tipo = OLD.tipo AND vida = OLD.vida;
        ELSIF OLD.status = 'SAIDA' THEN
            UPDATE estoque_pneus
            SET quantidade = quantidade + OLD.quantidade,
                updated_at = NOW()
            WHERE marca = OLD.marca AND modelo = OLD.modelo AND tipo = OLD.tipo AND vida = OLD.vida;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger para manter estoque atualizado
CREATE TRIGGER trigger_atualizar_estoque
    AFTER INSERT OR UPDATE OR DELETE ON pneus
    FOR EACH ROW EXECUTE FUNCTION atualizar_estoque();

-- Function para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_pneus_updated_at BEFORE UPDATE ON pneus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_estoque_updated_at BEFORE UPDATE ON estoque_pneus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DADOS INICIAIS (OPCIONAIS)
-- =====================================================

-- Inserir usuário admin (senha: admin123 - deve ser hashada na aplicação)
-- IMPORTANTE: Na aplicação real, use bcrypt ou similar para hashear senhas
-- INSERT INTO usuarios (nome, email, senha_hash, ativo) VALUES
-- ('Administrador', 'admin@marquespan.com', '$2b$10$dummy.hash.for.migration', true);
-- NOTA: Usuário admin já existe ou será criado separadamente

-- =====================================================
-- VIEWS ÚTEIS PARA CONSULTAS
-- =====================================================

-- View para relatório de movimentações
CREATE VIEW vw_movimentacoes_pneus AS
SELECT
    p.id,
    p.data,
    p.marca,
    p.modelo,
    p.vida,
    p.tipo,
    p.status,
    p.descricao,
    p.quantidade,
    p.usuario,
    CASE
        WHEN p.status = 'ENTRADA' THEN p.quantidade
        ELSE 0
    END as entrada,
    CASE
        WHEN p.status = 'SAIDA' THEN p.quantidade
        ELSE 0
    END as saida
FROM pneus p
ORDER BY p.data DESC;

-- View para saldo atual do estoque
CREATE VIEW vw_estoque_atual AS
SELECT
    marca,
    modelo,
    tipo,
    vida,
    quantidade as saldo_atual,
    updated_at as ultima_atualizacao
FROM estoque_pneus
WHERE quantidade > 0
ORDER BY marca, modelo, tipo, vida;

-- =====================================================
-- COMENTÁRIOS FINAIS
-- =====================================================
/*
INSTRUÇÕES PARA MIGRAÇÃO:

1. Execute este script no SQL Editor do Supabase
2. Verifique se todas as tabelas foram criadas corretamente
3. Para migrar dados existentes do localStorage:

   a) Exporte os dados do localStorage:
      - Abra o console do navegador (F12)
      - Execute: console.log(JSON.stringify(localStorage.getItem('pneus')))
      - Execute: console.log(JSON.stringify(localStorage.getItem('estoquePneus')))

   b) Use os dados exportados para inserir na tabela pneus e estoque_pneus

4. Atualize os scripts JavaScript para usar Supabase ao invés de localStorage
5. Teste todas as funcionalidades após a migração

NOTAS DE SEGURANÇA:
- As políticas RLS estão configuradas para usuários autenticados
- Considere implementar roles mais granulares se necessário
- As senhas devem ser hashadas na aplicação (não no banco)
- Monitore o uso da função atualizar_estoque() para performance
*/
