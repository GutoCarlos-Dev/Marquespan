-- Protecao de acesso para rotas.html e leitura compartilhada de rotas.
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

create or replace function public.usuario_pode_ler_rotas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('rotas.html')
    or public.usuario_pode_acessar_pagina('peso-rota.html')
    or public.usuario_pode_acessar_pagina('escala.html')
    or public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('pedagio.html')
    or public.usuario_pode_acessar_pagina('relatorio-pedagio.html')
    or public.usuario_pode_acessar_pagina('abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento.html')
    or public.usuario_pode_acessar_pagina('relatorio-abastecimento.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-acompanhamento.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-acompanhamento-mobile.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-ocorrencia.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-ocorrencia-mobile.html')
    or public.usuario_pode_acessar_pagina('mapa.html')
    or public.usuario_pode_acessar_pagina('retorno-rota.html')
    or public.usuario_pode_acessar_pagina('retorno-rota-mobile.html')
    or public.usuario_pode_acessar_pagina('controle-de-jornada.html');
$$;

create or replace function public.usuario_pode_editar_rotas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('rotas.html');
$$;

revoke all on table public.rotas from anon;
grant select, insert, update, delete on table public.rotas to authenticated;

alter table public.rotas enable row level security;

drop policy if exists rotas_select_permitidos on public.rotas;
drop policy if exists rotas_insert_permitidos on public.rotas;
drop policy if exists rotas_update_permitidos on public.rotas;
drop policy if exists rotas_delete_permitidos on public.rotas;

create policy rotas_select_permitidos
on public.rotas
for select
to authenticated
using ((select public.usuario_pode_ler_rotas()));

create policy rotas_insert_permitidos
on public.rotas
for insert
to authenticated
with check ((select public.usuario_pode_editar_rotas()));

create policy rotas_update_permitidos
on public.rotas
for update
to authenticated
using ((select public.usuario_pode_editar_rotas()))
with check ((select public.usuario_pode_editar_rotas()));

create policy rotas_delete_permitidos
on public.rotas
for delete
to authenticated
using ((select public.usuario_pode_editar_rotas()));

create index if not exists idx_rotas_numero
on public.rotas (numero);

create index if not exists idx_rotas_filial
on public.rotas (filial);

create index if not exists idx_rotas_status
on public.rotas (status);

grant select on table public.supervisores to authenticated;

drop policy if exists supervisores_select_rotas on public.supervisores;
create policy supervisores_select_rotas
on public.supervisores
for select
to authenticated
using (
  (select public.usuario_pode_acessar_pagina('rotas.html'))
  or (select public.usuario_pode_acessar_pagina('mapa.html'))
  or (select public.usuario_pode_acessar_pagina('cadastro-carregamento.html'))
  or (select public.usuario_pode_acessar_pagina('iniciar-carregamento.html'))
);

notify pgrst, 'reload schema';
