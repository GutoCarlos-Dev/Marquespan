alter table public.clientes
  add column if not exists geolocalizacao text;

comment on column public.clientes.geolocalizacao is
  'Coordenadas manuais do cliente no formato latitude, longitude. Exemplo: -23.330692, -47.851799';
