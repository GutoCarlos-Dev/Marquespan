-- Protecao da tabela filiais.
-- Execute no SQL Editor do Supabase.
-- Regra:
-- - usuarios autenticados podem ler filiais para preencher filtros/combos;
-- - somente administrador pode inserir, alterar ou excluir filiais.

create or replace function public.usuario_e_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id::text = auth.uid()::text
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) = 'administrador'
  );
$$;

alter table public.filiais enable row level security;

drop policy if exists filiais_select_authenticated on public.filiais;
create policy filiais_select_authenticated
on public.filiais
for select
to authenticated
using (true);

drop policy if exists filiais_insert_admin on public.filiais;
create policy filiais_insert_admin
on public.filiais
for insert
to authenticated
with check (public.usuario_e_administrador());

drop policy if exists filiais_update_admin on public.filiais;
create policy filiais_update_admin
on public.filiais
for update
to authenticated
using (public.usuario_e_administrador())
with check (public.usuario_e_administrador());

drop policy if exists filiais_delete_admin on public.filiais;
create policy filiais_delete_admin
on public.filiais
for delete
to authenticated
using (public.usuario_e_administrador());
