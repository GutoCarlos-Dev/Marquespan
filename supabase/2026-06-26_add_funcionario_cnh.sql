alter table if exists public.funcionario
    add column if not exists cnh_numero text,
    add column if not exists cnh_categoria text,
    add column if not exists cnh_vencimento date;

create index if not exists idx_funcionario_cnh_vencimento
    on public.funcionario (cnh_vencimento);

notify pgrst, 'reload schema';
