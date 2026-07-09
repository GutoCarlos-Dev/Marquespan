-- Reparo de permissao para lancamentos de abastecimento interno.
-- Sintoma: "permission denied for table saidas_combustivel" ao salvar em
-- abastecimento.html ou mobile-abastecimento.html.
--
-- Execute no SQL Editor do Supabase.

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

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.saidas_combustivel to authenticated;
grant select on table public.bicos to authenticated;
grant select on table public.bombas to authenticated;
grant select on table public.tanques to authenticated;
grant select on table public.veiculos to authenticated;
grant select on table public.rotas to authenticated;
grant select on table public.funcionario to authenticated;
grant select, insert, update on table public.coleta_km to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.saidas_combustivel enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saidas_combustivel'
      and policyname = 'saidas_combustivel_select_permitidos'
  ) then
    create policy saidas_combustivel_select_permitidos
    on public.saidas_combustivel
    for select
    to authenticated
    using ((select public.usuario_pode_ler_abastecimento()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saidas_combustivel'
      and policyname = 'saidas_combustivel_insert_permitidos'
  ) then
    create policy saidas_combustivel_insert_permitidos
    on public.saidas_combustivel
    for insert
    to authenticated
    with check ((select public.usuario_pode_lancar_abastecimento()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saidas_combustivel'
      and policyname = 'saidas_combustivel_update_permitidos'
  ) then
    create policy saidas_combustivel_update_permitidos
    on public.saidas_combustivel
    for update
    to authenticated
    using ((select public.usuario_pode_lancar_abastecimento()))
    with check ((select public.usuario_pode_lancar_abastecimento()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'saidas_combustivel'
      and policyname = 'saidas_combustivel_delete_permitidos'
  ) then
    create policy saidas_combustivel_delete_permitidos
    on public.saidas_combustivel
    for delete
    to authenticated
    using ((select public.usuario_pode_lancar_abastecimento()));
  end if;
end $$;

notify pgrst, 'reload schema';
