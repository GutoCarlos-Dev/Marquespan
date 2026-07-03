-- Cadastro de produtos da Camara Fria: catalogo de tipos + produtos (peso da caixa em KG)

create table if not exists public.tipos_produto_camara_fria (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tipos_produto_camara_fria_nome_unique unique (nome)
);

create table if not exists public.produtos_camara_fria (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    tipo text,
    peso_caixa numeric(10,3),
    filial text,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Colunas adicionadas apos a criacao inicial da tabela (idempotente para quem ja rodou a versao antiga).
alter table public.produtos_camara_fria add column if not exists codigo text;
alter table public.produtos_camara_fria add column if not exists caixas_por_palete integer;

-- filial em branco (null) significa "Todas as Filiais". Unicidade do codigo
-- trata null e '' como o mesmo grupo (coalesce), evitando codigos duplicados
-- tanto dentro de uma filial quanto entre produtos cadastrados para todas.
create unique index if not exists idx_produtos_camara_fria_codigo_filial_unique
    on public.produtos_camara_fria (coalesce(filial, ''), codigo);

create index if not exists idx_produtos_camara_fria_filial on public.produtos_camara_fria (filial);
create index if not exists idx_produtos_camara_fria_tipo on public.produtos_camara_fria (tipo);
create index if not exists idx_produtos_camara_fria_nome on public.produtos_camara_fria (nome);
create index if not exists idx_produtos_camara_fria_codigo on public.produtos_camara_fria (codigo);

grant select, insert, update, delete on table public.tipos_produto_camara_fria to authenticated;
grant select, insert, update, delete on table public.produtos_camara_fria to authenticated;

alter table public.tipos_produto_camara_fria enable row level security;
alter table public.produtos_camara_fria enable row level security;

drop policy if exists tipos_produto_camara_fria_select_permitidos on public.tipos_produto_camara_fria;
create policy tipos_produto_camara_fria_select_permitidos
on public.tipos_produto_camara_fria
for select
to authenticated
using (true);

drop policy if exists tipos_produto_camara_fria_insert_permitidos on public.tipos_produto_camara_fria;
create policy tipos_produto_camara_fria_insert_permitidos
on public.tipos_produto_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists tipos_produto_camara_fria_update_permitidos on public.tipos_produto_camara_fria;
create policy tipos_produto_camara_fria_update_permitidos
on public.tipos_produto_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists tipos_produto_camara_fria_delete_permitidos on public.tipos_produto_camara_fria;
create policy tipos_produto_camara_fria_delete_permitidos
on public.tipos_produto_camara_fria
for delete
to authenticated
using (true);

drop policy if exists produtos_camara_fria_select_permitidos on public.produtos_camara_fria;
create policy produtos_camara_fria_select_permitidos
on public.produtos_camara_fria
for select
to authenticated
using (true);

drop policy if exists produtos_camara_fria_insert_permitidos on public.produtos_camara_fria;
create policy produtos_camara_fria_insert_permitidos
on public.produtos_camara_fria
for insert
to authenticated
with check (true);

drop policy if exists produtos_camara_fria_update_permitidos on public.produtos_camara_fria;
create policy produtos_camara_fria_update_permitidos
on public.produtos_camara_fria
for update
to authenticated
using (true)
with check (true);

drop policy if exists produtos_camara_fria_delete_permitidos on public.produtos_camara_fria;
create policy produtos_camara_fria_delete_permitidos
on public.produtos_camara_fria
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
