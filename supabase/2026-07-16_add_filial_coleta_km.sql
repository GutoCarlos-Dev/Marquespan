alter table if exists public.coleta_km
    add column if not exists filial text;

create index if not exists idx_coleta_km_filial_data
    on public.coleta_km (filial, data_coleta);

/* Registros anteriores a esta migration ficam com filial nula (nao ha como inferir
   retroativamente de qual filial cada coleta era) - o app trata isso como "SEM FILIAL". */
