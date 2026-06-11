alter table public.portaria_acessos
  add column if not exists carreta_cacamba text;

create index if not exists idx_portaria_acessos_carreta_cacamba
  on public.portaria_acessos (carreta_cacamba);
