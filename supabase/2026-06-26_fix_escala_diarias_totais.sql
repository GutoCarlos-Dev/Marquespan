alter table if exists public.escala_diarias
    add column if not exists total_desconto_anterior numeric(12,2) not null default 0,
    add column if not exists total_desconto_variavel numeric(12,2) not null default 0,
    add column if not exists total_pagar numeric(12,2) not null default 0,
    add column if not exists total_desconto numeric(12,2) not null default 0,
    add column if not exists total_aptos integer not null default 0,
    add column if not exists total_bloqueados integer not null default 0,
    add column if not exists total_funcionarios integer not null default 0,
    add column if not exists valor_diaria numeric(12,2) not null default 0,
    add column if not exists valor_dia numeric(12,2) not null default 0,
    add column if not exists dias_base integer not null default 5,
    add column if not exists data_inicio date,
    add column if not exists data_fim date,
    add column if not exists ultima_alteracao_por text,
    add column if not exists ultima_alteracao_em timestamptz,
    add column if not exists created_at timestamptz not null default now();

alter table if exists public.escala_diaria_itens
    add column if not exists funcao text,
    add column if not exists status_diaria text,
    add column if not exists dias_desconto integer not null default 0,
    add column if not exists desconto_anterior numeric(12,2) not null default 0,
    add column if not exists desconto_variavel numeric(12,2) not null default 0,
    add column if not exists descricao_desconto_variavel text,
    add column if not exists valor_pagar numeric(12,2) not null default 0,
    add column if not exists valor_desconto numeric(12,2) not null default 0,
    add column if not exists recebe_diaria boolean not null default true,
    add column if not exists ultima_alteracao_por text,
    add column if not exists ultima_alteracao_em timestamptz,
    add column if not exists created_at timestamptz not null default now();

create index if not exists idx_escala_diarias_semana_filial
    on public.escala_diarias (semana_nome, filial);

create index if not exists idx_escala_diaria_itens_diaria
    on public.escala_diaria_itens (diaria_id);

notify pgrst, 'reload schema';
