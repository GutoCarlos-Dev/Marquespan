create table if not exists public.item_modelos (
  id uuid primary key default gen_random_uuid(),
  item_id integer not null references public.itens(id) on delete cascade,
  modelo text not null,
  created_at timestamptz not null default now(),
  constraint item_modelos_item_modelo_unique unique (item_id, modelo)
);

create index if not exists idx_item_modelos_item_id
  on public.item_modelos (item_id);

create index if not exists idx_item_modelos_modelo
  on public.item_modelos (modelo);

alter table public.itens
  drop column if exists modelo;

grant select, insert, update, delete on table public.item_modelos to authenticated;

alter table public.item_modelos enable row level security;

drop policy if exists "item_modelos_select_permitidos" on public.item_modelos;
create policy "item_modelos_select_permitidos"
  on public.item_modelos
  for select
  to authenticated
  using (true);

drop policy if exists "item_modelos_insert_permitidos" on public.item_modelos;
create policy "item_modelos_insert_permitidos"
  on public.item_modelos
  for insert
  to authenticated
  with check (true);

drop policy if exists "item_modelos_update_permitidos" on public.item_modelos;
create policy "item_modelos_update_permitidos"
  on public.item_modelos
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "item_modelos_delete_permitidos" on public.item_modelos;
create policy "item_modelos_delete_permitidos"
  on public.item_modelos
  for delete
  to authenticated
  using (true);

notify pgrst, 'reload schema';
