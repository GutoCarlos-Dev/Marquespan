-- Permite que a pagina dashboard-diretoria.html leia os dados agregados que ela exibe
-- (frota, rotas, colaboradores, manutencoes, abastecimento, hospedagens e pedagio),
-- sem exigir que o nivel tambem tenha acesso a cada pagina de origem individualmente.
-- Execute no SQL Editor do Supabase.

create or replace function public.usuario_pode_ler_veiculos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from unnest(array[
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
      'thermoking.html',
      'dashboard-diretoria.html'
    ]::text[]) as paginas(pagina)
    where public.usuario_pode_acessar_pagina(paginas.pagina)
  );
$$;

create or replace function public.usuario_pode_ler_rotas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('rotas.html')
    or public.usuario_pode_acessar_pagina('peso-rota.html')
    or public.usuario_pode_acessar_pagina('escala.html')
    or public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('pedagio.html')
    or public.usuario_pode_acessar_pagina('relatorio-pedagio.html')
    or public.usuario_pode_acessar_pagina('abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento.html')
    or public.usuario_pode_acessar_pagina('relatorio-abastecimento.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-acompanhamento.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-acompanhamento-mobile.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-ocorrencia.html')
    or public.usuario_pode_acessar_pagina('fiscalizacao-ocorrencia-mobile.html')
    or public.usuario_pode_acessar_pagina('mapa.html')
    or public.usuario_pode_acessar_pagina('retorno-rota.html')
    or public.usuario_pode_acessar_pagina('retorno-rota-mobile.html')
    or public.usuario_pode_acessar_pagina('controle-de-jornada.html')
    or public.usuario_pode_acessar_pagina('dashboard-diretoria.html');
$$;

create or replace function public.usuario_pode_ler_funcionarios_despesas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('funcionario.html')
    or public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('dashboard-diretoria.html');
$$;

create or replace function public.usuario_pode_ler_despesas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-despesas.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('dashboard-diretoria.html');
$$;

create or replace function public.usuario_pode_ler_abastecimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento.html')
    or public.usuario_pode_acessar_pagina('mobile-abastecimento-qr.html')
    or public.usuario_pode_acessar_pagina('estoque-abastecimento.html')
    or public.usuario_pode_acessar_pagina('relatorio-abastecimento.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('monitoramento-abastecimento-interno.html')
    or public.usuario_pode_acessar_pagina('leituras-bomba.html')
    or public.usuario_pode_acessar_pagina('mobile-leituras-bomba.html')
    or public.usuario_pode_acessar_pagina('cadastro-tanque.html')
    or public.usuario_pode_acessar_pagina('cadastro-bombas-bicos.html')
    or public.usuario_pode_acessar_pagina('dashboard-diretoria.html');
$$;

create or replace function public.usuario_pode_ler_pedagio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.usuario_pode_acessar_pagina('pedagio.html')
    or public.usuario_pode_acessar_pagina('relatorio-pedagio.html')
    or public.usuario_pode_acessar_pagina('relatorio-estatistica.html')
    or public.usuario_pode_acessar_pagina('dashboard-diretoria.html');
$$;

notify pgrst, 'reload schema';
