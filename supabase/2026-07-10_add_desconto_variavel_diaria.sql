alter table if exists public.escala_diarias
    add column if not exists total_desconto_variavel numeric(12,2) not null default 0;

alter table if exists public.escala_diaria_itens
    add column if not exists desconto_variavel numeric(12,2) not null default 0,
    add column if not exists descricao_desconto_variavel text;
