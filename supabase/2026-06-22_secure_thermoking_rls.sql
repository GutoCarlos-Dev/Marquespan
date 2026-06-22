-- Protecao de acesso para thermoking.html e tabela thermoking.
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

create or replace function public.usuario_pode_acessar_thermoking()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('thermoking.html');
$$;

revoke all on table public.thermoking from anon;
grant select, insert, update, delete on table public.thermoking to authenticated;

alter table public.thermoking enable row level security;

drop policy if exists thermoking_select_permitidos on public.thermoking;
drop policy if exists thermoking_insert_permitidos on public.thermoking;
drop policy if exists thermoking_update_permitidos on public.thermoking;
drop policy if exists thermoking_delete_permitidos on public.thermoking;

create policy thermoking_select_permitidos
on public.thermoking
for select
to authenticated
using ((select public.usuario_pode_acessar_thermoking()));

create policy thermoking_insert_permitidos
on public.thermoking
for insert
to authenticated
with check ((select public.usuario_pode_acessar_thermoking()));

create policy thermoking_update_permitidos
on public.thermoking
for update
to authenticated
using ((select public.usuario_pode_acessar_thermoking()))
with check ((select public.usuario_pode_acessar_thermoking()));

create policy thermoking_delete_permitidos
on public.thermoking
for delete
to authenticated
using ((select public.usuario_pode_acessar_thermoking()));

create index if not exists idx_thermoking_filial
on public.thermoking (filial);

create index if not exists idx_thermoking_numero_serie
on public.thermoking (numero_serie);

create index if not exists idx_thermoking_placa_vinculada
on public.thermoking (placa_vinculada);

notify pgrst, 'reload schema';
