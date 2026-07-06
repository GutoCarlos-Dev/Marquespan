-- Carregamento da Camara Fria comparado com a ultima contagem realizada.
-- Execute no SQL Editor do Supabase.

create table if not exists public.carregamentos_camara_fria (
    id uuid primary key default gen_random_uuid(),
    filial text not null,
    fabrica_id uuid not null references public.fabricas_camara_fria(id) on update cascade on delete restrict,
    data_carregamento date not null default current_date,
    contagem_referencia_id uuid references public.contagens_camara_fria(id) on update cascade on delete set null,
    usuario text,
    observacao text,
    status text not null default 'ABERTO',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint carregamentos_camara_fria_status_check check (status in ('ABERTO', 'FINALIZADO'))
);

create table if not exists public.carregamento_camara_fria_itens (
    id uuid primary key default gen_random_uuid(),
    carregamento_id uuid not null references public.carregamentos_camara_fria(id) on update cascade on delete cascade,
    produto_id uuid not null references public.produtos_camara_fria(id) on update cascade on delete restrict,
    quantidade_necessaria_caixas integer not null default 0 check (quantidade_necessaria_caixas >= 0),
    estoque_contagem_caixas integer not null default 0 check (estoque_contagem_caixas >= 0),
    diferenca_caixas integer not null default 0,
    observacao text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint carregamento_camara_fria_itens_unico unique (carregamento_id, produto_id)
);

create index if not exists idx_carregamentos_camara_fria_filial_data
    on public.carregamentos_camara_fria (filial, data_carregamento desc);

create index if not exists idx_carregamentos_camara_fria_fabrica
    on public.carregamentos_camara_fria (fabrica_id);

create index if not exists idx_carregamento_camara_fria_itens_carregamento
    on public.carregamento_camara_fria_itens (carregamento_id);

grant select, insert, update, delete on table public.carregamentos_camara_fria to authenticated;
grant select, insert, update, delete on table public.carregamento_camara_fria_itens to authenticated;

alter table public.carregamentos_camara_fria enable row level security;
alter table public.carregamento_camara_fria_itens enable row level security;

drop policy if exists carregamentos_camara_fria_select_permitidos on public.carregamentos_camara_fria;
create policy carregamentos_camara_fria_select_permitidos
on public.carregamentos_camara_fria
for select
to authenticated
using (true);

drop policy if exists carregamentos_camara_fria_insert_permitidos on public.carregamentos_camara_fria;
create policy carregamentos_camara_fria_insert_permitidos
on public.carregamentos_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists carregamentos_camara_fria_update_permitidos on public.carregamentos_camara_fria;
create policy carregamentos_camara_fria_update_permitidos
on public.carregamentos_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists carregamentos_camara_fria_delete_permitidos on public.carregamentos_camara_fria;
create policy carregamentos_camara_fria_delete_permitidos
on public.carregamentos_camara_fria
for delete
to authenticated
using (true);

drop policy if exists carregamento_camara_fria_itens_select_permitidos on public.carregamento_camara_fria_itens;
create policy carregamento_camara_fria_itens_select_permitidos
on public.carregamento_camara_fria_itens
for select
to authenticated
using (true);

drop policy if exists carregamento_camara_fria_itens_insert_permitidos on public.carregamento_camara_fria_itens;
create policy carregamento_camara_fria_itens_insert_permitidos
on public.carregamento_camara_fria_itens
for insert
to authenticated
with check (true);

drop policy if exists carregamento_camara_fria_itens_update_permitidos on public.carregamento_camara_fria_itens;
create policy carregamento_camara_fria_itens_update_permitidos
on public.carregamento_camara_fria_itens
for update
to authenticated
using (true)
with check (true);

drop policy if exists carregamento_camara_fria_itens_delete_permitidos on public.carregamento_camara_fria_itens;
create policy carregamento_camara_fria_itens_delete_permitidos
on public.carregamento_camara_fria_itens
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
