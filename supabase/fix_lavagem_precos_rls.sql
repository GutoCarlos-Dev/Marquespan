-- Script de Correção de Permissões (RLS)
-- Execute este script no Editor SQL do Supabase para corrigir o erro "new row violates row-level security policy"

-- Como o sistema utiliza um login personalizado (não integrado ao Supabase Auth),
-- as requisições são feitas como 'anon' (anônimo). Precisamos ajustar as políticas para permitir isso.

-- 1. Remover políticas anteriores que exigiam autenticação do Supabase
DROP POLICY IF EXISTS "Permitir leitura para todos autenticados" ON lavagem_precos;
DROP POLICY IF EXISTS "Permitir inserção para todos autenticados" ON lavagem_precos;
DROP POLICY IF EXISTS "Permitir atualização para todos autenticados" ON lavagem_precos;
DROP POLICY IF EXISTS "Permitir exclusão para todos autenticados" ON lavagem_precos;

-- 2. Criar novas políticas públicas (acessíveis pela chave API pública)
CREATE POLICY "Permitir leitura publica" ON lavagem_precos
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserção publica" ON lavagem_precos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização publica" ON lavagem_precos
    FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão publica" ON lavagem_precos
    FOR DELETE USING (true);