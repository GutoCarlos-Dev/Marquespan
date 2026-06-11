alter table public.portaria_acessos
  add column if not exists carreta_cacamba text,
  add column if not exists placa_entrada text,
  add column if not exists placa_saida text,
  add column if not exists carreta_cacamba_entrada text,
  add column if not exists carreta_cacamba_saida text;

update public.portaria_acessos
set
  placa_entrada = coalesce(placa_entrada, placa_veiculo),
  carreta_cacamba_entrada = coalesce(carreta_cacamba_entrada, carreta_cacamba)
where entrada_em is not null;

update public.portaria_acessos
set
  placa_saida = coalesce(placa_saida, placa_entrada, placa_veiculo),
  carreta_cacamba_saida = coalesce(
    carreta_cacamba_saida,
    carreta_cacamba_entrada,
    carreta_cacamba
  )
where saida_em is not null;

create index if not exists idx_portaria_acessos_placa_entrada
  on public.portaria_acessos (placa_entrada);

create index if not exists idx_portaria_acessos_placa_saida
  on public.portaria_acessos (placa_saida);

create index if not exists idx_portaria_acessos_carreta_entrada
  on public.portaria_acessos (carreta_cacamba_entrada);

create index if not exists idx_portaria_acessos_carreta_saida
  on public.portaria_acessos (carreta_cacamba_saida);
