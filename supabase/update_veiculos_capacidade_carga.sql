-- Adiciona o campo capacidade_carga em veiculos e migra os valores atuais.
--
-- Regra aplicada:
-- 1. capacidade_carga recebe o valor atual de pbt quando estiver vazia.
-- 2. pbt passa a ser recalculado como tara_veiculo + capacidade_carga
--    quando os dois valores existirem.
--
-- Rode primeiro com ROLLBACK para conferir os SELECTs.
-- Se estiver correto, troque o ROLLBACK final por COMMIT.

begin;

alter table public.veiculos
    add column if not exists capacidade_carga numeric;

-- Pre-visualizacao antes da correcao.
select
    id,
    placa,
    tipo,
    tara_veiculo,
    pbt as pbt_atual,
    capacidade_carga as capacidade_carga_atual,
    coalesce(capacidade_carga, pbt) as capacidade_carga_corrigida,
    case
        when tara_veiculo is not null and coalesce(capacidade_carga, pbt) is not null
            then tara_veiculo + coalesce(capacidade_carga, pbt)
        else pbt
    end as pbt_corrigido
from public.veiculos
where pbt is not null
   or capacidade_carga is not null
order by placa;

-- Transfere o valor operacional que estava em PBT para Capacidade de Carga.
update public.veiculos
set capacidade_carga = pbt
where capacidade_carga is null
  and pbt is not null;

-- Recalcula PBT como Tara + Capacidade de Carga quando houver base suficiente.
update public.veiculos
set pbt = tara_veiculo + capacidade_carga
where tara_veiculo is not null
  and capacidade_carga is not null;

-- Conferencia depois da correcao.
select
    id,
    placa,
    tipo,
    tara_veiculo,
    capacidade_carga,
    pbt as pbt_corrigido
from public.veiculos
where pbt is not null
   or capacidade_carga is not null
order by placa;

-- Troque para COMMIT depois de conferir os resultados.
rollback;
