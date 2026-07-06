-- Contagem da Camara Fria por Filial, Semana e Fabrica.
-- Execute no SQL Editor do Supabase.

create table if not exists public.contagens_camara_fria (
    id uuid primary key default gen_random_uuid(),
    filial text not null,
    semana text not null,
    fabrica_id uuid not null references public.fabricas_camara_fria(id) on update cascade on delete restrict,
    funcionario text not null,
    status text not null default 'EM_ANDAMENTO',
    iniciada_em timestamptz not null default now(),
    finalizada_em timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint contagens_camara_fria_unica unique (filial, semana, fabrica_id),
    constraint contagens_camara_fria_semana_check check (semana ~ '^[0-9]{4}-W[0-9]{2}$'),
    constraint contagens_camara_fria_status_check check (status in ('EM_ANDAMENTO', 'FINALIZADA'))
);

create table if not exists public.contagem_camara_fria_itens (
    id uuid primary key default gen_random_uuid(),
    contagem_id uuid not null references public.contagens_camara_fria(id) on update cascade on delete cascade,
    produto_id uuid not null references public.produtos_camara_fria(id) on update cascade on delete restrict,
    quantidade_caixas integer not null default 0 check (quantidade_caixas >= 0),
    observacao text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint contagem_camara_fria_itens_unico unique (contagem_id, produto_id)
);

create index if not exists idx_contagens_camara_fria_filial_semana
    on public.contagens_camara_fria (filial, semana);

create index if not exists idx_contagens_camara_fria_fabrica
    on public.contagens_camara_fria (fabrica_id);

create index if not exists idx_contagem_camara_fria_itens_contagem
    on public.contagem_camara_fria_itens (contagem_id);

grant select, insert, update, delete on table public.contagens_camara_fria to authenticated;
grant select, insert, update, delete on table public.contagem_camara_fria_itens to authenticated;

alter table public.contagens_camara_fria enable row level security;
alter table public.contagem_camara_fria_itens enable row level security;

drop policy if exists contagens_camara_fria_select_permitidos on public.contagens_camara_fria;
create policy contagens_camara_fria_select_permitidos
on public.contagens_camara_fria
for select
to authenticated
using (true);

drop policy if exists contagens_camara_fria_insert_permitidos on public.contagens_camara_fria;
create policy contagens_camara_fria_insert_permitidos
on public.contagens_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists contagens_camara_fria_update_permitidos on public.contagens_camara_fria;
create policy contagens_camara_fria_update_permitidos
on public.contagens_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists contagens_camara_fria_delete_permitidos on public.contagens_camara_fria;
create policy contagens_camara_fria_delete_permitidos
on public.contagens_camara_fria
for delete
to authenticated
using (true);

drop policy if exists contagem_camara_fria_itens_select_permitidos on public.contagem_camara_fria_itens;
create policy contagem_camara_fria_itens_select_permitidos
on public.contagem_camara_fria_itens
for select
to authenticated
using (true);

drop policy if exists contagem_camara_fria_itens_insert_permitidos on public.contagem_camara_fria_itens;
create policy contagem_camara_fria_itens_insert_permitidos
on public.contagem_camara_fria_itens
for insert
to authenticated
with check (true);

drop policy if exists contagem_camara_fria_itens_update_permitidos on public.contagem_camara_fria_itens;
create policy contagem_camara_fria_itens_update_permitidos
on public.contagem_camara_fria_itens
for update
to authenticated
using (true)
with check (true);

drop policy if exists contagem_camara_fria_itens_delete_permitidos on public.contagem_camara_fria_itens;
create policy contagem_camara_fria_itens_delete_permitidos
on public.contagem_camara_fria_itens
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
