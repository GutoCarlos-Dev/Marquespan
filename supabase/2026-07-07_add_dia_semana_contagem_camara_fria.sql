-- Adiciona o dia da semana ao lancamento de contagem da Camara Fria.
-- Execute no SQL Editor do Supabase.

alter table public.contagens_camara_fria
    add column if not exists dia_semana text not null default 'SEGUNDA';

alter table public.contagens_camara_fria
    drop constraint if exists contagens_camara_fria_unica;

alter table public.contagens_camara_fria
    drop constraint if exists contagens_camara_fria_dia_semana_check;

alter table public.contagens_camara_fria
    add constraint contagens_camara_fria_dia_semana_check
    check (dia_semana in ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO'));

alter table public.contagens_camara_fria
    add constraint contagens_camara_fria_unica
    unique (filial, semana, dia_semana, fabrica_id);

drop index if exists idx_contagens_camara_fria_filial_semana;

create index if not exists idx_contagens_camara_fria_filial_semana_dia
    on public.contagens_camara_fria (filial, semana, dia_semana);

notify pgrst, 'reload schema';
