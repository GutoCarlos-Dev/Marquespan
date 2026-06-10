-- Vincula cada coleta diretamente a uma filial e aplica isolamento no banco.
-- Execute no SQL Editor do Supabase.

alter table public.coletas_manutencao
  add column if not exists filial text;

-- A filial representa onde a manutencao ocorreu, nao a filial do veiculo.
-- Corrige o historico pela filial do usuario que realizou o lancamento.
update public.coletas_manutencao c
set filial = upper(trim(u.filial))
from public.usuarios u
where upper(trim(u.nome)) = upper(trim(c.usuario))
  and nullif(trim(u.filial), '') is not null;

create index if not exists idx_coletas_manutencao_filial_data
  on public.coletas_manutencao (filial, data_hora desc);

create or replace function public.definir_filial_coleta_manutencao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.filial := nullif(upper(trim(new.filial)), '');

  if new.filial is null then
    raise exception 'Informe a filial onde a manutencao foi realizada';
  end if;

  if public.usuario_filial_atual() is not null
     and new.filial <> upper(trim(public.usuario_filial_atual())) then
    raise exception 'O usuario somente pode lancar manutencoes para a filial %',
      public.usuario_filial_atual();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_definir_filial_coleta_manutencao
  on public.coletas_manutencao;

create trigger trg_definir_filial_coleta_manutencao
before insert or update of placa, filial
on public.coletas_manutencao
for each row
execute function public.definir_filial_coleta_manutencao();

-- As funcoes anteriores recebiam p_placa. As policies precisam ser removidas
-- antes de trocar a funcao para receber p_filial.
drop policy if exists coletas_manutencao_select_permitidos
  on public.coletas_manutencao;
drop policy if exists coletas_manutencao_insert_permitidos
  on public.coletas_manutencao;
drop policy if exists coletas_manutencao_update_permitidos
  on public.coletas_manutencao;
drop policy if exists coletas_manutencao_delete_admin_gerencia
  on public.coletas_manutencao;
drop policy if exists checklist_select_permitidos
  on public.coletas_manutencao_checklist;
drop policy if exists checklist_insert_permitidos
  on public.coletas_manutencao_checklist;
drop policy if exists checklist_update_permitidos
  on public.coletas_manutencao_checklist;
drop policy if exists checklist_delete_admin_gerencia
  on public.coletas_manutencao_checklist;
drop policy if exists checklist_delete_permitidos
  on public.coletas_manutencao_checklist;

drop function if exists public.usuario_pode_gerenciar_coleta(text);
drop function if exists public.usuario_pode_ver_coleta(text);

create or replace function public.usuario_pode_ver_coleta(p_filial text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('coletar-manutencao.html')
    and (
      public.usuario_filial_atual() is null
      or upper(trim(p_filial)) = upper(trim(public.usuario_filial_atual()))
    );
$$;

create or replace function public.usuario_pode_gerenciar_coleta(p_filial text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_ver_coleta(p_filial)
    and public.usuario_nivel_atual() in (
      'administrador',
      'gerencia',
      'mecanica_interna',
      'mecanica_externa',
      'moleiro'
    );
$$;

drop policy if exists coletas_manutencao_select_permitidos
  on public.coletas_manutencao;
create policy coletas_manutencao_select_permitidos
on public.coletas_manutencao
for select
to authenticated
using (public.usuario_pode_ver_coleta(filial));

drop policy if exists coletas_manutencao_insert_permitidos
  on public.coletas_manutencao;
create policy coletas_manutencao_insert_permitidos
on public.coletas_manutencao
for insert
to authenticated
with check (public.usuario_pode_gerenciar_coleta(filial));

drop policy if exists coletas_manutencao_update_permitidos
  on public.coletas_manutencao;
create policy coletas_manutencao_update_permitidos
on public.coletas_manutencao
for update
to authenticated
using (public.usuario_pode_gerenciar_coleta(filial))
with check (public.usuario_pode_gerenciar_coleta(filial));

drop policy if exists coletas_manutencao_delete_admin_gerencia
  on public.coletas_manutencao;
create policy coletas_manutencao_delete_admin_gerencia
on public.coletas_manutencao
for delete
to authenticated
using (
  public.usuario_pode_ver_coleta(filial)
  and public.usuario_nivel_atual() in ('administrador', 'gerencia')
);

drop policy if exists checklist_select_permitidos
  on public.coletas_manutencao_checklist;
create policy checklist_select_permitidos
on public.coletas_manutencao_checklist
for select
to authenticated
using (
  exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_ver_coleta(c.filial)
  )
  and (
    public.usuario_nivel_atual() not in ('mecanica_externa', 'moleiro')
    or public.usuario_pode_gerenciar_item_manutencao(item)
  )
);

drop policy if exists checklist_insert_permitidos
  on public.coletas_manutencao_checklist;
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
      and public.usuario_pode_gerenciar_coleta(c.filial)
  )
);

drop policy if exists checklist_update_permitidos
  on public.coletas_manutencao_checklist;
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
      and public.usuario_pode_gerenciar_coleta(c.filial)
  )
)
with check (
  public.usuario_pode_gerenciar_item_manutencao(item)
  and exists (
    select 1
    from public.coletas_manutencao c
    where c.id = coletas_manutencao_checklist.coleta_id
      and public.usuario_pode_gerenciar_coleta(c.filial)
  )
);

drop policy if exists checklist_delete_permitidos
  on public.coletas_manutencao_checklist;
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
      and public.usuario_pode_gerenciar_coleta(c.filial)
  )
);

-- Auditoria: somente registros que realmente continuam sem filial.
select c.id, c.placa, c.usuario, c.data_hora
from public.coletas_manutencao c
where nullif(trim(c.filial), '') is null
order by c.data_hora desc;

-- Resumo para conferir a distribuicao depois da migracao.
select
  coalesce(nullif(trim(c.filial), ''), 'SEM FILIAL') as filial_manutencao,
  count(*) as total_lancamentos
from public.coletas_manutencao c
group by coalesce(nullif(trim(c.filial), ''), 'SEM FILIAL')
order by filial_manutencao;
