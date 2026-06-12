const SYSTEMSAT_BASE_URL = 'https://tracking.systemsatx.com.br';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type CookieJar = Map<string, string>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function normalizarPlaca(valor: unknown) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatarPlaca(valor: unknown) {
  const placa = normalizarPlaca(valor);
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

function extrairPlacaUnidadeRastreada(nome: unknown) {
  const texto = String(nome || '').toUpperCase();
  const placaComMascara = texto.match(/\b[A-Z]{3}-?[A-Z0-9]{4}\b/)?.[0];
  return normalizarPlaca(placaComMascara || texto.split(/\s+/)[0]);
}

function extrairToken(html: string) {
  const match = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
  return match?.[1] || '';
}

function atualizarCookies(headers: Headers, cookies: CookieJar) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const valores = typeof getSetCookie === 'function'
    ? getSetCookie.call(headers)
    : [headers.get('set-cookie') || ''].filter(Boolean);

  for (const valor of valores) {
    const primeiroTrecho = valor.split(';', 1)[0];
    const separador = primeiroTrecho.indexOf('=');
    if (separador <= 0) continue;
    cookies.set(
      primeiroTrecho.slice(0, separador).trim(),
      primeiroTrecho.slice(separador + 1).trim()
    );
  }
}

function cabecalhoCookies(cookies: CookieJar) {
  return [...cookies.entries()].map(([nome, valor]) => `${nome}=${valor}`).join('; ');
}

async function systemsatFetch(
  caminho: string,
  cookies: CookieJar,
  init: RequestInit = {},
  redirecionamentos = 0
): Promise<Response> {
  if (redirecionamentos > 8) throw new Error('Excesso de redirecionamentos no rastreador.');

  const headers = new Headers(init.headers);
  const cookie = cabecalhoCookies(cookies);
  if (cookie) headers.set('Cookie', cookie);
  headers.set('User-Agent', 'Marquespan-Localizacao/1.0');

  const response = await fetch(new URL(caminho, SYSTEMSAT_BASE_URL), {
    ...init,
    headers,
    redirect: 'manual'
  });

  atualizarCookies(response.headers, cookies);

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) return response;

    const trocarParaGet = [301, 302, 303].includes(response.status)
      && String(init.method || 'GET').toUpperCase() !== 'GET';

    return systemsatFetch(location, cookies, {
      ...init,
      method: trocarParaGet ? 'GET' : init.method,
      body: trocarParaGet ? undefined : init.body
    }, redirecionamentos + 1);
  }

  return response;
}

async function validarUsuario(authorization: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: supabaseAnonKey
    }
  });

  return response.ok;
}

async function buscarVeiculosPermitidos(authorization: string, filialInformada: unknown) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Configuração do Supabase indisponível.');
  }

  const url = new URL('/rest/v1/veiculos', supabaseUrl);
  url.searchParams.set('select', 'placa,filial,modelo,tipo,situacao');
  url.searchParams.set('order', 'placa.asc');
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      apikey: supabaseAnonKey
    }
  });
  if (!response.ok) throw new Error('Não foi possível carregar a frota autorizada.');

  const filial = String(filialInformada || '').trim().toUpperCase();
  const veiculos = await response.json();
  return (Array.isArray(veiculos) ? veiculos : []).map((veiculo) => ({
    ...veiculo,
    placa: normalizarPlaca(veiculo?.placa)
  })).filter((veiculo) => {
    const placa = veiculo.placa;
    const situacao = String(veiculo?.situacao || '').trim().toLowerCase();
    const filialVeiculo = String(veiculo?.filial || '').trim().toUpperCase();
    return placa.length === 7
      && situacao !== 'inativo'
      && (!filial || filialVeiculo === filial);
  });
}

async function mapearEmLotes<T, R>(
  itens: T[],
  tamanhoLote: number,
  callback: (item: T) => Promise<R>
) {
  const resultados: R[] = [];
  for (let indice = 0; indice < itens.length; indice += tamanhoLote) {
    const lote = itens.slice(indice, indice + tamanhoLote);
    resultados.push(...await Promise.all(lote.map(callback)));
  }
  return resultados;
}

async function consultarSystemsat(placaInformada: string) {
  const login = Deno.env.get('SYSTEMSAT_LOGIN');
  const senha = Deno.env.get('SYSTEMSAT_PASSWORD');
  if (!login || !senha) {
    throw new Error('Credenciais do rastreador não configuradas no servidor.');
  }

  const cookies: CookieJar = new Map();
  const loginPage = await systemsatFetch('/', cookies);
  const loginHtml = await loginPage.text();
  const loginToken = extrairToken(loginHtml);
  if (!loginToken) throw new Error('O portal do rastreador não forneceu o token de acesso.');

  const loginForm = new URLSearchParams({
    __RequestVerificationToken: loginToken,
    login,
    senha,
    hashCode: ''
  });

  const loginResponse = await systemsatFetch('/Login/Login', cookies, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginForm
  });

  if (!loginResponse.ok) throw new Error('Falha ao autenticar no rastreador.');

  const operacionalResponse = await systemsatFetch('/Operacional', cookies);
  const operacionalHtml = await operacionalResponse.text();
  const token = extrairToken(operacionalHtml);
  const ids = operacionalHtml.match(/operacional\.Init\(\s*(\d+)\s*,\s*(\d+)/i);

  if (!token || !ids) {
    throw new Error('A sessão do rastreador não foi iniciada corretamente.');
  }

  const idCentral = ids[1];
  const idCliente = ids[2];
  const placa = formatarPlaca(placaInformada);
  const searchForm = new URLSearchParams({
    __RequestVerificationToken: token,
    paramIdCliente: idCliente,
    paramPageSize: '20',
    paramStartRowIndex: '0',
    paramSearchExpr: 'Nome',
    paramPropertyName: 'Nome',
    paramSearchOperation: 'contains',
    paramSearchValue: placa,
    paramOrderBy: 'Nome'
  });

  const searchResponse = await systemsatFetch(
    '/UnidadeRastreada/GetSearchPageRastreadorUnidadeRastreadaForDxSelectBox',
    cookies,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: searchForm
    }
  );
  const searchResult = await searchResponse.json();
  const unidades = Array.isArray(searchResult?.Data) ? searchResult.Data : [];
  const unidade = unidades.find((item: { Nome?: string }) => (
    normalizarPlaca(String(item?.Nome || '').split(' ')[0]) === normalizarPlaca(placa)
  )) || unidades[0];

  if (!unidade?.Id) throw new Error(`A placa ${placa} não foi encontrada no rastreador.`);

  const idUnidade = String(unidade.Id).split('|').pop();
  const positionForm = new URLSearchParams({
    __RequestVerificationToken: token,
    paramIdUnidadeRastreada: String(idUnidade)
  });
  const positionResponse = await systemsatFetch(
    '/api/LastPositions/GetLastPositionUnidadeRastreada',
    cookies,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: positionForm
    }
  );
  const positionResult = await positionResponse.json();
  const registro = Array.isArray(positionResult?.Data) ? positionResult.Data[0] : null;

  if (!registro?.Posicao) throw new Error(`Não há posição disponível para a placa ${placa}.`);

  const posicao = registro.Posicao;
  const unidadeRastreada = registro.UnidadeRastreada || {};
  const longitude = posicao?.Geocode?.Coordinates?.Longitude;
  const latitude = posicao?.Geocode?.Coordinates?.Latitude;
  let endereco = posicao.Endereco || null;

  if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    const addressUrl = new URL('/api/PosicaoLocalizacao/GetAddressByLatLng', SYSTEMSAT_BASE_URL);
    addressUrl.search = new URLSearchParams({
      paramCultura: 'pt-BR',
      paramIdCentral: idCentral,
      paramIdCliente: idCliente,
      paramLatitude: String(latitude),
      paramLogitude: String(longitude)
    }).toString();

    const addressResponse = await systemsatFetch(addressUrl.toString(), cookies);
    if (addressResponse.ok) {
      const addressResult = await addressResponse.json();
      endereco = addressResult?.Data?.EnderecoFormatado || endereco;
    }
  }

  return {
    placa: unidadeRastreada.PlacaVeiculo || placa,
    unidade: unidadeRastreada.UnidadeRastreada || unidade.Nome,
    grupo: unidadeRastreada.GrupoUnidadeRastreada || null,
    filial: unidadeRastreada.UnidadeOrganizacional || null,
    endereco,
    referencia: posicao.DistanciaGeo || posicao?.CheckPoint?.Geography || null,
    latitude,
    longitude,
    dataEvento: posicao.DataEvento || null,
    dataAtualizacao: posicao.DataAtualizacao || null,
    velocidade: posicao.Velocidade,
    ignicao: posicao.Ignicao,
    odometro: posicao.Odometro,
    desatualizado: Boolean(registro.IsRastreadorDesatualizado)
  };
}

async function consultarFrotaSystemsat(
  authorization: string,
  filialInformada: unknown
) {
  const login = Deno.env.get('SYSTEMSAT_LOGIN');
  const senha = Deno.env.get('SYSTEMSAT_PASSWORD');
  if (!login || !senha) {
    throw new Error('Credenciais do rastreador não configuradas no servidor.');
  }

  const veiculos = await buscarVeiculosPermitidos(authorization, filialInformada);
  if (veiculos.length === 0) {
    return { veiculos: [], totalCadastrados: 0, semRastreador: 0 };
  }

  const cookies: CookieJar = new Map();
  const loginPage = await systemsatFetch('/', cookies);
  const loginHtml = await loginPage.text();
  const loginToken = extrairToken(loginHtml);
  if (!loginToken) throw new Error('O portal do rastreador não forneceu o token de acesso.');

  const loginResponse = await systemsatFetch('/Login/Login', cookies, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      __RequestVerificationToken: loginToken,
      login,
      senha,
      hashCode: ''
    })
  });
  if (!loginResponse.ok) throw new Error('Falha ao autenticar no rastreador.');

  const operacionalResponse = await systemsatFetch('/Operacional', cookies);
  const operacionalHtml = await operacionalResponse.text();
  const token = extrairToken(operacionalHtml);
  const ids = operacionalHtml.match(/operacional\.Init\(\s*(\d+)\s*,\s*(\d+)/i);
  if (!token || !ids) {
    throw new Error('A sessão do rastreador não foi iniciada corretamente.');
  }

  const searchResponse = await systemsatFetch(
    '/UnidadeRastreada/GetSearchPageRastreadorUnidadeRastreadaForDxSelectBox',
    cookies,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        __RequestVerificationToken: token,
        paramIdCliente: ids[2],
        paramPageSize: '20000',
        paramStartRowIndex: '0',
        paramSearchExpr: 'Nome',
        paramPropertyName: 'Nome',
        paramSearchOperation: 'contains',
        paramSearchValue: '',
        paramOrderBy: 'Nome'
      })
    }
  );
  const searchResult = await searchResponse.json();
  const unidades = Array.isArray(searchResult?.Data) ? searchResult.Data : [];
  const unidadesPorPlaca = new Map<string, { Id: string; Nome?: string }>();
  unidades.forEach((unidade: { Id?: string; Nome?: string }) => {
    const placa = extrairPlacaUnidadeRastreada(unidade?.Nome);
    if (placa.length === 7 && unidade?.Id) unidadesPorPlaca.set(placa, unidade as { Id: string; Nome?: string });
  });

  const correspondencias = veiculos
    .map((veiculo) => ({
      veiculo,
      unidade: unidadesPorPlaca.get(veiculo.placa)
    }))
    .filter((item) => item.unidade?.Id);

  const posicoes = await mapearEmLotes(correspondencias, 10, async (item) => {
    try {
      const idUnidade = String(item.unidade?.Id).split('|').at(-1);
      const response = await systemsatFetch(
        '/api/LastPositions/GetLastPositionUnidadeRastreada',
        cookies,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            __RequestVerificationToken: token,
            paramIdUnidadeRastreada: String(idUnidade)
          })
        }
      );
      const result = await response.json();
      const registro = Array.isArray(result?.Data) ? result.Data[0] : null;
      if (!registro?.Posicao) return null;

      const posicao = registro.Posicao;
      const unidade = registro.UnidadeRastreada || {};
      return {
        placa: normalizarPlaca(item.veiculo.placa),
        placaFormatada: unidade.PlacaVeiculo || formatarPlaca(item.veiculo.placa),
        modelo: item.veiculo.modelo || unidade.ModeloVeiculo || 'Sem modelo',
        tipo: item.veiculo.tipo || 'Sem tipo',
        filial: item.veiculo.filial || unidade.UnidadeOrganizacional || 'Sem filial',
        unidade: unidade.UnidadeRastreada || item.unidade?.Nome || null,
        latitude: posicao?.Geocode?.Coordinates?.Latitude,
        longitude: posicao?.Geocode?.Coordinates?.Longitude,
        dataAtualizacao: posicao.DataAtualizacao || posicao.DataEvento || null,
        velocidade: posicao.Velocidade,
        ignicao: posicao.Ignicao,
        referencia: posicao.DistanciaGeo || posicao?.CheckPoint?.Geography || null,
        desatualizado: Boolean(registro.IsRastreadorDesatualizado)
      };
    } catch (error) {
      console.error('Falha ao consultar posição da frota:', item.veiculo?.placa, error);
      return null;
    }
  });

  return {
    veiculos: posicoes.filter(Boolean),
    totalCadastrados: veiculos.length,
    semRastreador: veiculos.length - correspondencias.length,
    consultadoEm: new Date().toISOString()
  };
}

async function consultarHistoricoSystemsat(
  placaInformada: string,
  dataInicial: string,
  dataFinal: string
) {
  const login = Deno.env.get('SYSTEMSAT_LOGIN');
  const senha = Deno.env.get('SYSTEMSAT_PASSWORD');
  if (!login || !senha) {
    throw new Error('Credenciais do rastreador não configuradas no servidor.');
  }

  const cookies: CookieJar = new Map();
  const loginPage = await systemsatFetch('/', cookies);
  const loginHtml = await loginPage.text();
  const loginToken = extrairToken(loginHtml);
  if (!loginToken) throw new Error('O portal do rastreador não forneceu o token de acesso.');

  const loginForm = new URLSearchParams({
    __RequestVerificationToken: loginToken,
    login,
    senha,
    hashCode: ''
  });
  const loginResponse = await systemsatFetch('/Login/Login', cookies, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginForm
  });
  if (!loginResponse.ok) throw new Error('Falha ao autenticar no rastreador.');

  const operacionalResponse = await systemsatFetch('/Operacional', cookies);
  const operacionalHtml = await operacionalResponse.text();
  const token = extrairToken(operacionalHtml);
  const ids = operacionalHtml.match(/operacional\.Init\(\s*(\d+)\s*,\s*(\d+)/i);
  if (!token || !ids) {
    throw new Error('A sessão do rastreador não foi iniciada corretamente.');
  }

  const idCliente = ids[2];
  const placa = formatarPlaca(placaInformada);
  const searchForm = new URLSearchParams({
    __RequestVerificationToken: token,
    paramIdCliente: idCliente,
    paramPageSize: '20',
    paramStartRowIndex: '0',
    paramSearchExpr: 'Nome',
    paramPropertyName: 'Nome',
    paramSearchOperation: 'contains',
    paramSearchValue: placa,
    paramOrderBy: 'Nome'
  });
  const searchResponse = await systemsatFetch(
    '/UnidadeRastreada/GetSearchPageRastreadorUnidadeRastreadaForDxSelectBox',
    cookies,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: searchForm
    }
  );
  const searchResult = await searchResponse.json();
  const unidades = Array.isArray(searchResult?.Data) ? searchResult.Data : [];
  const unidade = unidades.find((item: { Nome?: string }) => (
    normalizarPlaca(String(item?.Nome || '').split(' ')[0]) === normalizarPlaca(placa)
  )) || unidades[0];
  if (!unidade?.Id) throw new Error(`A placa ${placa} não foi encontrada no rastreador.`);

  const partesId = String(unidade.Id).split('|');
  const ordem = partesId.length > 1 ? partesId[0] : '0';
  const idUnidade = partesId.at(-1);
  const historyForm = new URLSearchParams({
    __RequestVerificationToken: token,
    paramDataInicial: dataInicial,
    paramDataFinal: dataFinal,
    paramTempoMinutos: '',
    paramIsExibirHistoricoLBS: 'false',
    paramIsExibirHistoricoGPS: 'true',
    paramListRastreadorUnidadeRastreada: JSON.stringify([`${ordem}|${idUnidade}`]),
    paramDistanciaAgrupamentoPosicao: '10'
  });
  const historyResponse = await systemsatFetch(
    '/Operacional/ListHistoricoPosicaoMapa',
    cookies,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: historyForm
    }
  );
  if (!historyResponse.ok) {
    throw new Error('O rastreador não respondeu à consulta do histórico.');
  }

  const historyResult = await historyResponse.json();
  const historicos = Array.isArray(historyResult?.Data) ? historyResult.Data : [];
  const pontos = historicos
    .flatMap((historico: { HistoricoGrupoMapa?: unknown[] }) => (
      Array.isArray(historico?.HistoricoGrupoMapa) ? historico.HistoricoGrupoMapa : []
    ))
    .map((ponto: Record<string, unknown>) => ({
      id: ponto.IdPosicao,
      latitude: Number(ponto.Latitude),
      longitude: Number(ponto.Longitude),
      dataInicial: ponto.DataPosicaoInicial || null,
      dataFinal: ponto.DataPosicaoFinal || null,
      velocidade: Number(ponto.Velocidade) || 0,
      quantidadePosicoes: Number(ponto.QuantidadePosicoes) || 1,
      motorista: ponto.Motorista || null,
      tipo: String(ponto.IconeGrupo || '').toLowerCase().includes('ignicao')
        ? 'parado'
        : 'deslocamento'
    }))
    .filter((ponto: { latitude: number; longitude: number }) => (
      Number.isFinite(ponto.latitude)
      && Number.isFinite(ponto.longitude)
      && ponto.latitude !== 0
      && ponto.longitude !== 0
    ))
    .sort((a: { dataInicial: unknown }, b: { dataInicial: unknown }) => (
      new Date(String(a.dataInicial || 0)).getTime()
      - new Date(String(b.dataInicial || 0)).getTime()
    ));

  return {
    placa,
    unidade: historicos[0]?.UnidadeRastreada || unidade.Nome,
    dataInicial,
    dataFinal,
    pontos: pontos.slice(0, 10000),
    truncado: pontos.length > 10000
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Método não permitido.' }, 405);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization || !(await validarUsuario(authorization))) {
    return jsonResponse({ success: false, message: 'Sessão inválida ou expirada.' }, 401);
  }

  try {
    const body = await request.json();

    if (body?.acao === 'frota') {
      const data = await consultarFrotaSystemsat(authorization, body?.filial);
      return jsonResponse({ success: true, data });
    }

    const placa = normalizarPlaca(body?.placa);
    if (placa.length !== 7) {
      return jsonResponse({ success: false, message: 'Informe uma placa válida.' }, 400);
    }

    if (body?.acao === 'historico') {
      const inicio = new Date(body?.dataInicial);
      const termino = new Date(body?.dataFinal);
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime())) {
        return jsonResponse({ success: false, message: 'Informe um período válido.' }, 400);
      }
      if (termino <= inicio) {
        return jsonResponse({
          success: false,
          message: 'A data final deve ser posterior à data inicial.'
        }, 400);
      }

      const limitePeriodoMs = 30 * 24 * 60 * 60 * 1000;
      if (termino.getTime() - inicio.getTime() > limitePeriodoMs) {
        return jsonResponse({
          success: false,
          message: 'O período máximo por consulta é de 30 dias.'
        }, 400);
      }

      const data = await consultarHistoricoSystemsat(
        placa,
        inicio.toISOString(),
        termino.toISOString()
      );
      return jsonResponse({ success: true, data });
    }

    const data = await consultarSystemsat(placa);
    return jsonResponse({ success: true, data });
  } catch (error) {
    console.error('Falha na integração Systemsat:', error);
    const message = error instanceof Error
      ? error.message
      : 'Não foi possível consultar o rastreador.';
    return jsonResponse({ success: false, message }, 502);
  }
});
