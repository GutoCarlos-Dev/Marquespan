create extension if not exists "pgcrypto";

create table if not exists public.fiscalizacao_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  data_ocorrencia date not null,
  rota text not null,
  placa text not null,
  motorista text not null,
  auxiliar text,
  relatorio text not null,
  usuario_id text,
  usuario_nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fiscalizacao_ocorrencias_data
  on public.fiscalizacao_ocorrencias (data_ocorrencia);

create index if not exists idx_fiscalizacao_ocorrencias_placa
  on public.fiscalizacao_ocorrencias (placa);

create index if not exists idx_fiscalizacao_ocorrencias_motorista
  on public.fiscalizacao_ocorrencias (motorista);

create index if not exists idx_fiscalizacao_ocorrencias_rota
  on public.fiscalizacao_ocorrencias (rota);

create or replace function public.update_fiscalizacao_ocorrencias_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_fiscalizacao_ocorrencias_updated_at on public.fiscalizacao_ocorrencias;
create trigger trg_fiscalizacao_ocorrencias_updated_at
before update on public.fiscalizacao_ocorrencias
for each row
execute function public.update_fiscalizacao_ocorrencias_updated_at();

alter table public.fiscalizacao_ocorrencias enable row level security;

drop policy if exists "Permitir leitura fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir leitura fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for select
using (true);

drop policy if exists "Permitir inserir fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir inserir fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for insert
with check (true);

drop policy if exists "Permitir atualizar fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir atualizar fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for update
using (true)
with check (true);
