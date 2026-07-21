-- veiculos.html: gerencia_tmg tem o mesmo acesso de edicao que gerencia, MENOS excluir veiculo
-- (pedido explicito: na coluna Acoes, gerencia_tmg nao pode excluir). Isso reforca no banco a
-- mesma restricao ja aplicada no front (botao de excluir some/e bloqueado no JS).
-- Execute no SQL Editor do Supabase.

create or replace function public.usuario_pode_excluir_veiculos()
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

drop policy if exists veiculos_delete_permitidos on public.veiculos;
create policy veiculos_delete_permitidos
on public.veiculos
for delete
to authenticated
using ((select public.usuario_pode_excluir_veiculos()));

notify pgrst, 'reload schema';
