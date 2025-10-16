-- =====================================================
-- CORREÇÕES PARA MIGRAÇÃO SUPABASE - VERSÃO SIMPLIFICADA
-- Execute estes comandos no SQL Editor do Supabase ANTES da migração
-- =====================================================

-- 1. REMOVER TODAS AS POLÍTICAS RLS EXISTENTES
DROP POLICY IF EXISTS "Permitir leitura para todos os usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir inserção para usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir atualização para usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir exclusão para usuários autenticados" ON pneus;
DROP POLICY IF EXISTS "Permitir leitura do estoque para todos os usuários autenticados" ON estoque_pneus;
DROP POLICY IF EXISTS "Permitir atualização do estoque para usuários autenticados" ON estoque_pneus;
DROP POLICY IF EXISTS "Usuários podem ler seus próprios dados" ON usuarios;
DROP POLICY IF EXISTS "Permitir leitura de usuários para admin" ON usuarios;
DROP POLICY IF EXISTS "Permitir atualização de usuários para admin" ON usuarios;

-- 2. DESABILITAR RLS TEMPORARIAMENTE
ALTER TABLE pneus DISABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pneus DISABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- APÓS MIGRAÇÃO BEM-SUCEDIDA, EXECUTE ESTA PARTE:
-- =====================================================

-- 3. REABILITAR RLS
-- ALTER TABLE pneus ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE estoque_pneus ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- 4. CRIAR POLÍTICAS PERMISSIVAS PARA DESENVOLVIMENTO
-- CREATE POLICY "Permitir tudo para desenvolvimento" ON pneus FOR ALL USING (true);
-- CREATE POLICY "Permitir tudo para desenvolvimento" ON estoque_pneus FOR ALL USING (true);
-- CREATE POLICY "Permitir tudo para desenvolvimento" ON usuarios FOR ALL USING (true);

-- =====================================================
-- INSTRUÇÕES DE USO:
-- 1. Execute apenas a primeira parte (DROP + DISABLE) ANTES da migração
-- 2. Execute a migração no navegador
-- 3. Execute a segunda parte (ENABLE + CREATE) APÓS migração
-- =====================================================
