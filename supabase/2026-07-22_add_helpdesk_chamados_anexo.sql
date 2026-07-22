-- Anexo (print do erro) nos chamados do HelpDesk.
-- Execute no SQL Editor do Supabase, DEPOIS de 2026-07-22_create_helpdesk.sql.

alter table public.helpdesk_chamados
  add column if not exists anexo_path text,
  add column if not exists anexo_nome text,
  add column if not exists anexo_tipo text,
  add column if not exists anexo_tamanho bigint;

-- Bucket privado — o download só é permitido a quem abriu o chamado ou ao Suporte
-- (administrador/tecnologia), via as policies de storage.objects abaixo.
insert into storage.buckets (id, name, public)
values ('helpdesk_anexos', 'helpdesk_anexos', false)
on conflict (id) do update set public = false;

drop policy if exists "helpdesk_anexos_storage_select" on storage.objects;
create policy "helpdesk_anexos_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'helpdesk_anexos'
  and (owner = auth.uid() or (select public.usuario_e_administrador_ou_tecnologia()))
);

drop policy if exists "helpdesk_anexos_storage_insert" on storage.objects;
create policy "helpdesk_anexos_storage_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'helpdesk_anexos');

drop policy if exists "helpdesk_anexos_storage_delete" on storage.objects;
create policy "helpdesk_anexos_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'helpdesk_anexos'
  and (owner = auth.uid() or (select public.usuario_e_administrador_ou_tecnologia()))
);

notify pgrst, 'reload schema';
