-- Protecao de acesso para abastecimento.html e tabelas relacionadas.
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

create or replace function public.usuario_pode_ler_abastecimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento-qr.html')
    or public.usuario_pode_acessar_pagina('estoque-abastecimento.html')
    or public.usuario_pode_acessar_pagina('relatorio-abastecimento.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('monitoramento-abastecimento-interno.html')
    or public.usuario_pode_acessar_pagina('leituras-bomba.html')
    or public.usuario_pode_acessar_pagina('mobile-leituras-bomba.html')
    or public.usuario_pode_acessar_pagina('cadastro-tanque.html')
    or public.usuario_pode_acessar_pagina('cadastro-bombas-bicos.html');
$$;

create or replace function public.usuario_pode_lancar_abastecimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento-qr.html');
$$;

create or replace function public.usuario_pode_configurar_abastecimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('abastecimento.html')
    or public.usuario_pode_acessar_pagina('cadastro-tanque.html')
    or public.usuario_pode_acessar_pagina('cadastro-bombas-bicos.html');
$$;

do $$
declare
  tabela text;
  politica record;
begin
  foreach tabela in array array[
    'abastecimentos',
    'saidas_combustivel',
    'abastecimento_externo',
    'postos',
    'tanques',
    'bombas',
    'bicos'
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

revoke all on table public.abastecimentos from anon;
revoke all on table public.saidas_combustivel from anon;
revoke all on table public.abastecimento_externo from anon;
revoke all on table public.postos from anon;
revoke all on table public.tanques from anon;
revoke all on table public.bombas from anon;
revoke all on table public.bicos from anon;

grant select, insert, update, delete on table public.abastecimentos to authenticated;
grant select, insert, update, delete on table public.saidas_combustivel to authenticated;
grant select, insert, update, delete on table public.abastecimento_externo to authenticated;
grant select, insert, update, delete on table public.postos to authenticated;
grant select, insert, update, delete on table public.tanques to authenticated;
grant select, insert, update, delete on table public.bombas to authenticated;
grant select, insert, update, delete on table public.bicos to authenticated;

alter table public.abastecimentos enable row level security;
alter table public.saidas_combustivel enable row level security;
alter table public.abastecimento_externo enable row level security;
alter table public.postos enable row level security;
alter table public.tanques enable row level security;
alter table public.bombas enable row level security;
alter table public.bicos enable row level security;

create policy abastecimentos_select_permitidos
on public.abastecimentos
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy abastecimentos_insert_permitidos
on public.abastecimentos
for insert
to authenticated
with check (public.usuario_pode_lancar_abastecimento());

create policy abastecimentos_update_permitidos
on public.abastecimentos
for update
to authenticated
using (public.usuario_pode_lancar_abastecimento())
with check (public.usuario_pode_lancar_abastecimento());

create policy abastecimentos_delete_permitidos
on public.abastecimentos
for delete
to authenticated
using (public.usuario_pode_lancar_abastecimento());

create policy saidas_combustivel_select_permitidos
on public.saidas_combustivel
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy saidas_combustivel_insert_permitidos
on public.saidas_combustivel
for insert
to authenticated
with check (public.usuario_pode_lancar_abastecimento());

create policy saidas_combustivel_update_permitidos
on public.saidas_combustivel
for update
to authenticated
using (public.usuario_pode_lancar_abastecimento())
with check (public.usuario_pode_lancar_abastecimento());

create policy saidas_combustivel_delete_permitidos
on public.saidas_combustivel
for delete
to authenticated
using (public.usuario_pode_lancar_abastecimento());

create policy abastecimento_externo_select_permitidos
on public.abastecimento_externo
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy abastecimento_externo_insert_permitidos
on public.abastecimento_externo
for insert
to authenticated
with check (public.usuario_pode_lancar_abastecimento());

create policy abastecimento_externo_update_permitidos
on public.abastecimento_externo
for update
to authenticated
using (public.usuario_pode_lancar_abastecimento())
with check (public.usuario_pode_lancar_abastecimento());

create policy abastecimento_externo_delete_permitidos
on public.abastecimento_externo
for delete
to authenticated
using (public.usuario_pode_lancar_abastecimento());

create policy postos_select_permitidos
on public.postos
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy postos_insert_permitidos
on public.postos
for insert
to authenticated
with check (public.usuario_pode_configurar_abastecimento());

create policy postos_update_permitidos
on public.postos
for update
to authenticated
using (public.usuario_pode_configurar_abastecimento())
with check (public.usuario_pode_configurar_abastecimento());

create policy postos_delete_permitidos
on public.postos
for delete
to authenticated
using (public.usuario_pode_configurar_abastecimento());

create policy tanques_select_permitidos
on public.tanques
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy tanques_insert_permitidos
on public.tanques
for insert
to authenticated
with check (public.usuario_pode_configurar_abastecimento());

create policy tanques_update_permitidos
on public.tanques
for update
to authenticated
using (public.usuario_pode_configurar_abastecimento())
with check (public.usuario_pode_configurar_abastecimento());

create policy tanques_delete_permitidos
on public.tanques
for delete
to authenticated
using (public.usuario_pode_configurar_abastecimento());

create policy bombas_select_permitidos
on public.bombas
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy bombas_insert_permitidos
on public.bombas
for insert
to authenticated
with check (public.usuario_pode_configurar_abastecimento());

create policy bombas_update_permitidos
on public.bombas
for update
to authenticated
using (public.usuario_pode_configurar_abastecimento())
with check (public.usuario_pode_configurar_abastecimento());

create policy bombas_delete_permitidos
on public.bombas
for delete
to authenticated
using (public.usuario_pode_configurar_abastecimento());

create policy bicos_select_permitidos
on public.bicos
for select
to authenticated
using (public.usuario_pode_ler_abastecimento());

create policy bicos_insert_permitidos
on public.bicos
for insert
to authenticated
with check (public.usuario_pode_configurar_abastecimento());

create policy bicos_update_permitidos
on public.bicos
for update
to authenticated
using (public.usuario_pode_configurar_abastecimento())
with check (public.usuario_pode_configurar_abastecimento());

create policy bicos_delete_permitidos
on public.bicos
for delete
to authenticated
using (public.usuario_pode_configurar_abastecimento());

notify pgrst, 'reload schema';
