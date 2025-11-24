-- Criar tabela para controlar saídas detalhadas de pneus
CREATE TABLE IF NOT EXISTS saidas_detalhadas (
    id SERIAL PRIMARY KEY,
    lancamento_id INTEGER REFERENCES pneus(id) ON DELETE CASCADE,
    codigo_marca_fogo VARCHAR(10),
    data_saida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    placa VARCHAR(20),
    quilometragem INTEGER,
    aplicacao VARCHAR(20), -- 'DIANTEIRO', 'TRACAO', 'TRUCK'
    tipo_operacao VARCHAR(20), -- 'RODIZIO', 'INSTALACAO', 'TROCA', 'DESCARTE'
    posicao_anterior VARCHAR(50), -- Ex: 'DIANTEIRO_ESQUERDO'
    posicao_nova VARCHAR(50), -- Ex: 'TRACAO_ESQUERDO'
    codigo_marca_fogo_trocado VARCHAR(10), -- Para rodízio/troca
    observacoes TEXT,
    usuario VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela para controlar posições atuais dos pneus nos veículos
CREATE TABLE IF NOT EXISTS posicoes_veiculos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(20) NOT NULL,
    posicao VARCHAR(50) NOT NULL, -- 'DIANTEIRO_ESQUERDO', 'DIANTEIRO_DIREITO', etc.
    codigo_marca_fogo VARCHAR(10),
    data_instalacao TIMESTAMP,
    quilometragem_instalacao INTEGER,
    usuario_instalacao VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(placa, posicao)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_saidas_detalhadas_lancamento ON saidas_detalhadas(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_saidas_detalhadas_codigo ON saidas_detalhadas(codigo_marca_fogo);
CREATE INDEX IF NOT EXISTS idx_saidas_detalhadas_placa ON saidas_detalhadas(placa);
CREATE INDEX IF NOT EXISTS idx_posicoes_veiculos_placa ON posicoes_veiculos(placa);
CREATE INDEX IF NOT EXISTS idx_posicoes_veiculos_codigo ON posicoes_veiculos(codigo_marca_fogo);

-- Adicionar colunas na tabela pneus se não existirem
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS quilometragem_saida INTEGER;
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS aplicacao_saida VARCHAR(20);
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS tipo_operacao_saida VARCHAR(20);
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS posicao_saida VARCHAR(50);
ALTER TABLE pneus ADD COLUMN IF NOT EXISTS codigo_trocado_saida VARCHAR(10);
