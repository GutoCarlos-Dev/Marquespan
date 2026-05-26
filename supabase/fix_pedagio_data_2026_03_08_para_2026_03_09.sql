-- Corrige lancamentos de pedagio importados com deslocamento de fuso.
--
-- Caso identificado:
-- A planilha tinha passagens em segundas de marco/2026, mas a importacao antiga
-- podia salvar como domingo por converter o serial do Excel via UTC antes de
-- aplicar a hora.
--
-- Dias locais em Brasilia que serao corrigidos:
-- 01/03/2026, 08/03/2026, 15/03/2026, 22/03/2026 e 29/03/2026.
--
-- Rode primeiro como esta no SQL Editor do Supabase e confira os SELECTs.
-- Se a pre-visualizacao estiver correta, troque o ROLLBACK final por COMMIT.

begin;

-- 1) Pre-visualizacao dos registros que seriam corrigidos.
select
    id,
    placa,
    motorista,
    rota,
    rodovia,
    praca,
    valor,
    data_hora_passagem as data_salva_utc,
    data_hora_passagem at time zone 'America/Sao_Paulo' as data_salva_brasilia,
    (data_hora_passagem + interval '1 day') at time zone 'America/Sao_Paulo' as data_corrigida_brasilia
from public.pedagios_lancamentos
where (data_hora_passagem at time zone 'America/Sao_Paulo')::date in (
    date '2026-03-01',
    date '2026-03-08',
    date '2026-03-15',
    date '2026-03-22',
    date '2026-03-29'
)
order by data_hora_passagem, placa;

-- 2) Correcao: soma 1 dia, preservando o horario da passagem.
update public.pedagios_lancamentos p
set
    data_hora_passagem = p.data_hora_passagem + interval '1 day',
    updated_at = now()
where (p.data_hora_passagem at time zone 'America/Sao_Paulo')::date in (
    date '2026-03-01',
    date '2026-03-08',
    date '2026-03-15',
    date '2026-03-22',
    date '2026-03-29'
)
returning
    p.id,
    p.placa,
    p.motorista,
    p.rota,
    p.rodovia,
    p.praca,
    p.valor,
    p.data_hora_passagem as data_corrigida_utc,
    p.data_hora_passagem at time zone 'America/Sao_Paulo' as data_corrigida_brasilia;

-- 3) Conferencia dos registros que agora estao nas segundas de marco/2026.
select
    p.id,
    p.placa,
    p.motorista,
    p.rota,
    p.rodovia,
    p.praca,
    p.valor,
    p.data_hora_passagem as data_corrigida_utc,
    p.data_hora_passagem at time zone 'America/Sao_Paulo' as data_corrigida_brasilia
from public.pedagios_lancamentos p
where (p.data_hora_passagem at time zone 'America/Sao_Paulo')::date in (
    date '2026-03-02',
    date '2026-03-09',
    date '2026-03-16',
    date '2026-03-23',
    date '2026-03-30'
)
order by p.data_hora_passagem, p.placa;

-- 4) Conferencia resumida por dia local em Brasilia.
select
    (p.data_hora_passagem at time zone 'America/Sao_Paulo')::date as data_brasilia,
    count(*) as total
from public.pedagios_lancamentos p
where (p.data_hora_passagem at time zone 'America/Sao_Paulo')::date in (
    date '2026-03-02',
    date '2026-03-09',
    date '2026-03-16',
    date '2026-03-23',
    date '2026-03-30'
)
group by 1
order by 1;

-- Troque para COMMIT depois de conferir os resultados.
rollback;
