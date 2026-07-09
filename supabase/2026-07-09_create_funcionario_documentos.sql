-- Documentos anexos do cadastro de funcionarios.
-- Execute no SQL Editor do Supabase antes de usar o campo "Anexar Documentos".

create table if not exists public.funcionario_documentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id bigint not null references public.funcionario(id) on delete cascade,
  nome_arquivo text not null,
  caminho_arquivo text not null unique,
  tipo_arquivo text,
  tamanho bigint,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_funcionario_documentos_funcionario
on public.funcionario_documentos (funcionario_id, created_at desc);

alter table public.funcionario_documentos enable row level security;

grant select, insert, delete on table public.funcionario_documentos to authenticated;

drop policy if exists funcionario_documentos_select_permitidos on public.funcionario_documentos;
create policy funcionario_documentos_select_permitidos
on public.funcionario_documentos
for select
to authenticated
using (public.usuario_pode_acessar_pagina('funcionario.html'));

drop policy if exists funcionario_documentos_insert_admin on public.funcionario_documentos;
create policy funcionario_documentos_insert_admin
on public.funcionario_documentos
for insert
to authenticated
with check (public.usuario_pode_gerenciar_funcionarios());

drop policy if exists funcionario_documentos_delete_admin on public.funcionario_documentos;
create policy funcionario_documentos_delete_admin
on public.funcionario_documentos
for delete
to authenticated
using (public.usuario_pode_gerenciar_funcionarios());

insert into storage.buckets (id, name, public)
values ('funcionario_documentos', 'funcionario_documentos', false)
on conflict (id) do update set public = false;

drop policy if exists "funcionario_documentos_storage_select" on storage.objects;
create policy "funcionario_documentos_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'funcionario_documentos'
  and public.usuario_pode_acessar_pagina('funcionario.html')
);

drop policy if exists "funcionario_documentos_storage_insert" on storage.objects;
create policy "funcionario_documentos_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'funcionario_documentos'
  and public.usuario_pode_gerenciar_funcionarios()
);

drop policy if exists "funcionario_documentos_storage_delete" on storage.objects;
create policy "funcionario_documentos_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'funcionario_documentos'
  and public.usuario_pode_gerenciar_funcionarios()
);

notify pgrst, 'reload schema';
