alter table public.engraxe_listas
  add column if not exists filial text;

update public.engraxe_listas
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

create index if not exists idx_engraxe_listas_filial_data
  on public.engraxe_listas (filial, data_lista desc, created_at desc);
