-- Adiciona filial ao cadastro de funcionarios.
-- Historico atual: todos os funcionarios cadastrados antes desta migracao pertencem a SP.

alter table public.funcionario
    add column if not exists filial text;

update public.funcionario
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

alter table public.funcionario
    alter column filial set default 'SP';

create index if not exists idx_funcionario_filial
    on public.funcionario (filial);

