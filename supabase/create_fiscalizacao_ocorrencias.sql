create extension if not exists "pgcrypto";

create table if not exists public.fiscalizacao_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  data_ocorrencia date not null,
  hora_ocorrencia time,
  filial text,
  rota text not null,
  placa text not null,
  motorista text not null,
  auxiliar text,
  local_ocorrencia text,
  envolvimento jsonb not null default '{}'::jsonb,
  relatorio text not null,
  usuario_id text,
  usuario_nome text not null,
  usuario_inclusao_id text,
  usuario_inclusao_nome text,
  usuario_edicao_id text,
  usuario_edicao_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiscalizacao_ocorrencias
  add column if not exists hora_ocorrencia time;

alter table public.fiscalizacao_ocorrencias
  add column if not exists filial text;

alter table public.fiscalizacao_ocorrencias
  add column if not exists local_ocorrencia text;

alter table public.fiscalizacao_ocorrencias
  add column if not exists envolvimento jsonb not null default '{}'::jsonb;

alter table public.fiscalizacao_ocorrencias
  add column if not exists usuario_inclusao_id text;

alter table public.fiscalizacao_ocorrencias
  add column if not exists usuario_inclusao_nome text;

alter table public.fiscalizacao_ocorrencias
  add column if not exists usuario_edicao_id text;

alter table public.fiscalizacao_ocorrencias
  add column if not exists usuario_edicao_nome text;

update public.fiscalizacao_ocorrencias
set
  usuario_inclusao_id = coalesce(usuario_inclusao_id, usuario_id),
  usuario_inclusao_nome = coalesce(usuario_inclusao_nome, usuario_nome)
where usuario_inclusao_nome is null
   or usuario_inclusao_id is null;

create table if not exists public.fiscalizacao_ocorrencias_anexos (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.fiscalizacao_ocorrencias(id) on delete cascade,
  nome_arquivo text not null,
  caminho_arquivo text not null,
  tipo_arquivo text,
  tamanho_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_fiscalizacao_ocorrencias_anexos_ocorrencia
  on public.fiscalizacao_ocorrencias_anexos (ocorrencia_id);

create index if not exists idx_fiscalizacao_ocorrencias_data
  on public.fiscalizacao_ocorrencias (data_ocorrencia);

create index if not exists idx_fiscalizacao_ocorrencias_placa
  on public.fiscalizacao_ocorrencias (placa);

create index if not exists idx_fiscalizacao_ocorrencias_motorista
  on public.fiscalizacao_ocorrencias (motorista);

create index if not exists idx_fiscalizacao_ocorrencias_rota
  on public.fiscalizacao_ocorrencias (rota);

create index if not exists idx_fiscalizacao_ocorrencias_filial
  on public.fiscalizacao_ocorrencias (filial);

update public.fiscalizacao_ocorrencias o
set filial = v.filial
from public.veiculos v
where (o.filial is null or trim(o.filial) = '')
  and v.filial is not null
  and trim(v.filial) <> ''
  and upper(trim(o.placa)) = upper(trim(v.placa));

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
alter table public.fiscalizacao_ocorrencias_anexos enable row level security;

create or replace function public.usuario_tem_acesso_filial(filial_alvo text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (
        coalesce(nullif(trim(u.filial), ''), '') = ''
        or upper(trim(u.filial)) = upper(trim(coalesce(filial_alvo, '')))
      )
  );
$$;

drop policy if exists "Permitir leitura fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir leitura fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for select
using (public.usuario_tem_acesso_filial(filial));

drop policy if exists "Permitir inserir fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir inserir fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for insert
with check (public.usuario_tem_acesso_filial(filial));

drop policy if exists "Permitir atualizar fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir atualizar fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for update
using (public.usuario_tem_acesso_filial(filial))
with check (public.usuario_tem_acesso_filial(filial));

drop policy if exists "Permitir excluir fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
create policy "Permitir excluir fiscalizacao ocorrencias"
on public.fiscalizacao_ocorrencias
for delete
using (public.usuario_tem_acesso_filial(filial));

drop policy if exists "Permitir leitura fiscalizacao ocorrencias anexos" on public.fiscalizacao_ocorrencias_anexos;
create policy "Permitir leitura fiscalizacao ocorrencias anexos"
on public.fiscalizacao_ocorrencias_anexos
for select
using (
  exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id = ocorrencia_id
      and public.usuario_tem_acesso_filial(o.filial)
  )
);

drop policy if exists "Permitir inserir fiscalizacao ocorrencias anexos" on public.fiscalizacao_ocorrencias_anexos;
create policy "Permitir inserir fiscalizacao ocorrencias anexos"
on public.fiscalizacao_ocorrencias_anexos
for insert
with check (
  exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id = ocorrencia_id
      and public.usuario_tem_acesso_filial(o.filial)
  )
);

drop policy if exists "Permitir excluir fiscalizacao ocorrencias anexos" on public.fiscalizacao_ocorrencias_anexos;
create policy "Permitir excluir fiscalizacao ocorrencias anexos"
on public.fiscalizacao_ocorrencias_anexos
for delete
using (
  exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id = ocorrencia_id
      and public.usuario_tem_acesso_filial(o.filial)
  )
);

insert into storage.buckets (id, name, public)
values ('fiscalizacao_ocorrencias_anexos', 'fiscalizacao_ocorrencias_anexos', false)
on conflict (id) do nothing;

drop policy if exists "Permitir leitura storage fiscalizacao ocorrencias anexos" on storage.objects;
create policy "Permitir leitura storage fiscalizacao ocorrencias anexos"
on storage.objects
for select
using (
  bucket_id = 'fiscalizacao_ocorrencias_anexos'
  and exists (
    select 1
    from public.fiscalizacao_ocorrencias_anexos a
    join public.fiscalizacao_ocorrencias o on o.id = a.ocorrencia_id
    where a.caminho_arquivo = storage.objects.name
      and public.usuario_tem_acesso_filial(o.filial)
  )
);

drop policy if exists "Permitir inserir storage fiscalizacao ocorrencias anexos" on storage.objects;
create policy "Permitir inserir storage fiscalizacao ocorrencias anexos"
on storage.objects
for insert
with check (
  bucket_id = 'fiscalizacao_ocorrencias_anexos'
  and exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and public.usuario_tem_acesso_filial(o.filial)
  )
);

drop policy if exists "Permitir excluir storage fiscalizacao ocorrencias anexos" on storage.objects;
create policy "Permitir excluir storage fiscalizacao ocorrencias anexos"
on storage.objects
for delete
using (
  bucket_id = 'fiscalizacao_ocorrencias_anexos'
  and exists (
    select 1
    from public.fiscalizacao_ocorrencias_anexos a
    join public.fiscalizacao_ocorrencias o on o.id = a.ocorrencia_id
    where a.caminho_arquivo = storage.objects.name
      and public.usuario_tem_acesso_filial(o.filial)
  )
);
