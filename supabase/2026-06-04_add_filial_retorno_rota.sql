-- Adiciona coluna filial na tabela retorno_rota para suportar importação da Escala Online por filial
alter table public.retorno_rota
    add column if not exists filial text;

create index if not exists idx_retorno_rota_filial_data
    on public.retorno_rota (filial, data_retorno);

-- Preserva referência histórica: todos os lançamentos existentes são da filial SP
update public.retorno_rota
set filial = 'SP'
where filial is null;
