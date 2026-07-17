-- Adiciona ordenacao configuravel para os Tipos de produto da Camara Fria.
-- Usada para agrupar/ordenar os Tipos (TRADICIONAL, EXTRA, PREMIUM, etc.) na
-- Lista de Transferencias CDS e em qualquer outra tela que agrupe por Tipo.
-- Execute no SQL Editor do Supabase.

alter table public.tipos_produto_camara_fria add column if not exists ordem integer;

-- Backfill: tipos ja cadastrados que ainda nao tem ordem definida recebem uma
-- sequencia inicial baseada no nome (ordem alfabetica), para nao ficarem todos
-- empatados em branco. Depois disso o usuario pode reorganizar livremente.
with numerados as (
    select id, row_number() over (order by nome) as rn
    from public.tipos_produto_camara_fria
    where ordem is null
)
update public.tipos_produto_camara_fria t
set ordem = numerados.rn
from numerados
where t.id = numerados.id;

notify pgrst, 'reload schema';
