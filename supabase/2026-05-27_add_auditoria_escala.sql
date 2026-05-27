alter table public.escala
    add column if not exists ultima_alteracao_por text,
    add column if not exists ultima_alteracao_em timestamptz;

alter table public.planejamento_semanal
    add column if not exists ultima_alteracao_por text,
    add column if not exists ultima_alteracao_em timestamptz;

alter table public.faltas_afastamentos
    add column if not exists ultima_alteracao_por text,
    add column if not exists ultima_alteracao_em timestamptz;

create index if not exists idx_escala_ultima_alteracao
    on public.escala (ultima_alteracao_em desc);

create index if not exists idx_planejamento_ultima_alteracao
    on public.planejamento_semanal (ultima_alteracao_em desc);

create index if not exists idx_faltas_ultima_alteracao
    on public.faltas_afastamentos (ultima_alteracao_em desc);
