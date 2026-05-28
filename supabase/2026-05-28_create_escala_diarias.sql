create table if not exists public.escala_diarias (
    id uuid primary key default gen_random_uuid(),
    semana_nome text not null,
    filial text,
    valor_diaria numeric(12,2) not null default 0,
    valor_dia numeric(12,2) not null default 0,
    dias_base integer not null default 5,
    data_inicio date,
    data_fim date,
    total_funcionarios integer not null default 0,
    total_aptos integer not null default 0,
    total_bloqueados integer not null default 0,
    total_desconto numeric(12,2) not null default 0,
    ultima_alteracao_por text,
    ultima_alteracao_em timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.escala_diaria_itens (
    id uuid primary key default gen_random_uuid(),
    diaria_id uuid not null references public.escala_diarias(id) on delete cascade,
    funcionario_nome text not null,
    funcao text,
    status_diaria text,
    dias_desconto integer not null default 0,
    valor_desconto numeric(12,2) not null default 0,
    recebe_diaria boolean not null default true,
    ultima_alteracao_por text,
    ultima_alteracao_em timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_escala_diarias_semana_filial
    on public.escala_diarias (semana_nome, filial);

create index if not exists idx_escala_diaria_itens_diaria
    on public.escala_diaria_itens (diaria_id);
