-- Permite selecionar MAIS DE UMA filial por produto da Camara Fria.
-- filiais = null ou vazio continua significando "Todas as Filiais" (compatibilidade
-- com o campo antigo "filial"). Produtos que ja tinham uma filial unica sao migrados
-- automaticamente para o novo formato, sem mudar o comportamento atual.
-- Execute no SQL Editor do Supabase.

alter table public.produtos_camara_fria add column if not exists filiais text[];

update public.produtos_camara_fria
set filiais = array[filial]
where filial is not null and filiais is null;

create index if not exists idx_produtos_camara_fria_filiais
    on public.produtos_camara_fria using gin (filiais);

notify pgrst, 'reload schema';
