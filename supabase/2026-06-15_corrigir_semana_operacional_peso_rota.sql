-- Corrige registros antigos em que semana_ano recebeu a semana do retorno.
-- A semana operacional de peso_rota deve representar sempre a semana de saída.

with dias as (
    select
        id,
        dia_retorno,
        semana_ano,
        case
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'SEGUNDA' then 1
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'TERCA' then 2
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'QUARTA' then 3
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'QUINTA' then 4
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'SEXTA' then 5
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'SABADO' then 6
            when upper(translate(coalesce(semana, ''), 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC')) = 'DOMINGO' then 7
        end as dia_saida,
        extract(isodow from dia_retorno)::integer as dia_retorno_num
    from public.peso_rota
    where dia_retorno is not null
)
update public.peso_rota pr
set semana_ano = case
    when d.dia_saida > d.dia_retorno_num
        then to_char(d.dia_retorno - interval '7 days', 'IYYY-"W"IW')
    else to_char(d.dia_retorno, 'IYYY-"W"IW')
end
from dias d
where pr.id = d.id
  and d.dia_saida is not null
  and (
      d.semana_ano is null
      or (
          d.dia_saida > d.dia_retorno_num
          and d.semana_ano = to_char(d.dia_retorno, 'IYYY-"W"IW')
      )
  );
