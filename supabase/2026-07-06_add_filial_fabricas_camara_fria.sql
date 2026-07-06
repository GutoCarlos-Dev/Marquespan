-- Vincula as fabricas da Camara Fria a uma filial.
-- Execute no SQL Editor do Supabase.

alter table public.fabricas_camara_fria
    add column if not exists filial text;

create index if not exists idx_fabricas_camara_fria_filial
    on public.fabricas_camara_fria (filial);

alter table public.fabricas_camara_fria
    drop constraint if exists fabricas_camara_fria_nome_unique;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fabricas_camara_fria_filial_nome_unique'
          and conrelid = 'public.fabricas_camara_fria'::regclass
    ) then
        alter table public.fabricas_camara_fria
            add constraint fabricas_camara_fria_filial_nome_unique unique (filial, nome);
    end if;
end $$;

-- Depois de revisar/ajustar registros antigos sem filial, esta constraint pode ser ativada:
-- alter table public.fabricas_camara_fria
--     alter column filial set not null;

notify pgrst, 'reload schema';
