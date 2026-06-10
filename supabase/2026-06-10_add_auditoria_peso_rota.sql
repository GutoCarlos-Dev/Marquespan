-- Adiciona colunas de auditoria na tabela peso_rota
alter table public.peso_rota
    add column if not exists ultima_alteracao_por text,
    add column if not exists ultima_alteracao_em  timestamptz;
