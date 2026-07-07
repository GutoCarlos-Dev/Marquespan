create table if not exists public.carregamento_camara_fria_lancamentos (
    id uuid primary key default gen_random_uuid(),
    carregamento_id uuid not null references public.carregamentos_camara_fria(id) on update cascade on delete cascade,
    produto_id uuid not null references public.produtos_camara_fria(id) on update cascade on delete restrict,
    usuario text,
    quantidade_caixas integer not null check (quantidade_caixas > 0),
    observacao text,
    created_at timestamptz not null default now()
);

create index if not exists idx_carregamento_camara_fria_lancamentos_carregamento
    on public.carregamento_camara_fria_lancamentos (carregamento_id);

create index if not exists idx_carregamento_camara_fria_lancamentos_produto
    on public.carregamento_camara_fria_lancamentos (carregamento_id, produto_id);

grant select, insert, update, delete on public.carregamento_camara_fria_lancamentos to authenticated;

alter table public.carregamento_camara_fria_lancamentos enable row level security;

drop policy if exists carregamento_camara_fria_lancamentos_select on public.carregamento_camara_fria_lancamentos;
create policy carregamento_camara_fria_lancamentos_select
on public.carregamento_camara_fria_lancamentos
for select
to authenticated
using (true);

drop policy if exists carregamento_camara_fria_lancamentos_insert on public.carregamento_camara_fria_lancamentos;
create policy carregamento_camara_fria_lancamentos_insert
on public.carregamento_camara_fria_lancamentos
for insert
to authenticated
with check (true);

drop policy if exists carregamento_camara_fria_lancamentos_update on public.carregamento_camara_fria_lancamentos;
create policy carregamento_camara_fria_lancamentos_update
on public.carregamento_camara_fria_lancamentos
for update
to authenticated
using (true)
with check (true);

drop policy if exists carregamento_camara_fria_lancamentos_delete on public.carregamento_camara_fria_lancamentos;
create policy carregamento_camara_fria_lancamentos_delete
on public.carregamento_camara_fria_lancamentos
for delete
to authenticated
using (true);

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'carregamento_camara_fria_lancamentos'
       ) then
        alter publication supabase_realtime add table public.carregamento_camara_fria_lancamentos;
    end if;
end $$;

notify pgrst, 'reload schema';
