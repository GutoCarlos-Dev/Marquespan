-- Cadastro de funcoes para o formulario de funcionarios.
-- Tipo Normal nao exige equipe. Tipo 12X36 exige uma das equipes cadastradas.

create table if not exists public.funcionario_funcoes (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    tipo text not null default 'Normal',
    equipe text,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint funcionario_funcoes_nome_unique unique (nome),
    constraint funcionario_funcoes_tipo_check check (tipo in ('Normal', '12X36')),
    constraint funcionario_funcoes_equipe_check check (
        (tipo = 'Normal' and equipe is null)
        or (tipo = '12X36' and equipe in ('AD', 'BD', 'AN', 'BN'))
    )
);

create index if not exists idx_funcionario_funcoes_tipo
    on public.funcionario_funcoes (tipo);

insert into public.funcionario_funcoes (nome, tipo, equipe)
values
    ('Jovem Aprendiz', 'Normal', null),
    ('Auxiliar de Expedição', 'Normal', null),
    ('Auxiliar de Expedição Noturno', 'Normal', null),
    ('Auxiliar de Transporte', 'Normal', null),
    ('Auxiliar de Logistica', 'Normal', null),
    ('Auxiliar de Logistica ADM', 'Normal', null),
    ('Conferente Noturno', 'Normal', null),
    ('Encarregado Operacional', 'Normal', null),
    ('Encarregado Operacional Noturno', 'Normal', null),
    ('Gerente Operacional', 'Normal', null),
    ('Líder Logística', 'Normal', null),
    ('Líder Logística Noturno', 'Normal', null),
    ('Líder Expedição Noturno', 'Normal', null),
    ('Motorista', 'Normal', null),
    ('Motorista Patio', 'Normal', null),
    ('Motorista Patio Noturno', 'Normal', null),
    ('Motorista Carreta', 'Normal', null),
    ('Motorista Carreta Noturno', 'Normal', null),
    ('Motorista Bitrem', 'Normal', null),
    ('Motorista Munck', 'Normal', null)
on conflict (nome) do nothing;

