-- Estoque semanal da Camara Fria por Filial, Semana e Fabrica.
-- Execute no SQL Editor do Supabase.

create table if not exists public.fabricas_camara_fria (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint fabricas_camara_fria_nome_unique unique (nome)
);

create table if not exists public.estoque_camara_fria (
    id uuid primary key default gen_random_uuid(),
    filial text not null,
    semana text not null,
    fabrica_id uuid not null references public.fabricas_camara_fria(id) on update cascade on delete restrict,
    produto_id uuid not null references public.produtos_camara_fria(id) on update cascade on delete restrict,
    quantidade_caixas integer not null default 0 check (quantidade_caixas >= 0),
    observacao text,
    usuario text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint estoque_camara_fria_unico unique (filial, semana, fabrica_id, produto_id),
    constraint estoque_camara_fria_semana_check check (semana ~ '^[0-9]{4}-W[0-9]{2}$')
);

create index if not exists idx_estoque_camara_fria_filial_semana
    on public.estoque_camara_fria (filial, semana);

create index if not exists idx_estoque_camara_fria_fabrica
    on public.estoque_camara_fria (fabrica_id);

create index if not exists idx_estoque_camara_fria_produto
    on public.estoque_camara_fria (produto_id);

grant select, insert, update, delete on table public.fabricas_camara_fria to authenticated;
grant select, insert, update, delete on table public.estoque_camara_fria to authenticated;

alter table public.fabricas_camara_fria enable row level security;
alter table public.estoque_camara_fria enable row level security;

drop policy if exists fabricas_camara_fria_select_permitidos on public.fabricas_camara_fria;
create policy fabricas_camara_fria_select_permitidos
on public.fabricas_camara_fria
for select
to authenticated
using (true);

drop policy if exists fabricas_camara_fria_insert_permitidos on public.fabricas_camara_fria;
create policy fabricas_camara_fria_insert_permitidos
on public.fabricas_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists fabricas_camara_fria_update_permitidos on public.fabricas_camara_fria;
create policy fabricas_camara_fria_update_permitidos
on public.fabricas_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists fabricas_camara_fria_delete_permitidos on public.fabricas_camara_fria;
create policy fabricas_camara_fria_delete_permitidos
on public.fabricas_camara_fria
for delete
to authenticated
using (true);

drop policy if exists estoque_camara_fria_select_permitidos on public.estoque_camara_fria;
create policy estoque_camara_fria_select_permitidos
on public.estoque_camara_fria
for select
to authenticated
using (true);

drop policy if exists estoque_camara_fria_insert_permitidos on public.estoque_camara_fria;
create policy estoque_camara_fria_insert_permitidos
on public.estoque_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists estoque_camara_fria_update_permitidos on public.estoque_camara_fria;
create policy estoque_camara_fria_update_permitidos
on public.estoque_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists estoque_camara_fria_delete_permitidos on public.estoque_camara_fria;
create policy estoque_camara_fria_delete_permitidos
on public.estoque_camara_fria
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
