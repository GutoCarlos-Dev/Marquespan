begin;

with rotas_normalizadas as (
  select
    cr.ctid,
    cr.cliente_codigo,
    cr.rota,
    case
      when numero.valor is not null then coalesce(nullif(ltrim(numero.valor, '0'), ''), '0')
      else trim(coalesce(cr.rota, ''))
    end as rota_normalizada,
    row_number() over (
      partition by
        cr.cliente_codigo,
        case
          when numero.valor is not null then coalesce(nullif(ltrim(numero.valor, '0'), ''), '0')
          else trim(coalesce(cr.rota, ''))
        end
      order by
        coalesce(cr.updated_at, cr.importado_em, cr.created_at) desc nulls last,
        cr.rota desc
    ) as ordem
  from public.cliente_rotas cr
  left join lateral (
    select (regexp_match(cr.rota, '\d+'))[1] as valor
  ) numero on true
)
delete from public.cliente_rotas cr
using rotas_normalizadas rn
where cr.ctid = rn.ctid
  and (
    rn.ordem > 1
    or nullif(rn.rota_normalizada, '') is null
  );

update public.cliente_rotas cr
set
  rota = normalizada.rota_normalizada,
  updated_at = now()
from (
  select
    cr.ctid,
    case
      when numero.valor is not null then coalesce(nullif(ltrim(numero.valor, '0'), ''), '0')
      else trim(coalesce(cr.rota, ''))
    end as rota_normalizada
  from public.cliente_rotas cr
  left join lateral (
    select (regexp_match(cr.rota, '\d+'))[1] as valor
  ) numero on true
) normalizada
where cr.ctid = normalizada.ctid
  and cr.rota is distinct from normalizada.rota_normalizada;

notify pgrst, 'reload schema';

commit;
