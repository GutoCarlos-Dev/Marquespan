create table if not exists public.requisicoes_carregamento (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  supervisor text,
  cliente_codigo text,
  cliente_nome text,
  motivo text,
  ordem text,
  data_requisicao date,
  usuario text,
  arquivo_path text,
  arquivo_tipo text,
  arquivo_tamanho bigint,
  status text not null default 'PENDENTE',
  itens jsonb not null default '[]'::jsonb,
  linhas jsonb not null default '[]'::jsonb,
  cliente_planilha jsonb not null default '{}'::jsonb,
  carregado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requisicoes_carregamento_status_check
    check (status in ('PENDENTE', 'CARREGADO'))
);

create index if not exists idx_requisicoes_carregamento_supervisor
  on public.requisicoes_carregamento (supervisor);

create index if not exists idx_requisicoes_carregamento_cliente_codigo
  on public.requisicoes_carregamento (cliente_codigo);

alter table public.requisicoes_carregamento
  drop column if exists cliente_id;

alter table public.requisicoes_carregamento
  add column if not exists data_requisicao date,
  add column if not exists usuario text,
  add column if not exists arquivo_path text,
  add column if not exists arquivo_tipo text,
  add column if not exists arquivo_tamanho bigint;

create index if not exists idx_requisicoes_carregamento_status
  on public.requisicoes_carregamento (status);

create index if not exists idx_requisicoes_carregamento_created_at
  on public.requisicoes_carregamento (created_at desc);

create index if not exists idx_requisicoes_carregamento_data_requisicao
  on public.requisicoes_carregamento (data_requisicao desc);

alter table public.requisicoes_carregamento enable row level security;

drop policy if exists "Permitir leitura requisicoes carregamento" on public.requisicoes_carregamento;
create policy "Permitir leitura requisicoes carregamento"
  on public.requisicoes_carregamento
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Permitir inserir requisicoes carregamento" on public.requisicoes_carregamento;
create policy "Permitir inserir requisicoes carregamento"
  on public.requisicoes_carregamento
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Permitir atualizar requisicoes carregamento" on public.requisicoes_carregamento;
create policy "Permitir atualizar requisicoes carregamento"
  on public.requisicoes_carregamento
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Permitir excluir requisicoes carregamento" on public.requisicoes_carregamento;
create policy "Permitir excluir requisicoes carregamento"
  on public.requisicoes_carregamento
  for delete
  using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('requisicoes-carregamento', 'requisicoes-carregamento', false)
on conflict (id) do nothing;

drop policy if exists "Requisicoes carregamento anexos leitura" on storage.objects;
create policy "Requisicoes carregamento anexos leitura"
  on storage.objects
  for select
  using (bucket_id = 'requisicoes-carregamento' and auth.role() = 'authenticated');

drop policy if exists "Requisicoes carregamento anexos inserir" on storage.objects;
create policy "Requisicoes carregamento anexos inserir"
  on storage.objects
  for insert
  with check (bucket_id = 'requisicoes-carregamento' and auth.role() = 'authenticated');

drop policy if exists "Requisicoes carregamento anexos atualizar" on storage.objects;
create policy "Requisicoes carregamento anexos atualizar"
  on storage.objects
  for update
  using (bucket_id = 'requisicoes-carregamento' and auth.role() = 'authenticated')
  with check (bucket_id = 'requisicoes-carregamento' and auth.role() = 'authenticated');

drop policy if exists "Requisicoes carregamento anexos excluir" on storage.objects;
create policy "Requisicoes carregamento anexos excluir"
  on storage.objects
  for delete
  using (bucket_id = 'requisicoes-carregamento' and auth.role() = 'authenticated');

create or replace function public.update_requisicoes_carregamento_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_requisicoes_carregamento_updated_at on public.requisicoes_carregamento;
create trigger trg_requisicoes_carregamento_updated_at
before update on public.requisicoes_carregamento
for each row
execute function public.update_requisicoes_carregamento_updated_at();
