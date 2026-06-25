create table if not exists public.diaria_cadastro_financeiro (
    id uuid primary key default gen_random_uuid(),
    filial text not null,
    valor_diaria numeric(12,2) not null default 0,
    valor_janta numeric(12,2) not null default 0,
    valor_per_noite numeric(12,2) not null default 0,
    ultima_alteracao_por text,
    ultima_alteracao_em timestamptz,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_diaria_cadastro_financeiro_filial
    on public.diaria_cadastro_financeiro (filial);

alter table public.diaria_cadastro_financeiro enable row level security;

drop policy if exists diaria_cadastro_financeiro_select_filial on public.diaria_cadastro_financeiro;
create policy diaria_cadastro_financeiro_select_filial
on public.diaria_cadastro_financeiro
for select
to authenticated
using (public.usuario_pode_ver_filial_escala(filial));

drop policy if exists diaria_cadastro_financeiro_insert_gerencia on public.diaria_cadastro_financeiro;
create policy diaria_cadastro_financeiro_insert_gerencia
on public.diaria_cadastro_financeiro
for insert
to authenticated
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists diaria_cadastro_financeiro_update_gerencia on public.diaria_cadastro_financeiro;
create policy diaria_cadastro_financeiro_update_gerencia
on public.diaria_cadastro_financeiro
for update
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial))
with check (public.usuario_pode_gerenciar_filial_escala(filial));

drop policy if exists diaria_cadastro_financeiro_delete_gerencia on public.diaria_cadastro_financeiro;
create policy diaria_cadastro_financeiro_delete_gerencia
on public.diaria_cadastro_financeiro
for delete
to authenticated
using (public.usuario_pode_gerenciar_filial_escala(filial));

grant select, insert, update, delete on table public.diaria_cadastro_financeiro to authenticated;
revoke all on table public.diaria_cadastro_financeiro from anon;
