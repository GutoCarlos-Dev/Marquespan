-- Protecao de acesso para veiculos.html, tabela veiculos e bucket veiculos_fotos.
-- Execute no SQL Editor do Supabase.
--
-- ATENCAO: a tabela veiculos e compartilhada por muitas telas. Por isso, leitura
-- fica liberada para paginas dependentes, mas inclusao/alteracao/exclusao ficam
-- restritas a quem tem permissao de veiculos.html.

create or replace function public.usuario_pode_acessar_pagina(p_pagina text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    left join public.nivel_permissoes np
      on lower(np.nivel) = lower(u.nivel)
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and (
        lower(u.nivel) = 'administrador'
        or p_pagina = any(coalesce(np.paginas_permitidas, array[]::text[]))
      )
  );
$$;

create or replace function public.usuario_pode_ler_veiculos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from unnest(array[
      'veiculos.html',
      'cadastro-veiculos.html',
      'abastecimento.html',
      'mobile-abastecimento.html',
      'mobile-abastecimento-qr.html',
      'monitoramento-abastecimento-interno.html',
      'relatorio-abastecimento.html',
      'buscar-carregamento.html',
      'cadastro-carregamento.html',
      'iniciar-carregamento.html',
      'coletar-KM.html',
      'coletar-manutencao.html',
      'incluir-manutencao.html',
      'buscar-manutencao.html',
      'monitoramento.html',
      'monitoramento-servicos.html',
      'controle-cadeado.html',
      'controle-cadeado-mobile.html',
      'controle-de-jornada.html',
      'engraxe.html',
      'escala.html',
      'estoque_geral.html',
      'fiscalizacao-acompanhamento.html',
      'fiscalizacao-acompanhamento-mobile.html',
      'fiscalizacao-ocorrencia.html',
      'fiscalizacao-ocorrencia-mobile.html',
      'lavagem.html',
      'localizacao-veiculo.html',
      'mobile-localizacao-veiculo.html',
      'monitoramento-frota.html',
      'monitoramento-retorno-rota.html',
      'pedagio.html',
      'pneu-consumo.html',
      'pneu-updated.html',
      'peso-rota.html',
      'relatorio-estatistica.html',
      'relatorio-localizacao.html',
      'relatorio-pedagio.html',
      'retorno-rota.html',
      'retorno-rota-mobile.html',
      'tacografo.html',
      'thermoking.html'
    ]::text[]) as paginas(pagina)
    where public.usuario_pode_acessar_pagina(paginas.pagina)
  );
$$;

create or replace function public.usuario_pode_editar_veiculos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_pode_acessar_pagina('veiculos.html');
$$;

do $$
declare
  politica record;
begin
  if to_regclass('public.veiculos') is not null then
    for politica in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'veiculos'
    loop
      execute format('drop policy if exists %I on public.veiculos', politica.policyname);
    end loop;
  end if;
end $$;

revoke all on table public.veiculos from anon;
grant select, insert, update, delete on table public.veiculos to authenticated;

alter table public.veiculos enable row level security;

create policy veiculos_select_permitidos
on public.veiculos
for select
to authenticated
using ((select public.usuario_pode_ler_veiculos()));

create policy veiculos_insert_permitidos
on public.veiculos
for insert
to authenticated
with check ((select public.usuario_pode_editar_veiculos()));

create policy veiculos_update_permitidos
on public.veiculos
for update
to authenticated
using ((select public.usuario_pode_editar_veiculos()))
with check ((select public.usuario_pode_editar_veiculos()));

create policy veiculos_delete_permitidos
on public.veiculos
for delete
to authenticated
using ((select public.usuario_pode_editar_veiculos()));

do $$
declare
  politica record;
begin
  for politica in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname ilike '%veiculos_fotos%'
  loop
    execute format('drop policy if exists %I on storage.objects', politica.policyname);
  end loop;
end $$;

create policy veiculos_fotos_select_permitidos
on storage.objects
for select
to authenticated
using (
  bucket_id = 'veiculos_fotos'
  and (select public.usuario_pode_ler_veiculos())
);

create policy veiculos_fotos_insert_permitidos
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'veiculos_fotos'
  and (select public.usuario_pode_editar_veiculos())
);

create policy veiculos_fotos_update_permitidos
on storage.objects
for update
to authenticated
using (
  bucket_id = 'veiculos_fotos'
  and (select public.usuario_pode_editar_veiculos())
)
with check (
  bucket_id = 'veiculos_fotos'
  and (select public.usuario_pode_editar_veiculos())
);

create policy veiculos_fotos_delete_permitidos
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'veiculos_fotos'
  and (select public.usuario_pode_editar_veiculos())
);

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
  if not public.usuario_pode_editar_veiculos() then
    raise exception 'Sem permissao para alterar placas de veiculos.';
  end if;

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

revoke all on function public.renomear_placa_veiculo(text, text) from public, anon;
grant execute on function public.renomear_placa_veiculo(text, text) to authenticated;

create index if not exists idx_veiculos_placa
on public.veiculos (placa);

create index if not exists idx_veiculos_filial
on public.veiculos (filial);

create index if not exists idx_veiculos_tipo
on public.veiculos (tipo);

create index if not exists idx_veiculos_situacao
on public.veiculos (situacao);

notify pgrst, 'reload schema';
