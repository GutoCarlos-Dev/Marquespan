-- Arquivo: apply_policies_from_veiculos_to_others.sql
-- Objetivo: replicar as policies observadas na tabela `veiculos` para outras tabelas.
-- IMPORTANTE: FAÇA BACKUP antes de executar. Este script DROPA políticas com os mesmos nomes nas tabelas destino (se existirem)
-- e em seguida CRIA novas policies com os mesmos nomes e corpo observado em `veiculos`.
-- Revise atentamente antes de executar no Supabase SQL Editor.

-- Tabelas destino (edite se desejar outros nomes):
-- produtos, fornecedores, cotacoes, cotacao_itens, cotacao_orcamentos, orcamento_item_precos

-- Observação de segurança:
-- Estas policies replicam comportamento observado em `veiculos`. Algumas delas usam `TO public` (acesso público)
-- e outras `TO authenticated`. Avalie se deseja permissividade pública em produção.

-- =========================
-- Helpers / Backup sugerido
-- =========================
-- Recomendo exportar CSV de cada tabela via UI antes de executar.
-- Exemplo de backup via SQL (criando tabelas de backup):
-- CREATE TABLE IF NOT EXISTS public.backup_produtos AS TABLE public.produtos WITH NO DATA;
-- INSERT INTO public.backup_produtos SELECT * FROM public.produtos;

-- =========================
-- Começo do script de policies
-- =========================

-- Substitua o array abaixo pelas tabelas destino que deseja alterar (ou execute o bloco para cada tabela).
-- Aqui eu crio blocos para as tabelas: produtos, fornecedores, cotacoes, cotacao_itens, cotacao_orcamentos, orcamento_item_precos

-- NOTE: Os nomes das policies têm espaços e caracteres acentuados; o script usa aspas para preservá-los.

-- ----- policies (replicadas de `veiculos`) -----
-- Lista de policy names encontrados em `veiculos` e seus corpos:
-- "Allow delete for authenticated"  -> FOR ALL TO authenticated USING (true);
-- "Allow insert for authenticated"  -> FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- "Allow select for authenticated"  -> FOR ALL TO authenticated USING (true);
-- "Allow update for authenticated"  -> FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- "Permitir atualização"            -> FOR ALL TO public USING (true);
-- "Permitir exclusão"               -> FOR ALL TO public USING (true);
-- "Permitir inserção pública"       -> FOR ALL TO public USING (true) WITH CHECK (true);
-- "Permitir leitura para todos"     -> FOR ALL TO public USING (true);

-- Vou aplicar exatamente esses corpos nas tabelas destino.

-- Função: aplicar para uma tabela
-- Execução manual: substitua <TABELA> e rode os blocos abaixo, ou copie tudo e rode.

-- ########### produtos ###########
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.produtos;
CREATE POLICY "Allow delete for authenticated" ON public.produtos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.produtos;
CREATE POLICY "Allow insert for authenticated" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.produtos;
CREATE POLICY "Allow select for authenticated" ON public.produtos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.produtos;
CREATE POLICY "Allow update for authenticated" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização" ON public.produtos;
CREATE POLICY "Permitir atualização" ON public.produtos FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir exclusão" ON public.produtos;
CREATE POLICY "Permitir exclusão" ON public.produtos FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserção pública" ON public.produtos;
CREATE POLICY "Permitir inserção pública" ON public.produtos FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.produtos;
CREATE POLICY "Permitir leitura para todos" ON public.produtos FOR ALL TO public USING (true);

-- ########### fornecedores ###########
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.fornecedores;
CREATE POLICY "Allow delete for authenticated" ON public.fornecedores FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.fornecedores;
CREATE POLICY "Allow insert for authenticated" ON public.fornecedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.fornecedores;
CREATE POLICY "Allow select for authenticated" ON public.fornecedores FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.fornecedores;
CREATE POLICY "Allow update for authenticated" ON public.fornecedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização" ON public.fornecedores;
CREATE POLICY "Permitir atualização" ON public.fornecedores FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir exclusão" ON public.fornecedores;
CREATE POLICY "Permitir exclusão" ON public.fornecedores FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserção pública" ON public.fornecedores;
CREATE POLICY "Permitir inserção pública" ON public.fornecedores FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.fornecedores;
CREATE POLICY "Permitir leitura para todos" ON public.fornecedores FOR ALL TO public USING (true);

-- ########### cotacoes ###########
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.cotacoes;
CREATE POLICY "Allow delete for authenticated" ON public.cotacoes FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.cotacoes;
CREATE POLICY "Allow insert for authenticated" ON public.cotacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.cotacoes;
CREATE POLICY "Allow select for authenticated" ON public.cotacoes FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.cotacoes;
CREATE POLICY "Allow update for authenticated" ON public.cotacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização" ON public.cotacoes;
CREATE POLICY "Permitir atualização" ON public.cotacoes FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir exclusão" ON public.cotacoes;
CREATE POLICY "Permitir exclusão" ON public.cotacoes FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserção pública" ON public.cotacoes;
CREATE POLICY "Permitir inserção pública" ON public.cotacoes FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.cotacoes;
CREATE POLICY "Permitir leitura para todos" ON public.cotacoes FOR ALL TO public USING (true);

-- ########### cotacao_itens ###########
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.cotacao_itens;
CREATE POLICY "Allow delete for authenticated" ON public.cotacao_itens FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.cotacao_itens;
CREATE POLICY "Allow insert for authenticated" ON public.cotacao_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.cotacao_itens;
CREATE POLICY "Allow select for authenticated" ON public.cotacao_itens FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.cotacao_itens;
CREATE POLICY "Allow update for authenticated" ON public.cotacao_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização" ON public.cotacao_itens;
CREATE POLICY "Permitir atualização" ON public.cotacao_itens FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir exclusão" ON public.cotacao_itens;
CREATE POLICY "Permitir exclusão" ON public.cotacao_itens FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserção pública" ON public.cotacao_itens;
CREATE POLICY "Permitir inserção pública" ON public.cotacao_itens FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.cotacao_itens;
CREATE POLICY "Permitir leitura para todos" ON public.cotacao_itens FOR ALL TO public USING (true);

-- ########### cotacao_orcamentos ###########
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.cotacao_orcamentos;
CREATE POLICY "Allow delete for authenticated" ON public.cotacao_orcamentos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.cotacao_orcamentos;
CREATE POLICY "Allow insert for authenticated" ON public.cotacao_orcamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.cotacao_orcamentos;
CREATE POLICY "Allow select for authenticated" ON public.cotacao_orcamentos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.cotacao_orcamentos;
CREATE POLICY "Allow update for authenticated" ON public.cotacao_orcamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização" ON public.cotacao_orcamentos;
CREATE POLICY "Permitir atualização" ON public.cotacao_orcamentos FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir exclusão" ON public.cotacao_orcamentos;
CREATE POLICY "Permitir exclusão" ON public.cotacao_orcamentos FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserção pública" ON public.cotacao_orcamentos;
CREATE POLICY "Permitir inserção pública" ON public.cotacao_orcamentos FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.cotacao_orcamentos;
CREATE POLICY "Permitir leitura para todos" ON public.cotacao_orcamentos FOR ALL TO public USING (true);

-- ########### orcamento_item_precos ###########
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.orcamento_item_precos;
CREATE POLICY "Allow delete for authenticated" ON public.orcamento_item_precos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.orcamento_item_precos;
CREATE POLICY "Allow insert for authenticated" ON public.orcamento_item_precos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.orcamento_item_precos;
CREATE POLICY "Allow select for authenticated" ON public.orcamento_item_precos FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.orcamento_item_precos;
CREATE POLICY "Allow update for authenticated" ON public.orcamento_item_precos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização" ON public.orcamento_item_precos;
CREATE POLICY "Permitir atualização" ON public.orcamento_item_precos FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir exclusão" ON public.orcamento_item_precos;
CREATE POLICY "Permitir exclusão" ON public.orcamento_item_precos FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Permitir inserção pública" ON public.orcamento_item_precos;
CREATE POLICY "Permitir inserção pública" ON public.orcamento_item_precos FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.orcamento_item_precos;
CREATE POLICY "Permitir leitura para todos" ON public.orcamento_item_precos FOR ALL TO public USING (true);

-- =========================
-- FIM
-- =========================

-- Após execução, teste a aplicação (recarregue a página e tente cadastrar produtos/fornecedores/cotações).
-- Se preferir, eu gero uma versão do script com políticas apenas 'auth' (sem TO public), ou apenas SELECT/INSERT/UPDATE/DELETE separadas.
