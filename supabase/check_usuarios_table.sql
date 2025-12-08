-- Script para verificar a estrutura e dados da tabela usuarios
-- Execute no SQL Editor do Supabase

-- IMPORTANTE: A coluna 'id' da tabela 'usuarios' deve ser do tipo UUID e corresponder ao 'id' da tabela 'auth.users' para que as políticas de segurança funcionem.

-- 1. Estrutura da tabela
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios'
ORDER BY ordinal_position;

-- 2. Políticas RLS (Row Level Security)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'usuarios';

-- 3. Índices na tabela
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'usuarios';

-- 4. Dados da tabela (limitado a 10 registros)
-- A comparação (id::text = auth.uid()::text) contorna o erro de tipo (bigint vs uuid)
-- mas a solução ideal a longo prazo é alterar a coluna 'id' para o tipo UUID.
SELECT id, nome, nomecompleto, email, nivel, created_at, updated_at, (id::text = auth.uid()::text) AS "is_current_user"
FROM usuarios
LIMIT 10;

-- 5. Contagem total de registros
SELECT COUNT(*) as total_usuarios
FROM usuarios;
