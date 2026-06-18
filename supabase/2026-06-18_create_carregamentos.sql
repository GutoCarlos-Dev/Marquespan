-- =============================================================
-- Tabela: saidas_carregamento
-- Registra cada saída de veículo vinculada às requisições
-- (Nome distinto de "carregamentos" que já existe no módulo de frota)
-- =============================================================

create table if not exists public.saidas_carregamento (
  id                 uuid        primary key default gen_random_uuid(),
  placa              text        not null,
  modelo_veiculo     text,
  motorista          text        not null,
  data_saida         date        not null,
  usuario            text,
  total_requisicoes  integer     not null default 0,
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Colunas com add column if not exists (idempotente — pode reexecutar sem erro)
alter table public.saidas_carregamento add column if not exists modelo_veiculo    text;
alter table public.saidas_carregamento add column if not exists usuario           text;
alter table public.saidas_carregamento add column if not exists total_requisicoes integer default 0;
alter table public.saidas_carregamento add column if not exists observacoes       text;

-- =============================================================
-- Colunas novas na tabela requisicoes_carregamento
-- vinculam cada requisição à saída que a carregou
-- =============================================================

alter table public.requisicoes_carregamento
  add column if not exists carregamento_id        uuid references public.saidas_carregamento(id) on delete set null,
  add column if not exists carregamento_placa      text,
  add column if not exists carregamento_motorista  text,
  add column if not exists carregamento_data_saida date,
  add column if not exists carregamento_modelo     text;

-- =============================================================
-- Índices
-- =============================================================

create index if not exists idx_saidas_carregamento_placa
  on public.saidas_carregamento (placa);

create index if not exists idx_saidas_carregamento_data_saida
  on public.saidas_carregamento (data_saida desc);

create index if not exists idx_saidas_carregamento_motorista
  on public.saidas_carregamento (motorista);

create index if not exists idx_saidas_carregamento_created_at
  on public.saidas_carregamento (created_at desc);

create index if not exists idx_requisicoes_carregamento_saida_id
  on public.requisicoes_carregamento (carregamento_id);

-- =============================================================
-- Trigger: mantém updated_at atualizado
-- =============================================================

create or replace function public.update_saidas_carregamento_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_saidas_carregamento_updated_at on public.saidas_carregamento;
create trigger trg_saidas_carregamento_updated_at
before update on public.saidas_carregamento
for each row
execute function public.update_saidas_carregamento_updated_at();

-- =============================================================
-- Permissões explícitas ao role authenticated
-- =============================================================

grant select, insert, update, delete on table public.saidas_carregamento to authenticated;

-- =============================================================
-- Row Level Security
-- =============================================================

alter table public.saidas_carregamento enable row level security;

-- SELECT
drop policy if exists "saidas_carregamento_select_permitidos" on public.saidas_carregamento;
create policy "saidas_carregamento_select_permitidos"
  on public.saidas_carregamento
  for select
  to authenticated
  using (true);

-- INSERT
drop policy if exists "saidas_carregamento_insert_permitidos" on public.saidas_carregamento;
create policy "saidas_carregamento_insert_permitidos"
  on public.saidas_carregamento
  for insert
  to authenticated
  with check (true);

-- UPDATE
drop policy if exists "saidas_carregamento_update_permitidos" on public.saidas_carregamento;
create policy "saidas_carregamento_update_permitidos"
  on public.saidas_carregamento
  for update
  to authenticated
  using (true)
  with check (true);

-- DELETE
drop policy if exists "saidas_carregamento_delete_permitidos" on public.saidas_carregamento;
create policy "saidas_carregamento_delete_permitidos"
  on public.saidas_carregamento
  for delete
  to authenticated
  using (true);

-- =============================================================
-- Notifica PostgREST para recarregar o schema
-- =============================================================

notify pgrst, 'reload schema';
