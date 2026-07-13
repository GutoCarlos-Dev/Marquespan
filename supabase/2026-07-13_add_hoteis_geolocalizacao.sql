-- Adiciona geolocalizacao a hoteis, no mesmo padrao usado em clientes.geolocalizacao:
-- texto livre "latitude, longitude" (ex: -23.330692, -47.851799).
-- Execute no SQL Editor do Supabase.

alter table public.hoteis
  add column if not exists geolocalizacao text;
