alter table public.escala
    add column if not exists filial text;

alter table public.planejamento_semanal
    add column if not exists filial text;

create index if not exists idx_escala_filial_data
    on public.escala (filial, data_escala);

create index if not exists idx_escala_filial_semana
    on public.escala (filial, semana_nome);

create index if not exists idx_planejamento_semanal_filial_semana
    on public.planejamento_semanal (filial, semana_nome);
