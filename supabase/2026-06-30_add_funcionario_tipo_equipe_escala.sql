alter table public.funcionario
add column if not exists tipo_escala text not null default 'Normal';

alter table public.funcionario
add column if not exists equipe_escala text;

update public.funcionario
set tipo_escala = 'Normal'
where tipo_escala is null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'funcionario_tipo_escala_check'
    ) then
        alter table public.funcionario
        add constraint funcionario_tipo_escala_check
        check (tipo_escala in ('Normal', '12X36'));
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'funcionario_equipe_escala_check'
    ) then
        alter table public.funcionario
        add constraint funcionario_equipe_escala_check
        check (
            equipe_escala is null
            or equipe_escala in ('AD', 'BD', 'AN', 'BN', 'Diurno', 'Noturno')
        );
    end if;
end $$;

comment on column public.funcionario.tipo_escala is
'Tipo de escala contratual do colaborador.';

comment on column public.funcionario.equipe_escala is
'Equipe da escala contratual do colaborador.';
