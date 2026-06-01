-- Protecao de dados da pagina escala.html.
-- Regra:
-- - acesso de leitura depende de nivel_permissoes.paginas_permitidas conter escala.html;
-- - administrador e gerencia podem gerenciar todas as filiais;
-- - balanca, equipe_noturno, adm_logistica e logistica podem editar a propria filial;
-- - outros niveis com acesso a pagina leem apenas a propria filial;
-- - escrita fica restrita a administrador e gerencia.

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

create or replace function public.usuario_pode_gerenciar_escala()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia', 'balanca', 'equipe_noturno', 'adm_logistica', 'logistica')
  );
$$;

create or replace function public.usuario_pode_ver_filial_escala(p_filial text)
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
        or 'escala.html' = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
      and (
        lower(u.nivel) in ('administrador', 'gerencia')
        or coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;

create or replace function public.usuario_pode_gerenciar_filial_escala(p_filial text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia', 'balanca', 'equipe_noturno', 'adm_logistica', 'logistica')
      and (
        lower(u.nivel) in ('administrador', 'gerencia')
        or coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;

alter table public.faltas_afastamentos
  add column if not exists filial text;

alter table public.peso_rota
  add column if not exists filial text;

create index if not exists idx_faltas_afastamentos_filial_data
  on public.faltas_afastamentos (filial, data_escala);

create index if not exists idx_peso_rota_filial_dia_rota
  on public.peso_rota (filial, dia_retorno, rota);

alter table public.peso_rota
  drop constraint if exists peso_rota_dia_rota_unique;

alter table public.peso_rota
  add constraint peso_rota_dia_rota_filial_unique unique (dia_retorno, rota, filial);

alter table public.escala enable row level security;
alter table public.planejamento_semanal enable row level security;
alter table public.faltas_afastamentos enable row level security;
alter table public.escala_diarias enable row level security;
alter table public.escala_diaria_itens enable row level security;
alter table public.peso_rota enable row level security;

drop policy if exists "Permitir leitura peso rota" on public.peso_rota;
drop policy if exists "Permitir inserir peso rota" on public.peso_rota;
drop policy if exists "Permitir atualizar peso rota" on public.peso_rota;
drop policy if exists "Permitir excluir peso rota" on public.peso_rota;

drop policy if exists escala_select_filial on public.escala;
create policy escala_select_filial
on public.escala
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists escala_insert_gerencia on public.escala;
create policy escala_insert_gerencia
on public.escala
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_update_gerencia on public.escala;
create policy escala_update_gerencia
on public.escala
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_delete_gerencia on public.escala;
create policy escala_delete_gerencia
on public.escala
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists planejamento_select_filial on public.planejamento_semanal;
create policy planejamento_select_filial
on public.planejamento_semanal
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists planejamento_insert_gerencia on public.planejamento_semanal;
create policy planejamento_insert_gerencia
on public.planejamento_semanal
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists planejamento_update_gerencia on public.planejamento_semanal;
create policy planejamento_update_gerencia
on public.planejamento_semanal
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists planejamento_delete_gerencia on public.planejamento_semanal;
create policy planejamento_delete_gerencia
on public.planejamento_semanal
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists faltas_select_filial on public.faltas_afastamentos;
create policy faltas_select_filial
on public.faltas_afastamentos
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists faltas_insert_gerencia on public.faltas_afastamentos;
create policy faltas_insert_gerencia
on public.faltas_afastamentos
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists faltas_update_gerencia on public.faltas_afastamentos;
create policy faltas_update_gerencia
on public.faltas_afastamentos
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists faltas_delete_gerencia on public.faltas_afastamentos;
create policy faltas_delete_gerencia
on public.faltas_afastamentos
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_diarias_select_filial on public.escala_diarias;
create policy escala_diarias_select_filial
on public.escala_diarias
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists escala_diarias_insert_gerencia on public.escala_diarias;
create policy escala_diarias_insert_gerencia
on public.escala_diarias
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_diarias_update_gerencia on public.escala_diarias;
create policy escala_diarias_update_gerencia
on public.escala_diarias
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_diarias_delete_gerencia on public.escala_diarias;
create policy escala_diarias_delete_gerencia
on public.escala_diarias
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists escala_diaria_itens_select_filial on public.escala_diaria_itens;
create policy escala_diaria_itens_select_filial
on public.escala_diaria_itens
for select
to authenticated
using (
  exists (
    select 1
    from public.escala_diarias d
    where d.id = escala_diaria_itens.diaria_id
      and public.usuario_pode_ver_filial_escala(d.filial)
  )
);

drop policy if exists escala_diaria_itens_insert_gerencia on public.escala_diaria_itens;
create policy escala_diaria_itens_insert_gerencia
on public.escala_diaria_itens
for insert
to authenticated
with check (
  public.usuario_pode_gerenciar_escala()
  and exists (
    select 1
    from public.escala_diarias d
    where d.id = escala_diaria_itens.diaria_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
);

drop policy if exists escala_diaria_itens_update_gerencia on public.escala_diaria_itens;
create policy escala_diaria_itens_update_gerencia
on public.escala_diaria_itens
for update
to authenticated
using (
  public.usuario_pode_gerenciar_escala()
  and exists (
    select 1
    from public.escala_diarias d
    where d.id = escala_diaria_itens.diaria_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
)
with check (
  public.usuario_pode_gerenciar_escala()
  and exists (
    select 1
    from public.escala_diarias d
    where d.id = escala_diaria_itens.diaria_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
);

drop policy if exists escala_diaria_itens_delete_gerencia on public.escala_diaria_itens;
create policy escala_diaria_itens_delete_gerencia
on public.escala_diaria_itens
for delete
to authenticated
using (
  public.usuario_pode_gerenciar_escala()
  and exists (
    select 1
    from public.escala_diarias d
    where d.id = escala_diaria_itens.diaria_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
);

drop policy if exists peso_rota_select_filial on public.peso_rota;
create policy peso_rota_select_filial
on public.peso_rota
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists peso_rota_insert_gerencia on public.peso_rota;
create policy peso_rota_insert_gerencia
on public.peso_rota
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists peso_rota_update_gerencia on public.peso_rota;
create policy peso_rota_update_gerencia
on public.peso_rota
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists peso_rota_delete_gerencia on public.peso_rota;
create policy peso_rota_delete_gerencia
on public.peso_rota
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));
