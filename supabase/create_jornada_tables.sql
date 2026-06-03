-- ═══════════════════════════════════════════════════════════════════
--  CONTROLE DE JORNADA — Criação das tabelas no Supabase
--  Execute este script no SQL Editor do Supabase (projeto Marquespan)
--  URL: https://hlzcycvlcuhgnnjkmslt.supabase.co
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. CADASTROS (motoristas, auxiliares, veículos, cidades/rotas)
--    Sincronizados do IndexedDB local para a nuvem
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cadastros_motoristas (
  nome_escala          text        PRIMARY KEY,          -- nome conforme aparece na escala (maiúsculas)
  nome_ponto           text,                              -- nome no sistema de ponto (Secullum)
  funcao               text,
  telefone             text,
  tel_corp             text,
  cpf                  text,
  obs                  text,
  admissao             text,
  ativo                boolean     NOT NULL DEFAULT true,
  data_desligamento    text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cadastros_auxiliares (
  nome_escala          text        PRIMARY KEY,
  nome_ponto           text,
  funcao               text,
  telefone             text,
  tel_corp             text,
  cpf                  text,
  obs                  text,
  admissao             text,
  ativo                boolean     NOT NULL DEFAULT true,
  data_desligamento    text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cadastros_veiculos (
  placa                text        PRIMARY KEY,
  marca                text,
  modelo               text,
  tipo                 text,
  filial               text,
  capacidade           text,
  rota_padrao          text,
  obs                  text,
  ativo                boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cadastros_cidades (
  rota                 text        PRIMARY KEY,          -- código/nome da rota
  cidade               text,
  uf                   text,
  obs                  text,
  ativo                boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 2. ANÁLISES DE JORNADA
--    Cada análise representa um dia ou semana processado
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analises_jornada (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                 text        NOT NULL,              -- 'DIA' | 'SEMANA'
  data_inicio          date,
  data_fim             date,
  titulo               text,
  status               text        DEFAULT 'EM_ANALISE',
  origem               text        DEFAULT 'IMPORTACAO_XLSX_HTML',
  total_linhas         integer     DEFAULT 0,
  total_ok             integer     DEFAULT 0,
  total_infracoes      integer     DEFAULT 0,
  total_sem_registro   integer     DEFAULT 0,
  total_sem_tratativa  integer     DEFAULT 0,
  resumo               jsonb,
  filtros_aplicados    jsonb,
  updated_by           uuid,                              -- auth.users.id
  created_by           uuid,                              -- auth.users.id
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, data_inicio, data_fim)                    -- evita duplicatas por upsert
);

-- ─────────────────────────────────────────────────────────────────
-- 3. LINHAS DA ANÁLISE
--    Cada linha = um colaborador em um dia específico
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analise_linhas (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id           uuid        NOT NULL REFERENCES analises_jornada(id) ON DELETE CASCADE,
  linha_origem         integer     NOT NULL,              -- índice 0-based da linha no arquivo
  data_ref             date,
  placa                text,
  cidade               text,
  rota                 text,
  stat                 text,
  nome                 text,
  role                 text,                              -- 'MOTORISTA' | 'AUXILIAR'
  colaborador          text,
  funcao               text,
  saida                text,                              -- HH:MM
  entrada              text,                              -- HH:MM
  interj               text,                              -- HH:MM (interjornada calculada)
  obs                  text,
  hash_linha           text,
  dados_brutos         jsonb,                             -- objeto original da linha
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analise_id, linha_origem)
);

CREATE INDEX IF NOT EXISTS idx_analise_linhas_analise_id ON analise_linhas (analise_id);
CREATE INDEX IF NOT EXISTS idx_analise_linhas_nome ON analise_linhas (nome);
CREATE INDEX IF NOT EXISTS idx_analise_linhas_data_ref ON analise_linhas (data_ref);

-- ─────────────────────────────────────────────────────────────────
-- 4. TRATATIVAS / AÇÕES DISCIPLINARES
--    Ações registradas para cada linha de análise
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tratativas (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_linha_id     uuid        NOT NULL REFERENCES analise_linhas(id) ON DELETE CASCADE,
  tipo                 text        NOT NULL,              -- 'LIGACAO' | '1ª ADVERTENCIA VERBAL' | ... | 'OK'
  nivel                integer,                           -- 1, 2 ou 3 (para advertências)
  status               text        DEFAULT 'CONCLUIDA',
  observacao           text,
  recomendacao_sistema text,
  origem_local_id      text        NOT NULL,              -- ID único gerado no cliente (uid())
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analise_linha_id, origem_local_id)
);

CREATE INDEX IF NOT EXISTS idx_tratativas_analise_linha_id ON tratativas (analise_linha_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. AUDITORIA DE EXCLUSÕES
--    Registro de análises excluídas para fins de auditoria
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exclusoes_jornada (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado            text        DEFAULT 'SOLICITADA', -- 'SOLICITADA' | 'CONCLUIDA'
  detalhe              jsonb,                             -- {analise, origem, user_agent, total_linhas, ...}
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 6. PROFILES (view sobre usuarios)
--    A página de jornada espera uma tabela 'profiles' com campos
--    id, nome, papel, perfil, ativo. Esta view mapeia para 'usuarios'.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW profiles AS
SELECT
  auth_user_id                          AS id,
  nome,
  COALESCE(nivel, 'OPERADOR')           AS papel,
  COALESCE(nivel, 'OPERADOR')           AS perfil,
  (status = 'ATIVO' OR status IS NULL)  AS ativo
FROM usuarios;

-- ─────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY (RLS)
--    Apenas usuários autenticados podem acessar estas tabelas
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE cadastros_motoristas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadastros_auxiliares ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadastros_veiculos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadastros_cidades    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analises_jornada     ENABLE ROW LEVEL SECURITY;
ALTER TABLE analise_linhas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tratativas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE exclusoes_jornada    ENABLE ROW LEVEL SECURITY;

-- Política padrão: usuário autenticado tem acesso total
CREATE POLICY "Acesso autenticado" ON cadastros_motoristas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON cadastros_auxiliares FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON cadastros_veiculos   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON cadastros_cidades    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON analises_jornada     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON analise_linhas       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON tratativas           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso autenticado" ON exclusoes_jornada    FOR ALL USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────
-- 8. TRIGGERS: updated_at automático
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON cadastros_motoristas FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cadastros_auxiliares FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cadastros_veiculos   FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cadastros_cidades    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON analises_jornada     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON analise_linhas       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tratativas           FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON exclusoes_jornada    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
