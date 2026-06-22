-- Protecao de acesso para tacografo.html e tabela tacografos.
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

create or replace function public.usuario_pode_acessar_tacografo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('tacografo.html');
$$;

revoke all on table public.tacografos from anon;
grant select, insert, update, delete on table public.tacografos to authenticated;

alter table public.tacografos enable row level security;

drop policy if exists tacografos_select_permitidos on public.tacografos;
drop policy if exists tacografos_insert_permitidos on public.tacografos;
drop policy if exists tacografos_update_permitidos on public.tacografos;
drop policy if exists tacografos_delete_permitidos on public.tacografos;

create policy tacografos_select_permitidos
on public.tacografos
for select
to authenticated
using ((select public.usuario_pode_acessar_tacografo()));

create policy tacografos_insert_permitidos
on public.tacografos
for insert
to authenticated
with check ((select public.usuario_pode_acessar_tacografo()));

create policy tacografos_update_permitidos
on public.tacografos
for update
to authenticated
using ((select public.usuario_pode_acessar_tacografo()))
with check ((select public.usuario_pode_acessar_tacografo()));

create policy tacografos_delete_permitidos
on public.tacografos
for delete
to authenticated
using ((select public.usuario_pode_acessar_tacografo()));

create index if not exists idx_tacografos_placa
on public.tacografos (placa);

create index if not exists idx_veiculos_placa
on public.veiculos (placa);

create index if not exists idx_veiculos_filial
on public.veiculos (filial);

notify pgrst, 'reload schema';
