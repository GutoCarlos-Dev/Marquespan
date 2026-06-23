-- Cria tabela de historico de revisoes realizadas
-- Execute no SQL Editor do Supabase

create table if not exists public.revisao_historico (
    id             uuid         default gen_random_uuid() primary key,
    placa          text         not null,
    servico        text         not null,
    km_realizado   integer      not null check (km_realizado >= 0),
    data_realizado date         not null,
    observacao     text,
    usuario_email  text,
    created_at     timestamptz  default now()
);

alter table public.revisao_historico enable row level security;

create policy "leitura_revisao_historico"
    on public.revisao_historico for select
    using (auth.role() = 'authenticated');

create policy "insercao_revisao_historico"
    on public.revisao_historico for insert
    with check (auth.role() = 'authenticated');

create index if not exists idx_revisao_historico_placa
    on public.revisao_historico (placa);

notify pgrst, 'reload schema';
