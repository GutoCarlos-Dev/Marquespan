alter table public.portaria_empresas
  add column if not exists filial text;

alter table public.portaria_pessoas
  add column if not exists filial text;

alter table public.portaria_setores
  add column if not exists filial text;

alter table public.portaria_acessos
  add column if not exists filial text;

create index if not exists idx_portaria_empresas_filial on public.portaria_empresas (filial);
create index if not exists idx_portaria_pessoas_filial on public.portaria_pessoas (filial);
create index if not exists idx_portaria_setores_filial on public.portaria_setores (filial);
create index if not exists idx_portaria_acessos_filial on public.portaria_acessos (filial);
