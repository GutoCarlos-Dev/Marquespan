-- Transferencias CDS - Camara Fria: placa do veiculo que fara a transferencia em cada dia
-- (Domingo a Sabado) da lista, por Filial + Semana + Data da Contagem. "Sem Placa" e
-- representado por placa = null (dia sem veiculo definido ainda).
-- Execute no SQL Editor do Supabase.

create table if not exists public.transferencias_camara_fria_placas (
    id uuid primary key default gen_random_uuid(),
    filial text not null,
    semana text not null,
    data_contagem date not null,
    dia text not null check (dia in ('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado')),
    placa text,
    usuario text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transferencias_camara_fria_placas_unico unique (filial, semana, data_contagem, dia),
    constraint transferencias_camara_fria_placas_semana_check check (semana ~ '^[0-9]{4}-W[0-9]{2}$')
);

-- Defensivo: se este script ja tiver rodado antes (com a lista de dias so Seg-Sex), atualiza
-- a constraint para incluir Domingo e Sabado. No-op se a tabela acabou de ser criada acima.
alter table public.transferencias_camara_fria_placas
    drop constraint if exists transferencias_camara_fria_placas_dia_check;
alter table public.transferencias_camara_fria_placas
    add constraint transferencias_camara_fria_placas_dia_check
    check (dia in ('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'));

create index if not exists idx_transferencias_camara_fria_placas_filial_semana_data
    on public.transferencias_camara_fria_placas (filial, semana, data_contagem);

grant select, insert, update, delete on table public.transferencias_camara_fria_placas to authenticated;

alter table public.transferencias_camara_fria_placas enable row level security;

drop policy if exists transferencias_camara_fria_placas_select_permitidos on public.transferencias_camara_fria_placas;
create policy transferencias_camara_fria_placas_select_permitidos
on public.transferencias_camara_fria_placas
for select
to authenticated
using (true);

drop policy if exists transferencias_camara_fria_placas_insert_permitidos on public.transferencias_camara_fria_placas;
create policy transferencias_camara_fria_placas_insert_permitidos
on public.transferencias_camara_fria_placas
for insert
to authenticated
with check (true);

drop policy if exists transferencias_camara_fria_placas_update_permitidos on public.transferencias_camara_fria_placas;
create policy transferencias_camara_fria_placas_update_permitidos
on public.transferencias_camara_fria_placas
for update
to authenticated
using (true)
with check (true);

drop policy if exists transferencias_camara_fria_placas_delete_permitidos on public.transferencias_camara_fria_placas;
create policy transferencias_camara_fria_placas_delete_permitidos
on public.transferencias_camara_fria_placas
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
