-- Protecao da pagina coletar-manutencao.html.
-- Execute no SQL Editor do Supabase.
-- Regras principais:
-- - leitura depende de nivel_permissoes.paginas_permitidas conter coletar-manutencao.html;
-- - usuarios com filial leem/escrevem apenas veiculos da propria filial;
-- - administrador e gerencia gerenciam todos os itens da filial permitida;
-- - mecanica_externa gerencia apenas MECANICA EXTERNA / MECANICA - EXTERNA;
-- - moleiro gerencia apenas MOLEIRO;
-- - exclusao fica restrita a administrador e gerencia.

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
    where u.auth_user_id::text = auth.uid()::text
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and (
        lower(u.nivel) = 'administrador'
        or p_pagina = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
  );
$$;

create or replace function public.usuario_nivel_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.nivel)
  from public.usuarios u
  where u.auth_user_id::text = auth.uid()::text
    and coalesce(u.status, 'ATIVO') <> 'INATIVO'
  limit 1;
$$;

create or replace function public.usuario_filial_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(u.filial, '')
  from public.usuarios u
  where u.auth_user_id::text = auth.uid()::text
    and coalesce(u.status, 'ATIVO') <> 'INATIVO'
  limit 1;
$$;

create or replace function public.usuario_pode_ver_coleta(p_placa text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('coletar-manutencao.html')
    and (
      public.usuario_filial_atual() is null
      or exists (
        select 1
        from public.veiculos v
        where v.placa = p_placa
          and v.filial = public.usuario_filial_atual()
      )
    );
$$;

create or replace function public.usuario_pode_gerenciar_coleta(p_placa text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_ver_coleta(p_placa)
    and public.usuario_nivel_atual() in (
      'administrador',
      'gerencia',
      'mecanica_interna',
      'mecanica_externa',
      'moleiro'
    );
$$;

create or replace function public.usuario_pode_gerenciar_item_manutencao(p_item text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.usuario_nivel_atual() in ('administrador', 'gerencia', 'mecanica_interna') then true
    when public.usuario_nivel_atual() = 'mecanica_externa'
      then upper(coalesce(p_item, '')) in ('MECANICA EXTERNA', 'MECANICA - EXTERNA')
    when public.usuario_nivel_atual() = 'moleiro'
      then upper(coalesce(p_item, '')) = 'MOLEIRO'
    else false
  end;
$$;

alter table public.coletas_manutencao enable row level security;
alter table public.coletas_manutencao_checklist enable row level security;
alter table public.itens_verificacao enable row level security;
alter table public.oficinas enable row level security;

drop policy if exists coletas_manutencao_select_permitidos on public.coletas_manutencao;
create policy coletas_manutencao_select_permitidos
on public.coletas_manutencao
for select
to authenticated
using (public.usuario_pode_ver_coleta(placa));

drop policy if exists coletas_manutencao_insert_permitidos on public.coletas_manutencao;
create policy coletas_manutencao_insert_permitidos
on public.coletas_manutencao
for insert
to authenticated
with check (public.usuario_pode_gerenciar_coleta(placa));

drop policy if exists coletas_manutencao_update_permitidos on public.coletas_manutencao;
create policy coletas_manutencao_update_permitidos
on public.coletas_manutencao
for update
to authenticated
using (public.usuario_pode_gerenciar_coleta(placa))
with check (public.usuario_pode_gerenciar_coleta(placa));

drop policy if exists coletas_manutencao_delete_admin_gerencia on public.coletas_manutencao;
create policy coletas_manutencao_delete_admin_gerencia
on public.coletas_manutencao
for delete
to authenticated
using (
  public.usuario_pode_ver_coleta(placa)
  and public.usuario_nivel_atual() in ('administrador', 'gerencia')
);

drop policy if exists checklist_select_permitidos on public.coletas_manutencao_checklist;
create policy checklist_select_permitidos
on public.coletas_manutencao_checklist
for select
to authenticated
using (
  exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_ver_coleta(c.placa)
  )
  and (
    public.usuario_nivel_atual() not in ('mecanica_externa', 'moleiro')
    or public.usuario_pode_gerenciar_item_manutencao(item)
  )
);

drop policy if exists checklist_insert_permitidos on public.coletas_manutencao_checklist;
create policy checklist_insert_permitidos
on public.coletas_manutencao_checklist
for insert
to authenticated
with check (
  public.usuario_pode_gerenciar_item_manutencao(item)
  and exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_gerenciar_coleta(c.placa)
  )
);

drop policy if exists checklist_update_permitidos on public.coletas_manutencao_checklist;
create policy checklist_update_permitidos
on public.coletas_manutencao_checklist
for update
to authenticated
using (
  public.usuario_pode_gerenciar_item_manutencao(item)
  and exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_gerenciar_coleta(c.placa)
  )
)
with check (
  public.usuario_pode_gerenciar_item_manutencao(item)
  and exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_gerenciar_coleta(c.placa)
  )
);

drop policy if exists checklist_delete_admin_gerencia on public.coletas_manutencao_checklist;
drop policy if exists checklist_delete_permitidos on public.coletas_manutencao_checklist;
create policy checklist_delete_permitidos
on public.coletas_manutencao_checklist
for delete
to authenticated
using (
  public.usuario_pode_gerenciar_item_manutencao(item)
  and exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_gerenciar_coleta(c.placa)
  )
);

drop policy if exists itens_verificacao_select_auth on public.itens_verificacao;
create policy itens_verificacao_select_auth
on public.itens_verificacao
for select
to authenticated
using (public.usuario_pode_acessar_pagina('coletar-manutencao.html'));

drop policy if exists oficinas_select_permitidos on public.oficinas;
create policy oficinas_select_permitidos
on public.oficinas
for select
to authenticated
using (
  public.usuario_pode_acessar_pagina('coletar-manutencao.html')
  and (
    public.usuario_filial_atual() is null
    or filial is null
    or filial = public.usuario_filial_atual()
  )
);
