alter table if exists public.carregamentos_camara_fria
    alter column fabrica_id drop not null;

notify pgrst, 'reload schema';
