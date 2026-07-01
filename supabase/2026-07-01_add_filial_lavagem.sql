alter table public.lavagem_listas
  add column if not exists filial text;

alter table public.lavagem_precos
  add column if not exists filial text;

update public.lavagem_listas
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

update public.lavagem_precos
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

create index if not exists idx_lavagem_listas_filial_data
  on public.lavagem_listas (filial, data_lista desc, created_at desc);

create index if not exists idx_lavagem_precos_filial_tipo
  on public.lavagem_precos (filial, tipo_veiculo, tipo_lavagem, fornecedor);
