create extension if not exists "pgcrypto";

create table if not exists public.portaria_empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  telefone text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portaria_pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  telefone text,
  empresa_id uuid references public.portaria_empresas(id) on delete set null,
  empresa_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portaria_setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  responsavel text,
  ramal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portaria_acessos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.portaria_empresas(id) on delete set null,
  pessoa_id uuid references public.portaria_pessoas(id) on delete set null,
  setor_id uuid references public.portaria_setores(id) on delete set null,
  empresa_nome text not null,
  empresa_documento text,
  pessoa_nome text not null,
  pessoa_documento text,
  placa_veiculo text,
  setor_nome text not null,
  produto_servico text,
  observacoes text,
  status text not null default 'aguardando' check (status in ('aguardando', 'entrada', 'saida')),
  entrada_em timestamptz,
  saida_em timestamptz,
  usuario_id text,
  usuario_nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portaria_acessos
  add column if not exists placa_veiculo text;

create index if not exists idx_portaria_empresas_nome on public.portaria_empresas (nome);
create index if not exists idx_portaria_empresas_documento on public.portaria_empresas (documento);
create index if not exists idx_portaria_pessoas_nome on public.portaria_pessoas (nome);
create index if not exists idx_portaria_setores_nome on public.portaria_setores (nome);
create index if not exists idx_portaria_acessos_created_at on public.portaria_acessos (created_at);
create index if not exists idx_portaria_acessos_status on public.portaria_acessos (status);
create index if not exists idx_portaria_acessos_empresa on public.portaria_acessos (empresa_nome);
create index if not exists idx_portaria_acessos_setor on public.portaria_acessos (setor_nome);
create index if not exists idx_portaria_acessos_placa on public.portaria_acessos (placa_veiculo);

create or replace function public.update_portaria_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_portaria_empresas_updated_at on public.portaria_empresas;
create trigger trg_portaria_empresas_updated_at
before update on public.portaria_empresas
for each row execute function public.update_portaria_updated_at();

drop trigger if exists trg_portaria_pessoas_updated_at on public.portaria_pessoas;
create trigger trg_portaria_pessoas_updated_at
before update on public.portaria_pessoas
for each row execute function public.update_portaria_updated_at();

drop trigger if exists trg_portaria_setores_updated_at on public.portaria_setores;
create trigger trg_portaria_setores_updated_at
before update on public.portaria_setores
for each row execute function public.update_portaria_updated_at();

drop trigger if exists trg_portaria_acessos_updated_at on public.portaria_acessos;
create trigger trg_portaria_acessos_updated_at
before update on public.portaria_acessos
for each row execute function public.update_portaria_updated_at();

alter table public.portaria_empresas enable row level security;
alter table public.portaria_pessoas enable row level security;
alter table public.portaria_setores enable row level security;
alter table public.portaria_acessos enable row level security;

drop policy if exists "Portaria empresas leitura autenticada" on public.portaria_empresas;
create policy "Portaria empresas leitura autenticada"
on public.portaria_empresas for select
using (auth.role() = 'authenticated');

drop policy if exists "Portaria empresas escrita autenticada" on public.portaria_empresas;
drop policy if exists "Portaria empresas inserir autenticado" on public.portaria_empresas;
create policy "Portaria empresas inserir autenticado"
on public.portaria_empresas for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria empresas atualizar autenticado" on public.portaria_empresas;
create policy "Portaria empresas atualizar autenticado"
on public.portaria_empresas for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria empresas excluir admin gerencia" on public.portaria_empresas;
drop policy if exists "Portaria empresas excluir administrador" on public.portaria_empresas;
create policy "Portaria empresas excluir administrador"
on public.portaria_empresas for delete
using (
  exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid()
      and lower(u.nivel) = 'administrador'
  )
);

drop policy if exists "Portaria pessoas leitura autenticada" on public.portaria_pessoas;
create policy "Portaria pessoas leitura autenticada"
on public.portaria_pessoas for select
using (auth.role() = 'authenticated');

drop policy if exists "Portaria pessoas escrita autenticada" on public.portaria_pessoas;
drop policy if exists "Portaria pessoas inserir autenticado" on public.portaria_pessoas;
create policy "Portaria pessoas inserir autenticado"
on public.portaria_pessoas for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria pessoas atualizar autenticado" on public.portaria_pessoas;
create policy "Portaria pessoas atualizar autenticado"
on public.portaria_pessoas for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria pessoas excluir admin gerencia" on public.portaria_pessoas;
drop policy if exists "Portaria pessoas excluir administrador" on public.portaria_pessoas;
create policy "Portaria pessoas excluir administrador"
on public.portaria_pessoas for delete
using (
  exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid()
      and lower(u.nivel) = 'administrador'
  )
);

drop policy if exists "Portaria setores leitura autenticada" on public.portaria_setores;
create policy "Portaria setores leitura autenticada"
on public.portaria_setores for select
using (auth.role() = 'authenticated');

drop policy if exists "Portaria setores escrita autenticada" on public.portaria_setores;
drop policy if exists "Portaria setores inserir autenticado" on public.portaria_setores;
create policy "Portaria setores inserir autenticado"
on public.portaria_setores for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria setores atualizar autenticado" on public.portaria_setores;
create policy "Portaria setores atualizar autenticado"
on public.portaria_setores for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria setores excluir admin gerencia" on public.portaria_setores;
drop policy if exists "Portaria setores excluir administrador" on public.portaria_setores;
create policy "Portaria setores excluir administrador"
on public.portaria_setores for delete
using (
  exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid()
      and lower(u.nivel) = 'administrador'
  )
);

drop policy if exists "Portaria acessos leitura autenticada" on public.portaria_acessos;
create policy "Portaria acessos leitura autenticada"
on public.portaria_acessos for select
using (auth.role() = 'authenticated');

drop policy if exists "Portaria acessos inserir autenticado" on public.portaria_acessos;
create policy "Portaria acessos inserir autenticado"
on public.portaria_acessos for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria acessos atualizar autenticado" on public.portaria_acessos;
create policy "Portaria acessos atualizar autenticado"
on public.portaria_acessos for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Portaria acessos excluir admin gerencia" on public.portaria_acessos;
create policy "Portaria acessos excluir admin gerencia"
on public.portaria_acessos for delete
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and lower(u.nivel) in ('administrador', 'gerencia')
  )
);
