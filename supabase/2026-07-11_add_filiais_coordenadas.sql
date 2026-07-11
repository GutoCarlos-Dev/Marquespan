-- Adiciona geolocalizacao a filiais para permitir filtros de raio (ex: monitoramento da frota).
-- Segue o mesmo padrao usado em clientes.geolocalizacao: texto livre "latitude, longitude".
-- Execute no SQL Editor do Supabase.

alter table public.filiais
  add column if not exists geolocalizacao text;
