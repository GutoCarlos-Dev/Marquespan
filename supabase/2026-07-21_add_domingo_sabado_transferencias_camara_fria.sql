-- Transferencias CDS - Camara Fria: adiciona Domingo (antes de Segunda) e Sabado (depois de
-- Sexta) como colunas de quantidade, igual as demais colunas de dia da semana.
-- Execute no SQL Editor do Supabase.

alter table public.transferencias_camara_fria
    add column if not exists domingo integer not null default 0,
    add column if not exists sabado integer not null default 0;

alter table public.transferencias_camara_fria
    drop constraint if exists transferencias_camara_fria_domingo_check;
alter table public.transferencias_camara_fria
    add constraint transferencias_camara_fria_domingo_check check (domingo >= 0);

alter table public.transferencias_camara_fria
    drop constraint if exists transferencias_camara_fria_sabado_check;
alter table public.transferencias_camara_fria
    add constraint transferencias_camara_fria_sabado_check check (sabado >= 0);

notify pgrst, 'reload schema';
