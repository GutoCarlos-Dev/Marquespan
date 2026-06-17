create table if not exists public.clientes (
  codigo text primary key,
  fantasia text,
  nome text,
  tipo_pessoa text,
  uf text,
  municipio text,
  endereco text,
  bairro text,
  cep text,
  email text,
  cnpj_cpf text,
  ie_rg text,
  cond_pagto text,
  forma_cob text,
  ativo text,
  supervisor text,
  consultor text,
  tabela_preco text,
  categoria text,
  origem_arquivo text,
  importado_em timestamptz,
  ultima_alteracao_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clientes add column if not exists codigo text;
alter table public.clientes add column if not exists fantasia text;
alter table public.clientes add column if not exists nome text;
alter table public.clientes add column if not exists tipo_pessoa text;
alter table public.clientes add column if not exists uf text;
alter table public.clientes add column if not exists municipio text;
alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists bairro text;
alter table public.clientes add column if not exists cep text;
alter table public.clientes add column if not exists email text;
alter table public.clientes add column if not exists cnpj_cpf text;
alter table public.clientes add column if not exists ie_rg text;
alter table public.clientes add column if not exists cond_pagto text;
alter table public.clientes add column if not exists forma_cob text;
alter table public.clientes add column if not exists ativo text;
alter table public.clientes add column if not exists supervisor text;
alter table public.clientes add column if not exists consultor text;
alter table public.clientes add column if not exists tabela_preco text;
alter table public.clientes add column if not exists categoria text;
alter table public.clientes add column if not exists origem_arquivo text;
alter table public.clientes add column if not exists importado_em timestamptz;
alter table public.clientes add column if not exists ultima_alteracao_por text;
alter table public.clientes add column if not exists created_at timestamptz not null default now();
alter table public.clientes add column if not exists updated_at timestamptz not null default now();

delete from public.clientes
where nullif(trim(codigo), '') is null;

alter table public.clientes alter column codigo set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clientes_pkey'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes add constraint clientes_pkey primary key (codigo);
  end if;
end $$;

create table if not exists public.cliente_rotas (
  cliente_codigo text not null references public.clientes(codigo) on delete cascade,
  rota text not null default '',
  supervisor text,
  consultor text,
  ativo text,
  origem_arquivo text,
  importado_em timestamptz,
  ultima_alteracao_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cliente_codigo, rota)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'rota'
  ) then
    insert into public.cliente_rotas (
      cliente_codigo,
      rota,
      supervisor,
      consultor,
      ativo,
      origem_arquivo,
      importado_em,
      ultima_alteracao_por,
      updated_at
    )
    select
      codigo,
      coalesce(rota, ''),
      supervisor,
      consultor,
      ativo,
      origem_arquivo,
      importado_em,
      ultima_alteracao_por,
      coalesce(updated_at, now())
    from public.clientes
    where nullif(trim(coalesce(rota, '')), '') is not null
    on conflict (cliente_codigo, rota) do update set
      supervisor = excluded.supervisor,
      consultor = excluded.consultor,
      ativo = excluded.ativo,
      origem_arquivo = excluded.origem_arquivo,
      importado_em = excluded.importado_em,
      ultima_alteracao_por = excluded.ultima_alteracao_por,
      updated_at = excluded.updated_at;
  end if;
end $$;

alter table public.clientes drop column if exists rota2;
alter table public.clientes drop column if exists rota;

create index if not exists idx_clientes_fantasia on public.clientes (fantasia);
create index if not exists idx_clientes_nome on public.clientes (nome);
create index if not exists idx_clientes_cnpj_cpf on public.clientes (cnpj_cpf);
create index if not exists idx_clientes_uf_municipio on public.clientes (uf, municipio);
create index if not exists idx_clientes_ativo on public.clientes (ativo);
create index if not exists idx_cliente_rotas_rota on public.cliente_rotas (rota);
create index if not exists idx_cliente_rotas_cliente on public.cliente_rotas (cliente_codigo);

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

grant select, insert, update, delete on table public.clientes to authenticated;
grant select, insert, update, delete on table public.cliente_rotas to authenticated;

alter table public.clientes enable row level security;
alter table public.cliente_rotas enable row level security;

drop policy if exists clientes_select_permitidos on public.clientes;
create policy clientes_select_permitidos
on public.clientes
for select
to authenticated
using (true);

drop policy if exists clientes_insert_permitidos on public.clientes;
create policy clientes_insert_permitidos
on public.clientes
for insert
to authenticated
with check (true);

drop policy if exists clientes_update_permitidos on public.clientes;
create policy clientes_update_permitidos
on public.clientes
for update
to authenticated
using (true)
with check (true);

drop policy if exists clientes_delete_permitidos on public.clientes;
create policy clientes_delete_permitidos
on public.clientes
for delete
to authenticated
using (true);

drop policy if exists cliente_rotas_select_permitidos on public.cliente_rotas;
create policy cliente_rotas_select_permitidos
on public.cliente_rotas
for select
to authenticated
using (true);

drop policy if exists cliente_rotas_insert_permitidos on public.cliente_rotas;
create policy cliente_rotas_insert_permitidos
on public.cliente_rotas
for insert
to authenticated
with check (true);

drop policy if exists cliente_rotas_update_permitidos on public.cliente_rotas;
create policy cliente_rotas_update_permitidos
on public.cliente_rotas
for update
to authenticated
using (true)
with check (true);

drop policy if exists cliente_rotas_delete_permitidos on public.cliente_rotas;
create policy cliente_rotas_delete_permitidos
on public.cliente_rotas
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
