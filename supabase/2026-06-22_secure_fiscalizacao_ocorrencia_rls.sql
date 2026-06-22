-- Protecao de acesso para fiscalizacao-ocorrencia.html/mobile e anexos.
-- Execute no SQL Editor do Supabase.

create or replace function public.usuario_pode_acessar_pagina(p_pagina text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    left join public.nivel_permissoes np
      on lower(np.nivel) = lower(u.nivel)
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and (
        lower(u.nivel) = 'administrador'
        or p_pagina = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
  );
$$;

create or replace function public.usuario_pode_acessar_fiscalizacao_ocorrencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('fiscalizacao-ocorrencia.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-ocorrencia-mobile.html');
$$;

create or replace function public.usuario_pode_excluir_fiscalizacao_ocorrencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia')
      and public.usuario_pode_acessar_fiscalizacao_ocorrencia()
  );
$$;

create or replace function public.usuario_pode_acessar_filial_fiscalizacao(p_filial text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and public.usuario_pode_acessar_fiscalizacao_ocorrencia()
      and (
        coalesce(nullif(trim(u.filial), ''), '') = ''
        or upper(trim(u.filial)) = upper(trim(coalesce(p_filial, '')))
      )
  );
$$;

create or replace function public.usuario_pode_ler_funcionarios_fiscalizacao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_fiscalizacao_ocorrencia();
$$;

revoke all on table public.fiscalizacao_ocorrencias from anon;
revoke all on table public.fiscalizacao_ocorrencias_anexos from anon;
grant select, insert, update, delete on table public.fiscalizacao_ocorrencias to authenticated;
grant select, insert, update, delete on table public.fiscalizacao_ocorrencias_anexos to authenticated;
grant select on table public.funcionario to authenticated;

alter table public.fiscalizacao_ocorrencias enable row level security;
alter table public.fiscalizacao_ocorrencias_anexos enable row level security;
alter table public.funcionario enable row level security;

drop policy if exists "Permitir leitura fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
drop policy if exists "Permitir inserir fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
drop policy if exists "Permitir atualizar fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
drop policy if exists "Permitir excluir fiscalizacao ocorrencias" on public.fiscalizacao_ocorrencias;
drop policy if exists fiscalizacao_ocorrencias_select_permitidos on public.fiscalizacao_ocorrencias;
drop policy if exists fiscalizacao_ocorrencias_insert_permitidos on public.fiscalizacao_ocorrencias;
drop policy if exists fiscalizacao_ocorrencias_update_permitidos on public.fiscalizacao_ocorrencias;
drop policy if exists fiscalizacao_ocorrencias_delete_permitidos on public.fiscalizacao_ocorrencias;

create policy fiscalizacao_ocorrencias_select_permitidos
on public.fiscalizacao_ocorrencias
for select
to authenticated
using ((select public.usuario_pode_acessar_filial_fiscalizacao(filial)));

create policy fiscalizacao_ocorrencias_insert_permitidos
on public.fiscalizacao_ocorrencias
for insert
to authenticated
with check ((select public.usuario_pode_acessar_filial_fiscalizacao(filial)));

create policy fiscalizacao_ocorrencias_update_permitidos
on public.fiscalizacao_ocorrencias
for update
to authenticated
using ((select public.usuario_pode_acessar_filial_fiscalizacao(filial)))
with check ((select public.usuario_pode_acessar_filial_fiscalizacao(filial)));

create policy fiscalizacao_ocorrencias_delete_permitidos
on public.fiscalizacao_ocorrencias
for delete
to authenticated
using (
  (select public.usuario_pode_excluir_fiscalizacao_ocorrencia())
  and (select public.usuario_pode_acessar_filial_fiscalizacao(filial))
);

drop policy if exists "Permitir leitura fiscalizacao ocorrencias anexos" on public.fiscalizacao_ocorrencias_anexos;
drop policy if exists "Permitir inserir fiscalizacao ocorrencias anexos" on public.fiscalizacao_ocorrencias_anexos;
drop policy if exists "Permitir excluir fiscalizacao ocorrencias anexos" on public.fiscalizacao_ocorrencias_anexos;
drop policy if exists fiscalizacao_ocorrencias_anexos_select_permitidos on public.fiscalizacao_ocorrencias_anexos;
drop policy if exists fiscalizacao_ocorrencias_anexos_insert_permitidos on public.fiscalizacao_ocorrencias_anexos;
drop policy if exists fiscalizacao_ocorrencias_anexos_delete_permitidos on public.fiscalizacao_ocorrencias_anexos;

create policy fiscalizacao_ocorrencias_anexos_select_permitidos
on public.fiscalizacao_ocorrencias_anexos
for select
to authenticated
using (
  exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id = ocorrencia_id
      and (select public.usuario_pode_acessar_filial_fiscalizacao(o.filial))
  )
);

create policy fiscalizacao_ocorrencias_anexos_insert_permitidos
on public.fiscalizacao_ocorrencias_anexos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id = ocorrencia_id
      and (select public.usuario_pode_acessar_filial_fiscalizacao(o.filial))
  )
);

create policy fiscalizacao_ocorrencias_anexos_delete_permitidos
on public.fiscalizacao_ocorrencias_anexos
for delete
to authenticated
using (
  exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id = ocorrencia_id
      and (select public.usuario_pode_acessar_filial_fiscalizacao(o.filial))
  )
);

insert into storage.buckets (id, name, public)
values ('fiscalizacao_ocorrencias_anexos', 'fiscalizacao_ocorrencias_anexos', false)
on conflict (id) do update set public = false;

drop policy if exists "Permitir leitura storage fiscalizacao ocorrencias anexos" on storage.objects;
drop policy if exists "Permitir inserir storage fiscalizacao ocorrencias anexos" on storage.objects;
drop policy if exists "Permitir excluir storage fiscalizacao ocorrencias anexos" on storage.objects;
drop policy if exists fiscalizacao_ocorrencias_storage_select_permitidos on storage.objects;
drop policy if exists fiscalizacao_ocorrencias_storage_insert_permitidos on storage.objects;
drop policy if exists fiscalizacao_ocorrencias_storage_delete_permitidos on storage.objects;

create policy fiscalizacao_ocorrencias_storage_select_permitidos
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fiscalizacao_ocorrencias_anexos'
  and exists (
    select 1
    from public.fiscalizacao_ocorrencias_anexos a
    join public.fiscalizacao_ocorrencias o on o.id = a.ocorrencia_id
    where a.caminho_arquivo = storage.objects.name
      and (select public.usuario_pode_acessar_filial_fiscalizacao(o.filial))
  )
);

create policy fiscalizacao_ocorrencias_storage_insert_permitidos
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fiscalizacao_ocorrencias_anexos'
  and exists (
    select 1
    from public.fiscalizacao_ocorrencias o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and (select public.usuario_pode_acessar_filial_fiscalizacao(o.filial))
  )
);

create policy fiscalizacao_ocorrencias_storage_delete_permitidos
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fiscalizacao_ocorrencias_anexos'
  and exists (
    select 1
    from public.fiscalizacao_ocorrencias_anexos a
    join public.fiscalizacao_ocorrencias o on o.id = a.ocorrencia_id
    where a.caminho_arquivo = storage.objects.name
      and (select public.usuario_pode_acessar_filial_fiscalizacao(o.filial))
  )
);

drop policy if exists funcionario_select_fiscalizacao_ocorrencia on public.funcionario;
create policy funcionario_select_fiscalizacao_ocorrencia
on public.funcionario
for select
to authenticated
using ((select public.usuario_pode_ler_funcionarios_fiscalizacao()));

create index if not exists idx_fiscalizacao_ocorrencias_data
on public.fiscalizacao_ocorrencias (data_ocorrencia);

create index if not exists idx_fiscalizacao_ocorrencias_filial
on public.fiscalizacao_ocorrencias (filial);

create index if not exists idx_fiscalizacao_ocorrencias_placa
on public.fiscalizacao_ocorrencias (placa);

create index if not exists idx_fiscalizacao_ocorrencias_rota
on public.fiscalizacao_ocorrencias (rota);

create index if not exists idx_fiscalizacao_ocorrencias_anexos_ocorrencia
on public.fiscalizacao_ocorrencias_anexos (ocorrencia_id);

notify pgrst, 'reload schema';
