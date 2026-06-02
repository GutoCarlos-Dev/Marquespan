create extension if not exists "pgcrypto";

-- Estrutura JSON em clientes:
-- nome, mercado_horario, horario_recebimento_ate, horario_chegada,
-- chamou_descarga, termino_descarga, liberou_canhoto.
create table if not exists public.fiscalizacao_acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  data_acompanhamento date not null,
  rota text not null,
  qtd_entregas integer,
  tipo_rota text not null check (tipo_rota in ('bate_volta', 'viagem')),
  placa text not null,
  motorista text not null,
  auxiliar text,
  terceiro text,
  clientes jsonb not null default '[]'::jsonb,
  sugestao_roteiro jsonb not null default '[]'::jsonb,
  horarios jsonb not null default '[]'::jsonb,
  observacoes text,
  usuario_id text,
  usuario_nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiscalizacao_acompanhamentos
  add column if not exists terceiro text;

alter table public.fiscalizacao_acompanhamentos
  add column if not exists sugestao_roteiro jsonb not null default '[]'::jsonb;

alter table public.fiscalizacao_acompanhamentos
  add column if not exists qtd_entregas integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscalizacao_acompanhamentos'
      and column_name = 'terceiro_motorista'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscalizacao_acompanhamentos'
      and column_name = 'terceiro_auxiliar'
  ) then
    execute $sql$
      update public.fiscalizacao_acompanhamentos
      set terceiro = nullif(concat_ws(' / ', nullif(terceiro_motorista, ''), nullif(terceiro_auxiliar, '')), '')
      where terceiro is null
    $sql$;
  end if;
end;
$$;

create index if not exists idx_fiscalizacao_acompanhamentos_data
  on public.fiscalizacao_acompanhamentos (data_acompanhamento);

create index if not exists idx_fiscalizacao_acompanhamentos_placa
  on public.fiscalizacao_acompanhamentos (placa);

create index if not exists idx_fiscalizacao_acompanhamentos_motorista
  on public.fiscalizacao_acompanhamentos (motorista);

create index if not exists idx_fiscalizacao_acompanhamentos_rota
  on public.fiscalizacao_acompanhamentos (rota);

create or replace function public.update_fiscalizacao_acompanhamentos_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_fiscalizacao_acompanhamentos_updated_at on public.fiscalizacao_acompanhamentos;
create trigger trg_fiscalizacao_acompanhamentos_updated_at
before update on public.fiscalizacao_acompanhamentos
for each row
execute function public.update_fiscalizacao_acompanhamentos_updated_at();

alter table public.fiscalizacao_acompanhamentos enable row level security;

drop policy if exists "Permitir leitura fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
create policy "Permitir leitura fiscalizacao acompanhamentos"
on public.fiscalizacao_acompanhamentos
for select
using (auth.role() = 'authenticated');

drop policy if exists "Permitir inserir fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
create policy "Permitir inserir fiscalizacao acompanhamentos"
on public.fiscalizacao_acompanhamentos
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Permitir atualizar fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
create policy "Permitir atualizar fiscalizacao acompanhamentos"
on public.fiscalizacao_acompanhamentos
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Permitir excluir fiscalizacao acompanhamentos" on public.fiscalizacao_acompanhamentos;
create policy "Permitir excluir fiscalizacao acompanhamentos"
on public.fiscalizacao_acompanhamentos
for delete
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and lower(u.nivel) in ('administrador', 'gerencia')
  )
);
