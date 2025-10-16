-- =====================================================
-- CORREÇÕES PARA MIGRAÇÃO SUPABASE
-- Execute estes comandos no SQL Editor do Supabase ANTES da migração
-- =====================================================

-- 1. DESABILITAR TEMPORARIAMENTE AS POLÍTICAS RLS PARA MIGRAÇÃO
ALTER TABLE pneus DISABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pneus DISABLE ROW LEVEL SECURITY;

-- 2. VERIFICAR SE AS TABELAS EXISTEM E CRIAR SE NECESSÁRIO
-- (Execute o migration-supabase.sql primeiro se as tabelas não existirem)

-- 3. APÓS A MIGRAÇÃO, REABILITAR RLS COM POLÍTICAS CORRETAS
-- Execute estes comandos APÓS a migração bem-sucedida:

-- Políticas para tabela pneus
DROP POLICY IF EXISTS "Permitir leitura para todos os usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir inserção para usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir atualização para usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir exclusão para usuários autenticados" ON pneus;

CREATE POLICY "Permitir leitura para todos os usuários autenticados" ON pneus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção para usuários autenticados" ON pneus
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização para usuários autenticados" ON pneus
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir exclusão para usuários autenticados" ON pneus
    FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas para tabela estoque_pneus
DROP POLICY IF EXISTS "Permitir leitura do estoque para todos os usuários autenticados" ON estoque_pneus;
DROP POLICY IF EXISTS "Permitir atualização do estoque para usuários autenticados" ON estoque_pneus;

CREATE POLICY "Permitir leitura do estoque para todos os usuários autenticados" ON estoque_pneus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização do estoque para usuários autenticados" ON estoque_pneus
    FOR ALL USING (auth.role() = 'authenticated');

-- Reabilitar RLS
ALTER TABLE pneus ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pneus ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- INSTRUÇÕES DE USO:
-- 1. Execute o migration-supabase.sql primeiro (se as tabelas não existirem)
-- 2. Execute a primeira parte desta correção (DISABLE RLS)
-- 3. Execute a migração no navegador
-- 4. Execute a segunda parte desta correção (ENABLE RLS com políticas corretas)
-- =====================================================
