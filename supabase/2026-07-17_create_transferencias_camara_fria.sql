-- Transferencias CDS - Camara Fria: lista semanal manual de Estoque + Segunda a Sexta por produto,
-- com Total, Saldo e a marcacao de Transferir (VENDA FECHADA ou vazio).
-- Execute no SQL Editor do Supabase.

create table if not exists public.transferencias_camara_fria (
    id uuid primary key default gen_random_uuid(),
    filial text not null,
    semana text not null,
    data_contagem date not null,
    produto_id uuid not null references public.produtos_camara_fria(id) on update cascade on delete restrict,
    estoque integer not null default 0 check (estoque >= 0),
    segunda integer not null default 0 check (segunda >= 0),
    terca integer not null default 0 check (terca >= 0),
    quarta integer not null default 0 check (quarta >= 0),
    quinta integer not null default 0 check (quinta >= 0),
    sexta integer not null default 0 check (sexta >= 0),
    transferir text,
    usuario text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transferencias_camara_fria_unico unique (filial, semana, data_contagem, produto_id),
    constraint transferencias_camara_fria_semana_check check (semana ~ '^[0-9]{4}-W[0-9]{2}$')
);

create index if not exists idx_transferencias_camara_fria_filial_semana_data
    on public.transferencias_camara_fria (filial, semana, data_contagem);

create index if not exists idx_transferencias_camara_fria_produto
    on public.transferencias_camara_fria (produto_id);

grant select, insert, update, delete on table public.transferencias_camara_fria to authenticated;

alter table public.transferencias_camara_fria enable row level security;

drop policy if exists transferencias_camara_fria_select_permitidos on public.transferencias_camara_fria;
create policy transferencias_camara_fria_select_permitidos
on public.transferencias_camara_fria
for select
to authenticated
using (true);

drop policy if exists transferencias_camara_fria_insert_permitidos on public.transferencias_camara_fria;
create policy transferencias_camara_fria_insert_permitidos
on public.transferencias_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists transferencias_camara_fria_update_permitidos on public.transferencias_camara_fria;
create policy transferencias_camara_fria_update_permitidos
on public.transferencias_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists transferencias_camara_fria_delete_permitidos on public.transferencias_camara_fria;
create policy transferencias_camara_fria_delete_permitidos
on public.transferencias_camara_fria
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
