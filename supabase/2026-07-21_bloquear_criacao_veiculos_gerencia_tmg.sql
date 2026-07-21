-- veiculos.html: gerencia_tmg pode EDITAR veiculos existentes e exportar Excel, mas nao pode
-- CRIAR novos (nem via "+ Novo" nem via Importar em Massa, que tambem insere linhas na
-- tabela). Reforca no banco a mesma restricao ja aplicada no front (botao "+ Novo" e
-- Importar em Massa ocultos/bloqueados no JS).
-- Execute no SQL Editor do Supabase.

create or replace function public.usuario_pode_criar_veiculos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_editar_veiculos()
    and not exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and lower(u.nivel) = 'gerencia_tmg'
    );
$$;

drop policy if exists veiculos_insert_permitidos on public.veiculos;
create policy veiculos_insert_permitidos
on public.veiculos
for insert
to authenticated
with check ((select public.usuario_pode_criar_veiculos()));

notify pgrst, 'reload schema';
