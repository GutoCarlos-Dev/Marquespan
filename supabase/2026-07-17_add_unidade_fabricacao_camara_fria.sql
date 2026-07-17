-- Unidade de Fabricacao dos produtos da Camara Fria: catalogo auxiliar (igual ao
-- Tipo, porem so com o campo Nome no cadastro) + coluna no produto.
-- Execute no SQL Editor do Supabase.

create table if not exists public.unidades_fabricacao_camara_fria (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint unidades_fabricacao_camara_fria_nome_unique unique (nome)
);

alter table public.produtos_camara_fria add column if not exists unidade_fabricacao text;

create index if not exists idx_produtos_camara_fria_unidade_fabricacao
    on public.produtos_camara_fria (unidade_fabricacao);

grant select, insert, update, delete on table public.unidades_fabricacao_camara_fria to authenticated;

alter table public.unidades_fabricacao_camara_fria enable row level security;

drop policy if exists unidades_fabricacao_camara_fria_select_permitidos on public.unidades_fabricacao_camara_fria;
create policy unidades_fabricacao_camara_fria_select_permitidos
on public.unidades_fabricacao_camara_fria
for select
to authenticated
using (true);

drop policy if exists unidades_fabricacao_camara_fria_insert_permitidos on public.unidades_fabricacao_camara_fria;
create policy unidades_fabricacao_camara_fria_insert_permitidos
on public.unidades_fabricacao_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists unidades_fabricacao_camara_fria_update_permitidos on public.unidades_fabricacao_camara_fria;
create policy unidades_fabricacao_camara_fria_update_permitidos
on public.unidades_fabricacao_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists unidades_fabricacao_camara_fria_delete_permitidos on public.unidades_fabricacao_camara_fria;
create policy unidades_fabricacao_camara_fria_delete_permitidos
on public.unidades_fabricacao_camara_fria
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
