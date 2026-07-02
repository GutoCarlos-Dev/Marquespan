-- Corrige a identidade de peso_rota.
-- Antes, a constraint usava dia_retorno, rota e filial. Como dia_retorno pode mudar
-- ao importar retorno, uma semana podia sobrescrever registros de outra.

alter table public.peso_rota
  drop constraint if exists peso_rota_dia_rota_filial_unique;

alter table public.peso_rota
  drop constraint if exists peso_rota_semana_rota_filial_saida_unique;

-- Guarda uma copia dos grupos duplicados antes da limpeza.
create table if not exists public.peso_rota_dedup_backup_20260702 as
with duplicados as (
  select semana_ano, rota, filial, semana
  from public.peso_rota
  where semana_ano is not null
    and rota is not null
    and filial is not null
    and semana is not null
  group by semana_ano, rota, filial, semana
  having count(*) > 1
)
select pr.*
from public.peso_rota pr
join duplicados d
  on d.semana_ano = pr.semana_ano
 and d.rota = pr.rota
 and d.filial = pr.filial
 and d.semana = pr.semana;

-- Remove duplicados mantendo o registro mais completo e, em empate, o mais recente.
with ranqueados as (
  select
    id,
    row_number() over (
      partition by semana_ano, rota, filial, semana
      order by
        (
          case when nullif(trim(coalesce(supervisor, '')), '') is not null then 1 else 0 end +
          case when nullif(trim(coalesce(motorista, '')), '') is not null then 1 else 0 end +
          case when nullif(trim(coalesce(auxiliar, '')), '') is not null then 1 else 0 end +
          case when nullif(trim(coalesce(placa, '')), '') is not null then 1 else 0 end +
          case when nullif(trim(coalesce(tipo_veiculo, '')), '') is not null then 1 else 0 end +
          case when pbt is not null then 1 else 0 end +
          case when peso_carga is not null then 1 else 0 end +
          case when qtd_caixas is not null then 1 else 0 end +
          case when qtd_clientes is not null then 1 else 0 end +
          case when horario_chegada is not null then 1 else 0 end +
          case when nullif(trim(coalesce(descricao, '')), '') is not null then 1 else 0 end
        ) desc,
        ultima_alteracao_em desc nulls last,
        updated_at desc nulls last,
        created_at desc nulls last,
        id
    ) as rn
  from public.peso_rota
  where semana_ano is not null
    and rota is not null
    and filial is not null
    and semana is not null
)
delete from public.peso_rota pr
using ranqueados r
where pr.id = r.id
  and r.rn > 1;

alter table public.peso_rota
  add constraint peso_rota_semana_rota_filial_saida_unique
  unique (semana_ano, rota, filial, semana);

create index if not exists idx_peso_rota_semana_filial_rota_saida
  on public.peso_rota (semana_ano, filial, rota, semana);
