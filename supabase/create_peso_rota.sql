create table if not exists public.peso_rota (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    rota text not null,
    filial text,
    semana text,
    supervisor text,
    motorista text,
    auxiliar text,
    placa text,
    tipo_veiculo text,
    pbt numeric,
    peso_carga numeric,
    qtd_caixas integer,
    qtd_clientes integer,
    status_percentual numeric,
    semana_ano text,
    dia_semana_retorno text,
    dia_retorno date not null,
    horario_chegada time,
    descricao text,
    constraint peso_rota_dia_rota_filial_unique unique (dia_retorno, rota, filial)
);

alter table public.peso_rota add column if not exists filial text;
alter table public.peso_rota add column if not exists semana_ano text;
alter table public.peso_rota add column if not exists dia_semana_retorno text;

update public.peso_rota
set semana_ano = to_char(dia_retorno, 'IYYY-"W"IW')
where semana_ano is null and dia_retorno is not null;

update public.peso_rota
set dia_semana_retorno = coalesce(
    nullif(semana, ''),
    case extract(isodow from dia_retorno)
        when 1 then 'SEGUNDA'
        when 2 then 'TERÇA'
        when 3 then 'QUARTA'
        when 4 then 'QUINTA'
        when 5 then 'SEXTA'
        when 6 then 'SABADO'
        when 7 then 'DOMINGO'
    end
)
where dia_semana_retorno is null and dia_retorno is not null;

create index if not exists idx_peso_rota_dia_retorno on public.peso_rota (dia_retorno);
create index if not exists idx_peso_rota_semana_ano on public.peso_rota (semana_ano);
create index if not exists idx_peso_rota_dia_semana_retorno on public.peso_rota (dia_semana_retorno);
create index if not exists idx_peso_rota_rota on public.peso_rota (rota);
create index if not exists idx_peso_rota_filial_dia_rota on public.peso_rota (filial, dia_retorno, rota);

alter table public.peso_rota enable row level security;

drop policy if exists "Permitir leitura peso rota" on public.peso_rota;
create policy "Permitir leitura peso rota"
on public.peso_rota
for select
to public
using (true);

drop policy if exists "Permitir inserir peso rota" on public.peso_rota;
create policy "Permitir inserir peso rota"
on public.peso_rota
for insert
to public
with check (true);

drop policy if exists "Permitir atualizar peso rota" on public.peso_rota;
create policy "Permitir atualizar peso rota"
on public.peso_rota
for update
to public
using (true)
with check (true);

drop policy if exists "Permitir excluir peso rota" on public.peso_rota;
create policy "Permitir excluir peso rota"
on public.peso_rota
for delete
to public
using (true);
