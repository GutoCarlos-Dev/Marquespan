-- Permite alterar a placa de um veiculo sem quebrar lancamentos vinculados.
-- Execute no SQL Editor do Supabase antes de usar a edicao de placa pela pagina veiculos.html.

alter table if exists public.pedagios_lancamentos
    drop constraint if exists fk_pedagios_lancamentos_placa;

alter table if exists public.pedagios_lancamentos
    add constraint fk_pedagios_lancamentos_placa
    foreign key (placa)
    references public.veiculos (placa)
    on update cascade
    on delete restrict;

create or replace function public.renomear_placa_veiculo(
    p_placa_antiga text,
    p_placa_nova text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_placa_antiga text;
    v_placa_nova text;
    v_tabela record;
    v_total integer;
    v_resultado jsonb := '{}'::jsonb;
begin
    v_placa_antiga := upper(regexp_replace(coalesce(p_placa_antiga, ''), '[^A-Za-z0-9]', '', 'g'));
    v_placa_nova := upper(regexp_replace(coalesce(p_placa_nova, ''), '[^A-Za-z0-9]', '', 'g'));

    if v_placa_antiga = '' or v_placa_nova = '' then
        raise exception 'Informe a placa antiga e a nova placa.';
    end if;

    if v_placa_antiga = v_placa_nova then
        return jsonb_build_object('placa', v_placa_nova, 'alterada', false);
    end if;

    if not exists (select 1 from public.veiculos where placa = v_placa_antiga) then
        raise exception 'Placa % nao encontrada no cadastro de veiculos.', v_placa_antiga;
    end if;

    if exists (select 1 from public.veiculos where placa = v_placa_nova) then
        raise exception 'Ja existe um veiculo cadastrado com a placa %.', v_placa_nova;
    end if;

    update public.veiculos
       set placa = v_placa_nova
     where placa = v_placa_antiga;

    get diagnostics v_total = row_count;
    v_resultado := v_resultado || jsonb_build_object('veiculos', v_total);

    if to_regclass('public.retorno_rota') is not null then
        delete from public.retorno_rota antiga
         where upper(regexp_replace(coalesce(antiga.placa::text, ''), '[^A-Za-z0-9]', '', 'g')) = v_placa_antiga
           and exists (
                select 1
                  from public.retorno_rota nova
                 where upper(regexp_replace(coalesce(nova.placa::text, ''), '[^A-Za-z0-9]', '', 'g')) = v_placa_nova
                   and nova.data_retorno = antiga.data_retorno
           );

        get diagnostics v_total = row_count;
        if v_total > 0 then
            v_resultado := v_resultado || jsonb_build_object('retorno_rota_duplicados_removidos', v_total);
        end if;

        update public.retorno_rota
           set placa = v_placa_nova
         where upper(regexp_replace(coalesce(placa::text, ''), '[^A-Za-z0-9]', '', 'g')) = v_placa_antiga;

        get diagnostics v_total = row_count;
        if v_total > 0 then
            v_resultado := v_resultado || jsonb_build_object('retorno_rota', v_total);
        end if;
    end if;

    for v_tabela in
        select n.nspname as schema_name, c.relname as table_name
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          join pg_catalog.pg_attribute a on a.attrelid = c.oid
          join pg_catalog.pg_type t on t.oid = a.atttypid
         where n.nspname = 'public'
           and c.relkind in ('r', 'p')
           and c.relname <> 'veiculos'
           and c.relname <> 'retorno_rota'
           and a.attname = 'placa'
           and not a.attisdropped
           and t.typname in ('text', 'varchar', 'bpchar')
         order by c.relname
    loop
        execute format(
            'update %I.%I set placa = $1 where upper(regexp_replace(coalesce(placa::text, ''''), ''[^A-Za-z0-9]'', '''', ''g'')) = $2',
            v_tabela.schema_name,
            v_tabela.table_name
        )
        using v_placa_nova, v_placa_antiga;

        get diagnostics v_total = row_count;
        if v_total > 0 then
            v_resultado := v_resultado || jsonb_build_object(v_tabela.table_name, v_total);
        end if;
    end loop;

    return v_resultado || jsonb_build_object('placa_antiga', v_placa_antiga, 'placa_nova', v_placa_nova, 'alterada', true);
end;
$$;

grant execute on function public.renomear_placa_veiculo(text, text) to authenticated;
