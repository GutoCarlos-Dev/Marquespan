create table if not exists public.diaria_janta_pernoite (
    id uuid primary key default gen_random_uuid(),
    data_ref date not null,
    filial text not null,
    valor_janta numeric(12,2) not null default 0,
    valor_per_noite numeric(12,2) not null default 0,
    total_funcionarios integer not null default 0,
    total_janta numeric(12,2) not null default 0,
    total_per_noite numeric(12,2) not null default 0,
    total_desconto numeric(12,2) not null default 0,
    total_pagar numeric(12,2) not null default 0,
    ultima_alteracao_por text,
    ultima_alteracao_em timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.diaria_janta_pernoite_itens (
    id uuid primary key default gen_random_uuid(),
    lancamento_id uuid not null references public.diaria_janta_pernoite(id) on delete cascade,
    funcionario_nome text not null,
    nome_completo text,
    cpf text,
    funcao text,
    tipo_funcionario text,
    rota text,
    placa text,
    status_lancamento text,
    motivo_desconto text,
    faltou boolean not null default false,
    paga_janta boolean not null default false,
    paga_per_noite boolean not null default false,
    desconto boolean not null default false,
    valor_janta numeric(12,2) not null default 0,
    valor_per_noite numeric(12,2) not null default 0,
    valor_desconto numeric(12,2) not null default 0,
    valor_total numeric(12,2) not null default 0,
    ultima_alteracao_por text,
    ultima_alteracao_em timestamptz,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_diaria_janta_pernoite_data_filial
    on public.diaria_janta_pernoite (data_ref, filial);

create index if not exists idx_diaria_janta_pernoite_itens_lancamento
    on public.diaria_janta_pernoite_itens (lancamento_id);

alter table public.diaria_janta_pernoite enable row level security;
alter table public.diaria_janta_pernoite_itens enable row level security;

drop policy if exists diaria_janta_pernoite_select_filial on public.diaria_janta_pernoite;
create policy diaria_janta_pernoite_select_filial
on public.diaria_janta_pernoite
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists diaria_janta_pernoite_insert_gerencia on public.diaria_janta_pernoite;
create policy diaria_janta_pernoite_insert_gerencia
on public.diaria_janta_pernoite
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists diaria_janta_pernoite_update_gerencia on public.diaria_janta_pernoite;
create policy diaria_janta_pernoite_update_gerencia
on public.diaria_janta_pernoite
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists diaria_janta_pernoite_delete_gerencia on public.diaria_janta_pernoite;
create policy diaria_janta_pernoite_delete_gerencia
on public.diaria_janta_pernoite
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists diaria_janta_pernoite_itens_select_filial on public.diaria_janta_pernoite_itens;
create policy diaria_janta_pernoite_itens_select_filial
on public.diaria_janta_pernoite_itens
for select
to authenticated
using (
  exists (
    select 1
    from public.diaria_janta_pernoite d
    where d.id = diaria_janta_pernoite_itens.lancamento_id
      and public.usuario_pode_ver_filial_escala(d.filial)
  )
);

drop policy if exists diaria_janta_pernoite_itens_insert_gerencia on public.diaria_janta_pernoite_itens;
create policy diaria_janta_pernoite_itens_insert_gerencia
on public.diaria_janta_pernoite_itens
for insert
to authenticated
with check (
  exists (
    select 1
    from public.diaria_janta_pernoite d
    where d.id = diaria_janta_pernoite_itens.lancamento_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
);

drop policy if exists diaria_janta_pernoite_itens_update_gerencia on public.diaria_janta_pernoite_itens;
create policy diaria_janta_pernoite_itens_update_gerencia
on public.diaria_janta_pernoite_itens
for update
to authenticated
using (
  exists (
    select 1
    from public.diaria_janta_pernoite d
    where d.id = diaria_janta_pernoite_itens.lancamento_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
)
with check (
  exists (
    select 1
    from public.diaria_janta_pernoite d
    where d.id = diaria_janta_pernoite_itens.lancamento_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
);

drop policy if exists diaria_janta_pernoite_itens_delete_gerencia on public.diaria_janta_pernoite_itens;
create policy diaria_janta_pernoite_itens_delete_gerencia
on public.diaria_janta_pernoite_itens
for delete
to authenticated
using (
  exists (
    select 1
    from public.diaria_janta_pernoite d
    where d.id = diaria_janta_pernoite_itens.lancamento_id
      and public.usuario_pode_gerenciar_filial_escala(d.filial)
  )
);

grant select, insert, update, delete on table public.diaria_janta_pernoite to authenticated;
grant select, insert, update, delete on table public.diaria_janta_pernoite_itens to authenticated;
revoke all on table public.diaria_janta_pernoite from anon;
revoke all on table public.diaria_janta_pernoite_itens from anon;
