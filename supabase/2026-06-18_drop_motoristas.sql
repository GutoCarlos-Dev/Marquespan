-- =============================================================
-- Remove a tabela motoristas do módulo cadastro-carregamento
-- A tabela deixou de ser utilizada — motorista agora é campo
-- livre no formulário de Carregamento.
-- =============================================================

-- Remove políticas RLS antes de excluir
drop policy if exists "Permitir leitura motoristas"  on public.motoristas;
drop policy if exists "Permitir inserir motoristas"  on public.motoristas;
drop policy if exists "Permitir atualizar motoristas" on public.motoristas;
drop policy if exists "Permitir excluir motoristas"  on public.motoristas;

-- Remove a tabela (cascade remove índices e triggers vinculados)
drop table if exists public.motoristas cascade;

notify pgrst, 'reload schema';
