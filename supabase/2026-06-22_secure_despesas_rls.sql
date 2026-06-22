-- Protecao de acesso para despesas.html e tabelas relacionadas.
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

create or replace function public.usuario_pode_ler_despesas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html');
$$;

create or replace function public.usuario_pode_editar_despesas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('despesas.html');
$$;

create or replace function public.usuario_pode_ler_hospedagem()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('hotel.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html');
$$;

create or replace function public.usuario_pode_editar_hoteis()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('hotel.html');
$$;

create or replace function public.usuario_pode_editar_quartos_hotel()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('hotel.html')
    or public.usuario_pode_acessar_pagina('despesas.html');
$$;

create or replace function public.usuario_pode_ler_funcionarios_despesas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('funcionario.html')
    or public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html');
$$;

do $$
declare
  tabela text;
  politica record;
begin
  foreach tabela in array array[
    'despesas',
    'hoteis',
    'hotel_quartos'
  ]
  loop
    if to_regclass('public.' || tabela) is not null then
      for politica in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = tabela
      loop
        execute format('drop policy if exists %I on public.%I', politica.policyname, tabela);
      end loop;
    end if;
  end loop;
end $$;

revoke all on table public.despesas from anon;
revoke all on table public.hoteis from anon;
revoke all on table public.hotel_quartos from anon;

grant select, insert, update, delete on table public.despesas to authenticated;
grant select, insert, update, delete on table public.hoteis to authenticated;
grant select, insert, update, delete on table public.hotel_quartos to authenticated;
grant select on table public.funcionario to authenticated;

alter table public.despesas enable row level security;
alter table public.hoteis enable row level security;
alter table public.hotel_quartos enable row level security;

create policy despesas_select_permitidos
on public.despesas
for select
to authenticated
using ((select public.usuario_pode_ler_despesas()));

create policy despesas_insert_permitidos
on public.despesas
for insert
to authenticated
with check ((select public.usuario_pode_editar_despesas()));

create policy despesas_update_permitidos
on public.despesas
for update
to authenticated
using ((select public.usuario_pode_editar_despesas()))
with check ((select public.usuario_pode_editar_despesas()));

create policy despesas_delete_permitidos
on public.despesas
for delete
to authenticated
using ((select public.usuario_pode_editar_despesas()));

create policy hoteis_select_permitidos
on public.hoteis
for select
to authenticated
using ((select public.usuario_pode_ler_hospedagem()));

create policy hoteis_insert_permitidos
on public.hoteis
for insert
to authenticated
with check ((select public.usuario_pode_editar_hoteis()));

create policy hoteis_update_permitidos
on public.hoteis
for update
to authenticated
using ((select public.usuario_pode_editar_hoteis()))
with check ((select public.usuario_pode_editar_hoteis()));

create policy hoteis_delete_permitidos
on public.hoteis
for delete
to authenticated
using ((select public.usuario_pode_editar_hoteis()));

create policy hotel_quartos_select_permitidos
on public.hotel_quartos
for select
to authenticated
using ((select public.usuario_pode_ler_hospedagem()));

create policy hotel_quartos_insert_permitidos
on public.hotel_quartos
for insert
to authenticated
with check ((select public.usuario_pode_editar_quartos_hotel()));

create policy hotel_quartos_update_permitidos
on public.hotel_quartos
for update
to authenticated
using ((select public.usuario_pode_editar_quartos_hotel()))
with check ((select public.usuario_pode_editar_quartos_hotel()));

create policy hotel_quartos_delete_permitidos
on public.hotel_quartos
for delete
to authenticated
using ((select public.usuario_pode_editar_quartos_hotel()));

drop policy if exists funcionario_select_permitidos on public.funcionario;
create policy funcionario_select_permitidos
on public.funcionario
for select
to authenticated
using ((select public.usuario_pode_ler_funcionarios_despesas()));

create index if not exists idx_despesas_data_checkin
on public.despesas (data_checkin desc);

create index if not exists idx_despesas_id_hotel
on public.despesas (id_hotel);

create index if not exists idx_despesas_id_funcionario1
on public.despesas (id_funcionario1);

create index if not exists idx_despesas_id_funcionario2
on public.despesas (id_funcionario2);

create index if not exists idx_hotel_quartos_id_hotel
on public.hotel_quartos (id_hotel);

notify pgrst, 'reload schema';
