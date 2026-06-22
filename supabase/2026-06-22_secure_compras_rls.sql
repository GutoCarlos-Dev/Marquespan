-- Protecao de acesso para compras.html e tabelas relacionadas.
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

create or replace function public.usuario_pode_acessar_compras()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('compras.html');
$$;

create or replace function public.usuario_pode_acessar_estoque_ou_compras()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('compras.html')
    or public.usuario_pode_acessar_pagina('estoque_geral.html');
$$;

do $$
declare
  tabela text;
  politica record;
begin
  foreach tabela in array array[
    'cotacoes',
    'cotacao_itens',
    'cotacao_orcamentos',
    'orcamento_item_precos',
    'recebimentos',
    'fornecedores',
    'produtos',
    'prateleiras',
    'movimentacoes_estoque'
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

revoke all on table public.cotacoes from anon;
revoke all on table public.cotacao_itens from anon;
revoke all on table public.cotacao_orcamentos from anon;
revoke all on table public.orcamento_item_precos from anon;
revoke all on table public.recebimentos from anon;
revoke all on table public.fornecedores from anon;
revoke all on table public.produtos from anon;
revoke all on table public.prateleiras from anon;
revoke all on table public.movimentacoes_estoque from anon;

grant select, insert, update, delete on table public.cotacoes to authenticated;
grant select, insert, update, delete on table public.cotacao_itens to authenticated;
grant select, insert, update, delete on table public.cotacao_orcamentos to authenticated;
grant select, insert, update, delete on table public.orcamento_item_precos to authenticated;
grant select, insert, update, delete on table public.recebimentos to authenticated;
grant select, insert, update, delete on table public.fornecedores to authenticated;
grant select, insert, update, delete on table public.produtos to authenticated;
grant select, insert, update, delete on table public.prateleiras to authenticated;
grant select, insert, update, delete on table public.movimentacoes_estoque to authenticated;

alter table public.cotacoes enable row level security;
alter table public.cotacao_itens enable row level security;
alter table public.cotacao_orcamentos enable row level security;
alter table public.orcamento_item_precos enable row level security;
alter table public.recebimentos enable row level security;
alter table public.fornecedores enable row level security;
alter table public.produtos enable row level security;
alter table public.prateleiras enable row level security;
alter table public.movimentacoes_estoque enable row level security;

create policy cotacoes_select_permitidos
on public.cotacoes
for select
to authenticated
using (public.usuario_pode_acessar_compras());

create policy cotacoes_insert_permitidos
on public.cotacoes
for insert
to authenticated
with check (public.usuario_pode_acessar_compras());

create policy cotacoes_update_permitidos
on public.cotacoes
for update
to authenticated
using (public.usuario_pode_acessar_compras())
with check (public.usuario_pode_acessar_compras());

create policy cotacoes_delete_permitidos
on public.cotacoes
for delete
to authenticated
using (public.usuario_pode_acessar_compras());

create policy cotacao_itens_select_permitidos
on public.cotacao_itens
for select
to authenticated
using (public.usuario_pode_acessar_compras());

create policy cotacao_itens_insert_permitidos
on public.cotacao_itens
for insert
to authenticated
with check (public.usuario_pode_acessar_compras());

create policy cotacao_itens_update_permitidos
on public.cotacao_itens
for update
to authenticated
using (public.usuario_pode_acessar_compras())
with check (public.usuario_pode_acessar_compras());

create policy cotacao_itens_delete_permitidos
on public.cotacao_itens
for delete
to authenticated
using (public.usuario_pode_acessar_compras());

create policy cotacao_orcamentos_select_permitidos
on public.cotacao_orcamentos
for select
to authenticated
using (public.usuario_pode_acessar_compras());

create policy cotacao_orcamentos_insert_permitidos
on public.cotacao_orcamentos
for insert
to authenticated
with check (public.usuario_pode_acessar_compras());

create policy cotacao_orcamentos_update_permitidos
on public.cotacao_orcamentos
for update
to authenticated
using (public.usuario_pode_acessar_compras())
with check (public.usuario_pode_acessar_compras());

create policy cotacao_orcamentos_delete_permitidos
on public.cotacao_orcamentos
for delete
to authenticated
using (public.usuario_pode_acessar_compras());

create policy orcamento_item_precos_select_permitidos
on public.orcamento_item_precos
for select
to authenticated
using (public.usuario_pode_acessar_compras());

create policy orcamento_item_precos_insert_permitidos
on public.orcamento_item_precos
for insert
to authenticated
with check (public.usuario_pode_acessar_compras());

create policy orcamento_item_precos_update_permitidos
on public.orcamento_item_precos
for update
to authenticated
using (public.usuario_pode_acessar_compras())
with check (public.usuario_pode_acessar_compras());

create policy orcamento_item_precos_delete_permitidos
on public.orcamento_item_precos
for delete
to authenticated
using (public.usuario_pode_acessar_compras());

create policy recebimentos_select_permitidos
on public.recebimentos
for select
to authenticated
using (public.usuario_pode_acessar_compras());

create policy recebimentos_insert_permitidos
on public.recebimentos
for insert
to authenticated
with check (public.usuario_pode_acessar_compras());

create policy recebimentos_update_permitidos
on public.recebimentos
for update
to authenticated
using (public.usuario_pode_acessar_compras())
with check (public.usuario_pode_acessar_compras());

create policy recebimentos_delete_permitidos
on public.recebimentos
for delete
to authenticated
using (public.usuario_pode_acessar_compras());

create policy fornecedores_select_permitidos
on public.fornecedores
for select
to authenticated
using (public.usuario_pode_acessar_compras());

create policy fornecedores_insert_permitidos
on public.fornecedores
for insert
to authenticated
with check (public.usuario_pode_acessar_compras());

create policy fornecedores_update_permitidos
on public.fornecedores
for update
to authenticated
using (public.usuario_pode_acessar_compras())
with check (public.usuario_pode_acessar_compras());

create policy fornecedores_delete_permitidos
on public.fornecedores
for delete
to authenticated
using (public.usuario_pode_acessar_compras());

create policy produtos_select_permitidos
on public.produtos
for select
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras());

create policy produtos_insert_permitidos
on public.produtos
for insert
to authenticated
with check (public.usuario_pode_acessar_estoque_ou_compras());

create policy produtos_update_permitidos
on public.produtos
for update
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras())
with check (public.usuario_pode_acessar_estoque_ou_compras());

create policy produtos_delete_permitidos
on public.produtos
for delete
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras());

create policy prateleiras_select_permitidos
on public.prateleiras
for select
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras());

create policy prateleiras_insert_permitidos
on public.prateleiras
for insert
to authenticated
with check (public.usuario_pode_acessar_estoque_ou_compras());

create policy prateleiras_update_permitidos
on public.prateleiras
for update
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras())
with check (public.usuario_pode_acessar_estoque_ou_compras());

create policy prateleiras_delete_permitidos
on public.prateleiras
for delete
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras());

create policy movimentacoes_estoque_select_permitidos
on public.movimentacoes_estoque
for select
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras());

create policy movimentacoes_estoque_insert_permitidos
on public.movimentacoes_estoque
for insert
to authenticated
with check (public.usuario_pode_acessar_estoque_ou_compras());

create policy movimentacoes_estoque_update_permitidos
on public.movimentacoes_estoque
for update
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras())
with check (public.usuario_pode_acessar_estoque_ou_compras());

create policy movimentacoes_estoque_delete_permitidos
on public.movimentacoes_estoque
for delete
to authenticated
using (public.usuario_pode_acessar_estoque_ou_compras());

notify pgrst, 'reload schema';
