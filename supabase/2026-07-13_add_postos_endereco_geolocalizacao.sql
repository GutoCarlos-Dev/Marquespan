-- Adiciona endereco e geolocalizacao a postos, no mesmo padrao usado em
-- clientes.geolocalizacao e hoteis.geolocalizacao: texto livre "latitude, longitude".
-- Execute no SQL Editor do Supabase.

alter table public.postos
  add column if not exists endereco text,
  add column if not exists geolocalizacao text;
