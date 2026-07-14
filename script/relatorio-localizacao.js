import { supabaseClient } from './supabase.js';

const form = document.getElementById('form-relatorio-localizacao');
const tipoBuscaInput = document.getElementById('relatorio-tipo-busca');
const placaInput = document.getElementById('relatorio-placa');
const termoLabel = document.getElementById('relatorio-termo-label');
const inicioInput = document.getElementById('relatorio-inicio');
const terminoInput = document.getElementById('relatorio-termino');
const listaVeiculos = document.getElementById('relatorio-lista-veiculos');
const botaoConsultar = document.getElementById('btn-consultar-historico');
const mensagem = document.getElementById('mensagem-relatorio-localizacao');
const resultadoEscala = document.getElementById('resultado-escala-localizacao');
const tabelaEscalaBody = document.getElementById('tabela-escala-localizacao-body');
const contadorEscala = document.getElementById('contador-escala-localizacao');
const resultado = document.getElementById('resultado-relatorio-localizacao');
const tabelaBody = document.getElementById('tabela-posicoes-body');
const contadorPosicoes = document.getElementById('contador-posicoes');
const botaoLimparFiltros = document.getElementById('btn-limpar-filtros-posicoes');
const resumoEscalaRotaLabel = document.getElementById('resumo-escala-rota-label');
const resumoEscalaRota = document.getElementById('resumo-escala-rota');
const resumoEscalaMotoristaLabel = document.getElementById('resumo-escala-motorista-label');
const resumoEscalaMotorista = document.getElementById('resumo-escala-motorista');
const resumoEscalaAuxiliarLabel = document.getElementById('resumo-escala-auxiliar-label');
const resumoEscalaAuxiliar = document.getElementById('resumo-escala-auxiliar');
const painelGoogleMaps = document.getElementById('mapa-google-relatorio');
const linkGoogleMaps = document.getElementById('link-google-maps-relatorio');
const painelRotaEmulada = document.getElementById('painel-rota-emulada');
const painelRotaResumo = document.getElementById('painel-rota-resumo');
const painelRotaParadas = document.getElementById('painel-rota-paradas');
const painelRotaAcoes = document.getElementById('painel-rota-acoes');
const painelClienteLista = document.getElementById('painel-cliente-lista');
const painelHotelLista = document.getElementById('painel-hotel-lista');
const painelPostoLista = document.getElementById('painel-posto-lista');
const abasPainelRota = document.querySelectorAll('.aba-painel-rota');
const linkPainelGoogleMaps = document.getElementById('link-painel-google-maps');
const btnFecharPainelRota = document.getElementById('btn-fechar-painel-rota');
const btnMostrarPainelRota = document.getElementById('btn-mostrar-painel-rota');

let mapa;
let camadaPercurso;
let camadaClientesRota;
let camadaFiliaisMarquespan;
let camadaHoteisRota;
let camadaPostosRota;
let marcadorSelecionado;
let pontosAtuais = [];
let segmentosRotaAtuais = [];
let clientesAtuais = [];
let hoteisAtuais = [];
let postosAtuais = [];
let abaPainelAtiva = 'rota';
let escalasPorDataAtual = new Map();
let ordenacaoTabela = { campo: 'dataInicial', direcao: 'asc' };
// Indice codigo/id -> marcador do Leaflet, para mover o pino no mapa na hora ao salvar uma
// geolocalizacao no popup, sem precisar refazer a consulta inteira. Cada "adicionarXNoMapa"
// registra/sobrescreve sua entrada aqui; entradas de consultas antigas somem sozinhas do uso
// (o popup delas ja fecha quando o marcador antigo e removido do mapa).
const marcadoresClientesPorCodigo = new Map();
const marcadoresHoteisPorId = new Map();
const marcadoresPostosPorId = new Map();
const GEOCODE_DELAY_MS = 1200;
const MAX_CLIENTES_ROTA_MAPA = 120;
const MAX_HOTEIS_ROTA_MAPA = 60;
const MAX_POSTOS_ROTA_MAPA = 60;
const OSRM_ROUTE_SERVICE_URL = 'https://router.project-osrm.org/route/v1/driving';
// Cadastro de hoteis muda pouco: guarda local por 24h para evitar reconsultar o Supabase a cada busca.
const CACHE_CADASTRO_TTL_MS = 24 * 60 * 60 * 1000;
// Clientes-por-rota e Postos-por-rota/periodo sao mais "operacionais" (vinculo cliente-rota, historico
// de abastecimento) do que cadastro puro, entao usam um TTL bem mais curto - qualquer alteracao feita
// nesta pagina (ex.: salvar geolocalizacao) tambem limpa esse cache na hora, sem esperar o TTL vencer.
const CACHE_ROTA_TTL_MS = 30 * 60 * 1000;
const CACHE_HOTEIS_KEY = 'relatorio_localizacao_cache_hoteis';
const MAX_PONTOS_ROTEIRIZACAO = 300;
const MAX_WAYPOINTS_OSRM = 60;
const MAX_WAYPOINTS_GOOGLE = 8;
const MAX_PARADAS_PAINEL_ROTA = 10;
const DISTANCIA_MINIMA_ROTEIRIZACAO_KM = 0.08;
const DISTANCIA_MAXIMA_TRECHO_ROTEIRIZACAO_KM = 80;
const MATRIZ_MARQUESPAN = {
  latitude: -23.330692,
  longitude: -47.851799
};

const filtrosTabela = {
  indice: document.getElementById('filtro-posicao-indice'),
  data: document.getElementById('filtro-posicao-data'),
  dataFinal: document.getElementById('filtro-posicao-data-final'),
  rota: document.getElementById('filtro-posicao-rota'),
  motorista: document.getElementById('filtro-posicao-motorista'),
  auxiliar: document.getElementById('filtro-posicao-auxiliar'),
  velocidade: document.getElementById('filtro-posicao-velocidade'),
  situacao: document.getElementById('filtro-posicao-situacao'),
  tempoParado: document.getElementById('filtro-posicao-tempo-parado'),
  cidade: document.getElementById('filtro-posicao-cidade'),
  coordenadas: document.getElementById('filtro-posicao-coordenadas'),
  quantidade: document.getElementById('filtro-posicao-quantidade')
};

function normalizarPlaca(valor) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarTextoBusca(valor) {
  return String(valor || '').trim();
}

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function limparTexto(valor) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizarRotaCliente(valor) {
  const texto = limparTexto(valor);
  const numero = texto.match(/\d+/)?.[0];
  return numero ? numero.replace(/^0+(?=\d)/, '') : texto;
}

function formatarPlaca(valor) {
  const placa = normalizarPlaca(valor);
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

function valorDataLocal(data) {
  const ajuste = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - ajuste).toISOString().slice(0, 16);
}

function definirPeriodoPadrao() {
  const termino = new Date();
  const inicio = new Date(termino.getTime() - (2 * 60 * 60 * 1000));
  inicioInput.value = valorDataLocal(inicio);
  terminoInput.value = valorDataLocal(termino);
}

function formatarData(valor) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(data);
}

function formatarDataCurtaISO(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = String(dataISO).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : dataISO;
}

function obterDataISOInput(valor) {
  return String(valor || '').slice(0, 10);
}

function obterDataISOLocal(valor) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return obterDataISOInput(valor);

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function valorResumoEscala(valor) {
  const texto = String(valor || '').trim();
  return texto || 'Não informado';
}

function calcularTempoParadoMs(ponto) {
  if (ponto?.tipo !== 'parado') return 0;

  const inicio = new Date(ponto.dataInicial || 0).getTime();
  if (!Number.isFinite(inicio)) return 0;

  const dataFinal = new Date(ponto.dataFinal || 0).getTime();
  if (Number.isFinite(dataFinal) && dataFinal > inicio) {
    return dataFinal - inicio;
  }

  const proximoPonto = pontosAtuais[ponto.indiceOriginal + 1];
  const proximoInicio = new Date(proximoPonto?.dataInicial || 0).getTime();
  if (Number.isFinite(proximoInicio) && proximoInicio > inicio) {
    return proximoInicio - inicio;
  }

  return 0;
}

function formatarDuracao(ms) {
  const totalSegundos = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (!totalSegundos) return '-';

  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

function obterDataTerminoParada(ponto) {
  const inicio = new Date(ponto?.dataInicial || 0).getTime();
  if (!Number.isFinite(inicio)) return null;

  const dataFinal = new Date(ponto?.dataFinal || 0);
  if (Number.isFinite(dataFinal.getTime()) && dataFinal.getTime() > inicio) {
    return dataFinal;
  }

  const proximoPonto = pontosAtuais[ponto.indiceOriginal + 1];
  const proximoInicio = new Date(proximoPonto?.dataInicial || 0);
  return Number.isFinite(proximoInicio.getTime()) && proximoInicio.getTime() > inicio
    ? proximoInicio
    : null;
}

function linhasTempoPopup(ponto) {
  if (ponto?.tipo !== 'parado') {
    return `${formatarData(ponto.dataInicial)}<br>`;
  }

  const termino = obterDataTerminoParada(ponto);
  return `
    In&iacute;cio da parada: ${formatarData(ponto.dataInicial)}<br>
    T&eacute;rmino da parada: ${termino ? formatarData(termino) : 'N&atilde;o informado'}<br>
    Tempo parado: ${formatarDuracao(calcularTempoParadoMs(ponto))}<br>
  `;
}

function obterEscalasDoPonto(ponto) {
  const dataEscala = obterDataISOLocal(ponto?.dataInicial);
  return escalasPorDataAtual.get(dataEscala) || [];
}

function obterCampoEscalaPonto(ponto, campo) {
  const valores = obterEscalasDoPonto(ponto)
    .map((escala) => String(escala[campo] || '').trim())
    .filter(Boolean);
  return valores.length ? Array.from(new Set(valores)).join(' / ') : '-';
}

function iniciarMapa() {
  if (typeof window.L === 'undefined') {
    mostrarMensagem(
      'Não foi possível carregar o mapa. Atualize a página e verifique a conexão com a internet.',
      true
    );
    botaoConsultar.disabled = true;
    return false;
  }

  mapa = L.map('mapa-relatorio-localizacao', {
    preferCanvas: true
  }).setView([-23.5505, -46.6333], 8);

  const camadaMapa = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });

  const camadaSatelite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }
  );
  const camadaRotulos = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Labels &copy; Esri'
    }
  );
  const camadaHibrida = L.layerGroup([camadaSatelite, camadaRotulos]);

  camadaMapa.addTo(mapa);
  L.control.layers({
    'Mapa': camadaMapa,
    'Satélite': camadaSatelite
  }, null, {
    collapsed: true,
    position: 'topright'
  }).addTo(mapa);

  camadaPercurso = L.layerGroup().addTo(mapa);
  camadaClientesRota = L.layerGroup().addTo(mapa);
  camadaFiliaisMarquespan = L.layerGroup().addTo(mapa);
  camadaHoteisRota = L.layerGroup().addTo(mapa);
  camadaPostosRota = L.layerGroup().addTo(mapa);
  return true;
}

function distanciaKm(a, b) {
  const raio = 6371;
  const rad = (graus) => graus * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * raio * Math.asin(Math.sqrt(haversine));
}

function calcularDistancia(pontos) {
  let total = 0;
  for (let indice = 1; indice < pontos.length; indice += 1) {
    const trecho = distanciaKm(pontos[indice - 1], pontos[indice]);
    if (trecho < 10) total += trecho;
  }
  return total;
}

function coordenadasBrutas(pontos) {
  return pontos.map((ponto) => [ponto.latitude, ponto.longitude]);
}

// Projeta um ponto bruto de GPS sobre o segmento de reta [a, b] mais proximo, usando uma
// aproximacao planar (compensando a longitude pelo cosseno da latitude). Suficiente em escala
// urbana e evita puxar dependencias externas so para achar "ponto mais proximo na linha".
function projetarPontoNoSegmento(ponto, a, b) {
  const cosLat = Math.cos((a[0] * Math.PI) / 180) || 1;
  const ax = a[1] * cosLat;
  const ay = a[0];
  const bx = b[1] * cosLat;
  const by = b[0];
  const px = ponto.longitude * cosLat;
  const py = ponto.latitude;

  const dx = bx - ax;
  const dy = by - ay;
  const comprimentoQuadrado = dx * dx + dy * dy;
  let t = comprimentoQuadrado > 0 ? ((px - ax) * dx + (py - ay) * dy) / comprimentoQuadrado : 0;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const distanciaQuadrada = (px - projX) ** 2 + (py - projY) ** 2;

  return { latitude: projY, longitude: projX / cosLat, distanciaQuadrada };
}

// Encontra, dentre todos os segmentos da linha roteirizada, o ponto mais proximo do ponto bruto
// de GPS informado. Usado para "colar" os marcadores (parada/inicio/fim/ignicao) na linha verde,
// ja que ela e recalculada pelo OSRM e nao coincide pixel a pixel com a coordenada bruta do rastreador.
function coordenadaVisualNaLinha(ponto, segmentos) {
  if (!Array.isArray(segmentos) || !segmentos.length) return [ponto.latitude, ponto.longitude];

  let melhor = null;
  segmentos.forEach((segmento) => {
    for (let indice = 1; indice < segmento.length; indice += 1) {
      const candidato = projetarPontoNoSegmento(ponto, segmento[indice - 1], segmento[indice]);
      if (!melhor || candidato.distanciaQuadrada < melhor.distanciaQuadrada) {
        melhor = candidato;
      }
    }
  });

  return melhor ? [melhor.latitude, melhor.longitude] : [ponto.latitude, ponto.longitude];
}

function coordenadaGoogle(ponto) {
  return `${Number(ponto.latitude).toFixed(6)},${Number(ponto.longitude).toFixed(6)}`;
}

function pontoValidoRoteirizacao(ponto) {
  return Number.isFinite(ponto?.latitude)
    && Number.isFinite(ponto?.longitude)
    && ponto.latitude >= -90
    && ponto.latitude <= 90
    && ponto.longitude >= -180
    && ponto.longitude <= 180;
}

function simplificarPontosRoteirizacao(pontos) {
  const validos = pontos.filter(pontoValidoRoteirizacao);
  if (validos.length <= 2) return validos;

  const reduzidos = [validos[0]];
  for (let indice = 1; indice < validos.length - 1; indice += 1) {
    const ponto = validos[indice];
    const ultimo = reduzidos[reduzidos.length - 1];
    if (distanciaKm(ultimo, ponto) >= DISTANCIA_MINIMA_ROTEIRIZACAO_KM) {
      reduzidos.push(ponto);
    }
  }
  reduzidos.push(validos[validos.length - 1]);

  if (reduzidos.length <= MAX_PONTOS_ROTEIRIZACAO) return reduzidos;

  const passo = Math.ceil(reduzidos.length / MAX_PONTOS_ROTEIRIZACAO);
  return reduzidos.filter((_, indice) => indice === 0
    || indice === reduzidos.length - 1
    || indice % passo === 0);
}

function dividirPontosRoteirizacao(pontos) {
  const segmentos = [];
  let segmentoAtual = [];

  pontos.forEach((ponto) => {
    const anterior = segmentoAtual[segmentoAtual.length - 1];
    if (anterior && distanciaKm(anterior, ponto) > DISTANCIA_MAXIMA_TRECHO_ROTEIRIZACAO_KM) {
      if (segmentoAtual.length >= 2) segmentos.push(segmentoAtual);
      segmentoAtual = [ponto];
      return;
    }

    segmentoAtual.push(ponto);
    if (segmentoAtual.length >= MAX_WAYPOINTS_OSRM) {
      segmentos.push(segmentoAtual);
      segmentoAtual = [ponto];
    }
  });

  if (segmentoAtual.length >= 2) segmentos.push(segmentoAtual);
  return segmentos;
}

async function buscarSegmentoRoteirizado(segmento) {
  const coordenadas = segmento
    .map((ponto) => `${ponto.longitude},${ponto.latitude}`)
    .join(';');
  const url = `${OSRM_ROUTE_SERVICE_URL}/${coordenadas}?overview=full&geometries=geojson&steps=false`;
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`OSRM retornou ${resposta.status}`);
  }

  const dados = await resposta.json();
  const rota = dados?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(rota) || rota.length < 2) {
    throw new Error('OSRM nao retornou geometria para o percurso.');
  }

  return rota.map(([longitude, latitude]) => [latitude, longitude]);
}

async function obterSegmentosRoteirizados(pontos) {
  const pontosRoteirizacao = simplificarPontosRoteirizacao(pontos);
  if (pontosRoteirizacao.length < 2) {
    return [coordenadasBrutas(pontos)];
  }

  const segmentos = dividirPontosRoteirizacao(pontosRoteirizacao);
  if (!segmentos.length) {
    return [coordenadasBrutas(pontos)];
  }

  try {
    const rotas = [];
    for (const segmento of segmentos) {
      rotas.push(await buscarSegmentoRoteirizado(segmento));
    }
    return rotas;
  } catch (error) {
    console.warn('Nao foi possivel roteirizar o percurso pelas vias. Usando coordenadas brutas.', error);
    return [coordenadasBrutas(pontos)];
  }
}

function selecionarWaypointsGoogle(pontos) {
  const intermediarios = simplificarPontosRoteirizacao(pontos).slice(1, -1);
  if (intermediarios.length <= MAX_WAYPOINTS_GOOGLE) return intermediarios;

  const selecionados = [];
  const intervalo = intermediarios.length / (MAX_WAYPOINTS_GOOGLE + 1);
  for (let indice = 1; indice <= MAX_WAYPOINTS_GOOGLE; indice += 1) {
    selecionados.push(intermediarios[Math.round(intervalo * indice) - 1]);
  }

  return selecionados.filter(Boolean);
}

function montarUrlGoogleMapsPercurso(pontos) {
  const validos = pontos.filter(pontoValidoRoteirizacao);
  if (validos.length < 2) return '';

  const origem = validos[0];
  const destino = validos[validos.length - 1];
  const parametros = new URLSearchParams({
    api: '1',
    origin: coordenadaGoogle(origem),
    destination: coordenadaGoogle(destino),
    travelmode: 'driving'
  });

  const waypoints = selecionarWaypointsGoogle(validos);
  if (waypoints.length) {
    parametros.set('waypoints', waypoints.map(coordenadaGoogle).join('|'));
  }
  return `https://www.google.com/maps/dir/?${parametros.toString()}`;
}

function atualizarMapaGooglePercurso(pontos) {
  if (!painelGoogleMaps || !linkGoogleMaps) return;

  const urlExterna = montarUrlGoogleMapsPercurso(pontos);
  if (!urlExterna) {
    painelGoogleMaps.hidden = true;
    linkGoogleMaps.href = '#';
    return;
  }

  linkGoogleMaps.href = urlExterna;
  painelGoogleMaps.hidden = false;
}

function obterRotuloPontoRota(ponto, tipo) {
  if (tipo === 'inicio') return 'Inicio do percurso';
  if (tipo === 'fim') return 'Fim do percurso';

  const cidade = limparTexto(ponto.cidade);
  if (cidade) return cidade;

  return `${Number(ponto.latitude).toFixed(5)}, ${Number(ponto.longitude).toFixed(5)}`;
}

function selecionarPontosPainelRota(pontos) {
  const validos = pontos.filter(pontoValidoRoteirizacao);
  if (validos.length < 2) return [];

  const inicio = { ponto: validos[0], tipo: 'inicio' };
  const fim = { ponto: validos[validos.length - 1], tipo: 'fim' };
  const paradas = validos
    .filter((ponto, indice) => indice > 0 && indice < validos.length - 1 && ponto.tipo === 'parado')
    .slice(0, MAX_PARADAS_PAINEL_ROTA)
    .map((ponto) => ({ ponto, tipo: 'parada' }));

  return [inicio, ...paradas, fim];
}

function formatarDistanciaResumo(km) {
  return `${Number(km || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} km`;
}

function formatarTempoEstimado(km) {
  const minutos = Math.max(1, Math.round((Number(km) || 0) / 55 * 60));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas ? `${horas}h${String(resto).padStart(2, '0')}` : `${resto} min`;
}

function atualizarPainelRotaEmulada(pontos) {
  if (!painelRotaEmulada || !painelRotaResumo || !painelRotaParadas || !linkPainelGoogleMaps) return;

  const itens = selecionarPontosPainelRota(pontos);
  const urlGoogle = montarUrlGoogleMapsPercurso(pontos);
  if (itens.length < 2 || !urlGoogle) {
    painelRotaEmulada.hidden = true;
    btnMostrarPainelRota.hidden = true;
    return;
  }

  const distancia = calcularDistancia(pontos);
  painelRotaResumo.innerHTML = `
    <strong>${formatarTempoEstimado(distancia)}</strong>
    <span>${formatarDistanciaResumo(distancia)}</span>
  `;

  painelRotaParadas.innerHTML = itens.map(({ ponto, tipo }) => `
    <li class="${tipo}">
      <span class="rota-ponto-marcador"></span>
      <button type="button" data-indice="${ponto.indiceOriginal}">
        <strong>${escaparHTML(obterRotuloPontoRota(ponto, tipo))}</strong>
        <small>${formatarData(ponto.dataInicial)}</small>
      </button>
    </li>
  `).join('');

  linkPainelGoogleMaps.href = urlGoogle;
  painelRotaEmulada.hidden = false;
  btnMostrarPainelRota.hidden = true;
  selecionarAbaPainel('rota');
}

function popupPonto(ponto, titulo) {
  const dataEscala = obterDataISOLocal(ponto.dataInicial);
  const escalasDoDia = obterEscalasDoPonto(ponto);
  const linhasEscala = escalasDoDia.length > 0
    ? escalasDoDia.map((escala) => `
    <strong>Escala ${formatarDataCurtaISO(dataEscala)}</strong><br>
    Rota: ${valorResumoEscala(escala.rota)}<br>
    Motorista: ${valorResumoEscala(escala.motorista)}<br>
    Auxiliar: ${valorResumoEscala(escala.auxiliar)}<br>
    `).join('')
    : `
    <strong>Escala ${formatarDataCurtaISO(dataEscala)}</strong><br>
    Sem escala para esta placa no dia<br>
    `;

  const streetViewUrl = `https://www.google.com/maps?q=&layer=c&cbll=${ponto.latitude},${ponto.longitude}`;
  return `
    <strong>${titulo}</strong><br>
    ${linhasTempoPopup(ponto)}
    ${linhasEscala}
    Velocidade: ${Math.round(ponto.velocidade || 0)} km/h<br>
    ${ponto.latitude.toFixed(6)}, ${ponto.longitude.toFixed(6)}<br><br>
    <a href="${streetViewUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;color:#1a73e8;font-size:13px;text-decoration:none;">
      <i class="fas fa-street-view"></i> Abrir no Street View
    </a>
  `;
}

async function desenharMapa(pontos) {
  if (!mapa || !camadaPercurso) {
    throw new Error('O mapa não foi carregado. Atualize a página e tente novamente.');
  }

  camadaPercurso.clearLayers();
  camadaClientesRota?.clearLayers();
  camadaFiliaisMarquespan?.clearLayers();
  camadaHoteisRota?.clearLayers();
  camadaPostosRota?.clearLayers();
  if (marcadorSelecionado) {
    mapa.removeLayer(marcadorSelecionado);
    marcadorSelecionado = null;
  }

  const coordenadas = coordenadasBrutas(pontos);
  atualizarMapaGooglePercurso(pontos);
  atualizarPainelRotaEmulada(pontos);
  const segmentosRoteirizados = await obterSegmentosRoteirizados(pontos);
  segmentosRotaAtuais = segmentosRoteirizados;
  segmentosRoteirizados.forEach((segmento) => {
    L.polyline(segmento, {
      color: '#008f57',
      opacity: 0.88,
      weight: 5
    }).addTo(camadaPercurso);
  });

  const inicio = pontos[0];
  const fim = pontos[pontos.length - 1];
  L.circleMarker(coordenadaVisualNaLinha(inicio, segmentosRoteirizados), {
    color: '#fff',
    fillColor: '#198754',
    fillOpacity: 1,
    radius: 9,
    weight: 3
  }).bindPopup(popupPonto(inicio, 'Início do percurso')).addTo(camadaPercurso);

  // Só exibe no mapa paradas com duração mínima de 2 minutos para evitar sinais/GPS oscilado
  const DURACAO_MIN_PARADA_MS = 2 * 60 * 1000;
  const paradas = pontos
    .filter((ponto) => ponto.tipo === 'parado' && calcularTempoParadoMs(ponto) >= DURACAO_MIN_PARADA_MS)
    .slice(0, 200);
  paradas.forEach((ponto) => {
    L.circleMarker(coordenadaVisualNaLinha(ponto, segmentosRoteirizados), {
      color: '#fff',
      fillColor: '#ff8a34',
      fillOpacity: 0.95,
      radius: 6,
      weight: 2
    }).bindPopup(popupPonto(ponto, 'Parada')).addTo(camadaPercurso);
  });

  // Marcadores de mudança de ignição: detecta transições on→off e off→on entre pontos consecutivos
  for (let i = 1; i < pontos.length; i++) {
    const ant = pontos[i - 1];
    const cur = pontos[i];
    if (ant.ignicao == null || cur.ignicao == null || ant.ignicao === cur.ignicao) continue;

    const ligada = cur.ignicao === true;
    const iconeIgnicao = L.divIcon({
      html: `<div class="ignicao-marker ${ligada ? 'ignicao-on' : 'ignicao-off'}"><i class="fas fa-key"></i></div>`,
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    L.marker(coordenadaVisualNaLinha(cur, segmentosRoteirizados), { icon: iconeIgnicao })
      .bindPopup(popupPonto(cur, ligada ? 'Ignição ligada' : 'Ignição desligada'))
      .addTo(camadaPercurso);
  }

  L.circleMarker(coordenadaVisualNaLinha(fim, segmentosRoteirizados), {
    color: '#fff',
    fillColor: '#e62f47',
    fillOpacity: 1,
    radius: 9,
    weight: 3
  }).bindPopup(popupPonto(fim, 'Fim do percurso')).addTo(camadaPercurso);

  mapa.fitBounds(L.latLngBounds(coordenadas), {
    padding: [30, 30],
    maxZoom: 16
  });
  setTimeout(() => mapa.invalidateSize(), 50);
}

function montarEnderecoCliente(cliente) {
  return [
    cliente.endereco,
    cliente.bairro,
    cliente.municipio,
    cliente.uf,
    cliente.cep,
    'Brasil'
  ].map(limparTexto).filter(Boolean).join(', ');
}

function isMatrizMarquespan(cliente) {
  return cliente?.categoria === 'Grupo Marquespan'
    && String(cliente.endereco || '').toUpperCase().includes('ANNA INGHES DEL FIOL');
}

function aplicarCoordenadasFixasCliente(cliente) {
  if (!isMatrizMarquespan(cliente)) return false;
  cliente.lat = MATRIZ_MARQUESPAN.latitude;
  cliente.lng = MATRIZ_MARQUESPAN.longitude;
  return true;
}

function obterCoordenadasGeolocalizacao(valor) {
  const texto = limparTexto(valor);
  if (!texto) return null;

  const partes = texto
    .replace(/[;]/g, ',')
    .split(',')
    .map((parte) => Number(String(parte).trim().replace(',', '.')));

  if (partes.length < 2) return null;
  const [lat, lng] = partes;
  const coordenadasValidas = Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;

  return coordenadasValidas ? { lat, lng } : null;
}

function aplicarGeolocalizacaoCliente(cliente) {
  const coordenadas = obterCoordenadasGeolocalizacao(cliente?.geolocalizacao);
  if (!coordenadas) return false;
  cliente.lat = coordenadas.lat;
  cliente.lng = coordenadas.lng;
  return true;
}

function valorGeolocalizacaoCliente(cliente) {
  const coordenadasCadastradas = obterCoordenadasGeolocalizacao(cliente?.geolocalizacao);
  if (coordenadasCadastradas) {
    return `${coordenadasCadastradas.lat.toFixed(6)}, ${coordenadasCadastradas.lng.toFixed(6)}`;
  }
  if (Number.isFinite(cliente?.lat) && Number.isFinite(cliente?.lng)) {
    return `${cliente.lat.toFixed(6)}, ${cliente.lng.toFixed(6)}`;
  }
  return '';
}

function controlesGeolocalizacaoCliente(cliente) {
  const valor = valorGeolocalizacaoCliente(cliente);
  return `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
      <label style="display:block;font-size:11px;font-weight:700;color:#374151;margin-bottom:3px;">Geolocalizacao</label>
      <input
        type="text"
        class="input-geolocalizacao-cliente"
        value="${escaparHTML(valor)}"
        placeholder="-23.330692, -47.851799"
        style="box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:5px 7px;font-size:12px;"
      >
      <button
        type="button"
        data-codigo-cliente="${escaparHTML(cliente.codigo)}"
        onclick="window.salvarGeolocalizacaoClienteRelatorio(this)"
        style="margin-top:6px;border:0;border-radius:6px;background:#006937;color:#fff;padding:5px 8px;font-size:12px;cursor:pointer;"
      >Salvar geolocalizacao</button>
      <span class="status-geolocalizacao-cliente" style="display:block;margin-top:4px;font-size:11px;color:#64748b;"></span>
    </div>
  `;
}

function urlStreetViewPorCoordenadas(coordenadas) {
  if (!coordenadas) return '#';
  return `https://www.google.com/maps?q=&layer=c&cbll=${coordenadas.lat},${coordenadas.lng}`;
}

function obterContainerPopupCliente(elemento) {
  return elemento?.closest('.leaflet-popup-content') || elemento?.closest('div');
}

function atualizarLinkStreetViewCliente(container, coordenadas) {
  const link = container?.querySelector('.link-streetview-cliente');
  if (!link || !coordenadas) return;
  link.href = urlStreetViewPorCoordenadas(coordenadas);
}

function abrirStreetViewClienteRelatorio(link) {
  const container = obterContainerPopupCliente(link);
  const input = container?.querySelector('.input-geolocalizacao-cliente');
  const coordenadas = obterCoordenadasGeolocalizacao(input?.value);

  if (!coordenadas) {
    window.open(link.href, '_blank', 'noopener');
    return false;
  }

  const url = urlStreetViewPorCoordenadas(coordenadas);
  link.href = url;
  window.open(url, '_blank', 'noopener');
  return false;
}

async function salvarGeolocalizacaoClienteRelatorio(botao) {
  const container = obterContainerPopupCliente(botao);
  const input = container?.querySelector('.input-geolocalizacao-cliente');
  const status = container?.querySelector('.status-geolocalizacao-cliente');
  const codigo = limparTexto(botao?.dataset?.codigoCliente);
  const valor = limparTexto(input?.value);
  const coordenadas = obterCoordenadasGeolocalizacao(valor);

  if (!codigo) {
    if (status) status.textContent = 'Cliente nao identificado.';
    return;
  }
  if (!coordenadas) {
    if (status) status.textContent = 'Informe no formato latitude, longitude.';
    input?.focus();
    return;
  }

  const valorNormalizado = `${coordenadas.lat.toFixed(6)}, ${coordenadas.lng.toFixed(6)}`;
  botao.disabled = true;
  if (status) status.textContent = 'Salvando...';

  try {
    const { error } = await supabaseClient
      .from('clientes')
      .update({ geolocalizacao: valorNormalizado })
      .eq('codigo', codigo);
    if (error) throw error;

    if (input) input.value = valorNormalizado;
    atualizarLinkStreetViewCliente(container, coordenadas);
    if (status) status.textContent = 'Geolocalizacao salva no cadastro.';
    limparCachesComPrefixo('relatorio_localizacao_cache_clientes_rota_');
    // Move o pino no mapa na hora, sem esperar uma nova consulta.
    marcadoresClientesPorCodigo.get(codigo)?.setLatLng([coordenadas.lat, coordenadas.lng]);
    mostrarMensagem(`Geolocalizacao do cliente ${codigo} atualizada.`);
  } catch (error) {
    console.error('Erro ao salvar geolocalizacao do cliente:', error);
    if (status) status.textContent = 'Erro ao salvar geolocalizacao.';
    mostrarMensagem(error?.message || 'Nao foi possivel salvar a geolocalizacao do cliente.', true);
  } finally {
    botao.disabled = false;
  }
}

window.salvarGeolocalizacaoClienteRelatorio = salvarGeolocalizacaoClienteRelatorio;
window.abrirStreetViewClienteRelatorio = abrirStreetViewClienteRelatorio;

function normalizarLogradouroCliente(endereco) {
  return limparTexto(endereco)
    .replace(/^(R|RUA)\s*[:.-]?\s*/i, 'Rua ')
    .replace(/^(AV|AVENIDA)\s*[:.-]?\s*/i, 'Avenida ')
    .replace(/^(ROD|RODOVIA)\s*[:.-]?\s*/i, 'Rodovia ')
    .replace(/^(EST|ESTRADA)\s*[:.-]?\s*/i, 'Estrada ');
}

function montarConsultasGeocodeCliente(cliente) {
  const rua = normalizarLogradouroCliente(cliente.endereco);
  const bairro = limparTexto(cliente.bairro);
  const cidade = limparTexto(cliente.municipio);
  const uf = limparTexto(cliente.uf);
  const cep = limparTexto(cliente.cep);
  const consultas = [];

  if (rua && cidade && uf) {
    consultas.push({ street: rua, city: cidade, state: uf, country: 'Brasil', postalcode: cep });
    consultas.push({ q: [rua, bairro, cidade, uf, 'Brasil'].filter(Boolean).join(', ') });
    consultas.push({ q: [rua, cidade, uf, 'Brasil'].filter(Boolean).join(', ') });
  }
  if (cep && cidade && uf) consultas.push({ q: [cep, cidade, uf, 'Brasil'].join(', ') });
  if (cidade && uf) consultas.push({ city: cidade, state: uf, country: 'Brasil' });

  return consultas;
}

// Cache local (localStorage) do cadastro de clientes/hoteis/postos.
// Evita reconsultar o Supabase a cada abertura do relatorio quando o cadastro nao mudou.
function obterCacheCadastro(chave, ttlMs = CACHE_CADASTRO_TTL_MS) {
  try {
    const bruto = JSON.parse(localStorage.getItem(chave) || 'null');
    if (!bruto || !Array.isArray(bruto.dados) || !Number.isFinite(bruto.salvoEm)) return null;
    if (Date.now() - bruto.salvoEm > ttlMs) return null;
    return bruto.dados;
  } catch {
    return null;
  }
}

function salvarCacheCadastro(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify({ dados, salvoEm: Date.now() }));
  } catch (error) {
    console.warn(`Não foi possível salvar cache local (${chave}):`, error);
  }
}

function atualizarItemCacheCadastro(chave, campoChave, valorChave, atualizacoes) {
  const cache = obterCacheCadastro(chave);
  if (!cache) return;
  const item = cache.find((registro) => String(registro[campoChave]) === String(valorChave));
  if (!item) return;
  Object.assign(item, atualizacoes);
  salvarCacheCadastro(chave, cache);
}

async function obterDadosCadastroComCache(chave, buscarFn) {
  const cache = obterCacheCadastro(chave);
  if (cache) return cache;
  const dados = await buscarFn();
  salvarCacheCadastro(chave, dados);
  return dados;
}

// Monta uma chave de cache estavel para um conjunto de rotas (ordem nao importa).
function chaveCacheRota(prefixo, partes) {
  return `relatorio_localizacao_cache_${prefixo}_${[...partes].sort().join('|')}`;
}

// Invalidacao "grosseira": quando o usuario edita a geolocalizacao de um registro nesta pagina,
// apaga todo cache por-rota daquele tipo (cliente/posto) para forcar uma releitura fresca na
// proxima consulta. Mais simples e seguro do que tentar localizar o registro dentro de cada
// combinacao de rotas ja cacheada.
function limparCachesComPrefixo(prefixo) {
  try {
    Object.keys(localStorage)
      .filter((chave) => chave.startsWith(prefixo))
      .forEach((chave) => localStorage.removeItem(chave));
  } catch (error) {
    console.warn(`Não foi possível limpar cache local (${prefixo}):`, error);
  }
}

// Busca em paginas de 1000 linhas: um select simples fica sujeito ao limite padrao de linhas
// do Supabase/PostgREST e trunca silenciosamente o resultado se a tabela crescer.
async function buscarTodasLinhas(nomeTabela, colunas) {
  const linhas = [];
  const passo = 1000;
  let inicio = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from(nomeTabela)
      .select(colunas)
      .range(inicio, inicio + passo - 1);
    if (error) throw error;

    linhas.push(...(data || []));
    if (!data || data.length < passo) break;
    inicio += passo;
  }

  return linhas;
}

function buscarHoteisCadastro() {
  return buscarTodasLinhas('hoteis', 'id, nome, razao_social, cnpj, telefone, responsavel, endereco, geolocalizacao');
}

function obterHoteisCadastroComCache() {
  return obterDadosCadastroComCache(CACHE_HOTEIS_KEY, buscarHoteisCadastro);
}

function obterCacheGeocodeClientes() {
  try {
    return JSON.parse(localStorage.getItem('roteirizar_rota_geocode_cache') || '{}');
  } catch {
    return {};
  }
}

function salvarCacheGeocodeClientes(cache) {
  localStorage.setItem('roteirizar_rota_geocode_cache', JSON.stringify(cache));
}

async function geocodificarConsultaCliente(consulta) {
  try {
    const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
      body: { acao: 'geocodificar', consulta }
    });
    if (error || !data?.success) return null;
    return data.data;
  } catch {
    return null;
  }
}

async function geocodificarClienteRota(cliente) {
  const consultas = montarConsultasGeocodeCliente(cliente);
  for (const consulta of consultas) {
    const posicao = await geocodificarConsultaCliente(consulta);
    if (posicao) return posicao;
    await sleep(250);
  }
  return null;
}

function adicionarClienteRotaNoMapa(cliente) {
  if (!Number.isFinite(cliente.lat) || !Number.isFinite(cliente.lng)) return;

  const isGrupoMarquespan = cliente.categoria === 'Grupo Marquespan';
  const isMatriz = isMatrizMarquespan(cliente);
  const camada = isGrupoMarquespan ? camadaFiliaisMarquespan : camadaClientesRota;
  if (!camada) return;

  let htmlIcone, tamanho, labelTipo;
  if (isMatriz) {
    htmlIcone = '<div class="matriz-marquespan-marker"><i class="fas fa-building"></i></div>';
    tamanho = 34;
    labelTipo = '<br><em style="color:#ef4444;font-size:11px;font-weight:700;">Matriz Marquespan</em>';
  } else if (isGrupoMarquespan) {
    htmlIcone = '<div class="filial-marquespan-marker"><i class="fas fa-building"></i></div>';
    tamanho = 34;
    labelTipo = '<br><em style="color:#22c55e;font-size:11px;">Filial Marquespan</em>';
  } else {
    htmlIcone = '<div class="cliente-rota-marker"><i class="fas fa-store"></i></div>';
    tamanho = 26;
    labelTipo = '';
  }

  const icone = L.divIcon({
    className: '',
    html: htmlIcone,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho],
    popupAnchor: [0, -tamanho]
  });

  const streetViewUrl = urlStreetViewPorCoordenadas(obterCoordenadasGeolocalizacao(valorGeolocalizacaoCliente(cliente)));
  cliente._marker = L.marker([cliente.lat, cliente.lng], { icon: icone })
    .bindPopup(`
      <strong>${escaparHTML(cliente.fantasia || cliente.nome || cliente.codigo)}</strong>${labelTipo}<br>
      Cliente: ${escaparHTML(cliente.codigo)}<br>
      Rota: ${escaparHTML(cliente.rota || '—')}<br>
      ${escaparHTML(cliente.enderecoMapa || montarEnderecoCliente(cliente))}<br>
      ${controlesGeolocalizacaoCliente(cliente)}<br>
      <a href="${streetViewUrl}" class="link-streetview-cliente" onclick="return window.abrirStreetViewClienteRelatorio(this)" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;color:#1a73e8;font-size:13px;text-decoration:none;">
        <i class="fas fa-street-view"></i> Abrir no Street View
      </a>
    `)
    .addTo(camada);

  if (cliente.codigo) marcadoresClientesPorCodigo.set(cliente.codigo, cliente._marker);
}

async function buscarClientesDasRotas(rotas) {
  const rotasNormalizadas = Array.from(new Set((rotas || []).map(normalizarRotaCliente).filter(Boolean)));
  if (!rotasNormalizadas.length) return [];

  const chaveCache = chaveCacheRota('clientes_rota', rotasNormalizadas);
  const cache = obterCacheCadastro(chaveCache, CACHE_ROTA_TTL_MS);
  if (cache) return cache;

  // Uma unica consulta para todas as rotas (em vez de uma consulta por rota em sequencia) -
  // .eq/.in fazem comparacao exata, entao nao ha risco de "1" casar com "12" aqui.
  const { data: rotasClientes, error: rotasError } = await supabaseClient
    .from('cliente_rotas')
    .select('cliente_codigo, rota, ativo')
    .in('rota', rotasNormalizadas)
    .eq('ativo', 'A')
    .limit(MAX_CLIENTES_ROTA_MAPA * rotasNormalizadas.length);
  if (rotasError) throw rotasError;

  const codigos = Array.from(new Set((rotasClientes || []).map((item) => item.cliente_codigo).filter(Boolean)));
  if (!codigos.length) {
    salvarCacheCadastro(chaveCache, []);
    return [];
  }

  const { data, error } = await supabaseClient
    .from('clientes')
    .select('codigo, fantasia, nome, uf, municipio, endereco, geolocalizacao, bairro, cep, categoria, ativo')
    .in('codigo', codigos);
  if (error) throw error;

  const rotaPorCodigo = new Map((rotasClientes || []).map((item) => [item.cliente_codigo, item.rota]));
  const resultado = (data || []).map((cliente) => ({
    ...cliente,
    rota: rotaPorCodigo.get(cliente.codigo) || ''
  })).slice(0, MAX_CLIENTES_ROTA_MAPA);

  salvarCacheCadastro(chaveCache, resultado);
  return resultado;
}

async function plotarClientesDasRotas(escalas) {
  if (!camadaClientesRota) return;
  camadaClientesRota.clearLayers();
  clientesAtuais = [];
  renderizarListaClientes();

  const rotas = Array.from(new Set((escalas || []).map((escala) => escala.rota).filter(Boolean)));
  if (!rotas.length) return;

  const clientes = await buscarClientesDasRotas(rotas);
  if (!clientes.length) return;

  const cache = obterCacheGeocodeClientes();
  let localizados = 0;
  let processados = 0;
  for (const cliente of clientes) {
    const endereco = montarEnderecoCliente(cliente);
    cliente.enderecoMapa = endereco;

    const temCoordenadaDireta = aplicarCoordenadasFixasCliente(cliente) || aplicarGeolocalizacaoCliente(cliente);
    if (!temCoordenadaDireta && cache[endereco]) {
      cliente.lat = cache[endereco].lat;
      cliente.lng = cache[endereco].lng;
    } else if (!temCoordenadaDireta) {
      const posicao = await geocodificarClienteRota(cliente);
      if (posicao) {
        cliente.lat = posicao.lat;
        cliente.lng = posicao.lng;
        cache[endereco] = posicao;
        salvarCacheGeocodeClientes(cache);
      }
      await sleep(GEOCODE_DELAY_MS);
    }

    if (Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng)) {
      adicionarClienteRotaNoMapa(cliente);
      localizados += 1;
    }

    processados += 1;
    if (processados % 5 === 0 || processados === clientes.length) {
      mostrarMensagem(`Geocodificando clientes da rota: ${processados} de ${clientes.length}...`);
    }
  }

  clientesAtuais = clientes.filter((cliente) => Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng));
  renderizarListaClientes();
  mostrarMensagem(`Histórico carregado. Clientes da rota no mapa: ${localizados} de ${clientes.length}.`);
}

async function plotarFiliaisMarquespan() {
  if (!camadaFiliaisMarquespan) return;
  camadaFiliaisMarquespan.clearLayers();

  const { data, error } = await supabaseClient
    .from('clientes')
    .select('codigo, fantasia, nome, uf, municipio, endereco, geolocalizacao, bairro, cep, categoria, ativo')
    .eq('categoria', 'Grupo Marquespan');
  if (error || !data?.length) return;

  const cache = obterCacheGeocodeClientes();
  for (const cliente of data) {
    const endereco = montarEnderecoCliente(cliente);
    cliente.enderecoMapa = endereco;

    const temCoordenadaDireta = aplicarCoordenadasFixasCliente(cliente) || aplicarGeolocalizacaoCliente(cliente);
    if (!temCoordenadaDireta && cache[endereco]) {
      cliente.lat = cache[endereco].lat;
      cliente.lng = cache[endereco].lng;
    } else if (!temCoordenadaDireta) {
      const posicao = await geocodificarClienteRota(cliente);
      if (posicao) {
        cliente.lat = posicao.lat;
        cliente.lng = posicao.lng;
        cache[endereco] = posicao;
        salvarCacheGeocodeClientes(cache);
      }
      await sleep(GEOCODE_DELAY_MS);
    }

    if (Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng)) {
      adicionarClienteRotaNoMapa(cliente);
    }
  }
}

function montarEnderecoHotel(hotel) {
  return [hotel.endereco, 'Brasil'].map(limparTexto).filter(Boolean).join(', ');
}

function aplicarGeolocalizacaoHotel(hotel) {
  const coordenadas = obterCoordenadasGeolocalizacao(hotel?.geolocalizacao);
  if (!coordenadas) return false;
  hotel.lat = coordenadas.lat;
  hotel.lng = coordenadas.lng;
  return true;
}

function normalizarListaRotas(valor) {
  return String(valor || '')
    .split(/[,;]/)
    .map((parte) => normalizarRotaCliente(parte))
    .filter(Boolean);
}

function valorGeolocalizacaoHotel(hotel) {
  const coordenadasCadastradas = obterCoordenadasGeolocalizacao(hotel?.geolocalizacao);
  if (coordenadasCadastradas) {
    return `${coordenadasCadastradas.lat.toFixed(6)}, ${coordenadasCadastradas.lng.toFixed(6)}`;
  }
  if (Number.isFinite(hotel?.lat) && Number.isFinite(hotel?.lng)) {
    return `${hotel.lat.toFixed(6)}, ${hotel.lng.toFixed(6)}`;
  }
  return '';
}

function controlesGeolocalizacaoHotel(hotel) {
  const valor = valorGeolocalizacaoHotel(hotel);
  return `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
      <label style="display:block;font-size:11px;font-weight:700;color:#374151;margin-bottom:3px;">Geolocalizacao</label>
      <input
        type="text"
        class="input-geolocalizacao-hotel"
        value="${escaparHTML(valor)}"
        placeholder="-23.330692, -47.851799"
        style="box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:5px 7px;font-size:12px;"
      >
      <button
        type="button"
        data-id-hotel="${escaparHTML(hotel.id)}"
        onclick="window.salvarGeolocalizacaoHotelRelatorio(this)"
        style="margin-top:6px;border:0;border-radius:6px;background:#006937;color:#fff;padding:5px 8px;font-size:12px;cursor:pointer;"
      >Salvar geolocalizacao</button>
      <span class="status-geolocalizacao-hotel" style="display:block;margin-top:4px;font-size:11px;color:#64748b;"></span>
    </div>
  `;
}

async function salvarGeolocalizacaoHotelRelatorio(botao) {
  const container = obterContainerPopupCliente(botao);
  const input = container?.querySelector('.input-geolocalizacao-hotel');
  const status = container?.querySelector('.status-geolocalizacao-hotel');
  const idHotel = limparTexto(botao?.dataset?.idHotel);
  const valor = limparTexto(input?.value);
  const coordenadas = obterCoordenadasGeolocalizacao(valor);

  if (!idHotel) {
    if (status) status.textContent = 'Hotel nao identificado.';
    return;
  }
  if (!coordenadas) {
    if (status) status.textContent = 'Informe no formato latitude, longitude.';
    input?.focus();
    return;
  }

  const valorNormalizado = `${coordenadas.lat.toFixed(6)}, ${coordenadas.lng.toFixed(6)}`;
  botao.disabled = true;
  if (status) status.textContent = 'Salvando...';

  try {
    const { error } = await supabaseClient
      .from('hoteis')
      .update({ geolocalizacao: valorNormalizado })
      .eq('id', idHotel);
    if (error) throw error;

    if (input) input.value = valorNormalizado;
    atualizarLinkStreetViewCliente(container, coordenadas);
    if (status) status.textContent = 'Geolocalizacao salva no cadastro.';
    atualizarItemCacheCadastro(CACHE_HOTEIS_KEY, 'id', idHotel, { geolocalizacao: valorNormalizado });
    // Move o pino no mapa na hora, sem esperar uma nova consulta.
    marcadoresHoteisPorId.get(String(idHotel))?.setLatLng([coordenadas.lat, coordenadas.lng]);
    mostrarMensagem('Geolocalizacao do hotel atualizada.');
  } catch (error) {
    console.error('Erro ao salvar geolocalizacao do hotel:', error);
    if (status) status.textContent = 'Erro ao salvar geolocalizacao.';
    mostrarMensagem(error?.message || 'Nao foi possivel salvar a geolocalizacao do hotel.', true);
  } finally {
    botao.disabled = false;
  }
}

window.salvarGeolocalizacaoHotelRelatorio = salvarGeolocalizacaoHotelRelatorio;

function montarConsultaGeocodeHotel(hotel) {
  const endereco = limparTexto(hotel.endereco);
  return endereco ? [{ q: `${endereco}, Brasil` }] : [];
}

async function geocodificarHotelRota(hotel) {
  const consultas = montarConsultaGeocodeHotel(hotel);
  for (const consulta of consultas) {
    const posicao = await geocodificarConsultaCliente(consulta);
    if (posicao) return posicao;
    await sleep(250);
  }
  return null;
}

function adicionarHotelRotaNoMapa(hotel) {
  if (!Number.isFinite(hotel.lat) || !Number.isFinite(hotel.lng)) return;
  if (!camadaHoteisRota) return;

  const icone = L.divIcon({
    className: '',
    html: '<div class="hotel-rota-marker"><i class="fas fa-hotel"></i></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });

  const streetViewUrl = urlStreetViewPorCoordenadas(obterCoordenadasGeolocalizacao(valorGeolocalizacaoHotel(hotel)));
  hotel._marker = L.marker([hotel.lat, hotel.lng], { icon: icone })
    .bindPopup(`
      <strong>${escaparHTML(hotel.nome || hotel.razao_social || 'Hotel')}</strong><br>
      ${hotel.razao_social ? `Razao Social: ${escaparHTML(hotel.razao_social)}<br>` : ''}
      ${hotel.cnpj ? `CNPJ: ${escaparHTML(hotel.cnpj)}<br>` : ''}
      ${hotel.telefone ? `Telefone: ${escaparHTML(hotel.telefone)}<br>` : ''}
      ${hotel.responsavel ? `Responsavel: ${escaparHTML(hotel.responsavel)}<br>` : ''}
      Rota(s): ${escaparHTML(hotel.rotas || '—')}<br>
      ${escaparHTML(hotel.enderecoMapa || montarEnderecoHotel(hotel))}<br>
      ${controlesGeolocalizacaoHotel(hotel)}<br>
      <a href="${streetViewUrl}" class="link-streetview-cliente" onclick="return window.abrirStreetViewClienteRelatorio(this)" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;color:#1a73e8;font-size:13px;text-decoration:none;">
        <i class="fas fa-street-view"></i> Abrir no Street View
      </a>
    `)
    .addTo(camadaHoteisRota);

  if (hotel.id != null) marcadoresHoteisPorId.set(String(hotel.id), hotel._marker);
}

async function buscarHoteisDasRotas(rotas) {
  const rotasNormalizadas = Array.from(new Set((rotas || []).map(normalizarRotaCliente).filter(Boolean)));
  if (!rotasNormalizadas.length) return [];

  // Uma consulta por rota (o "ilike" nao permite unificar num .in() sem risco de "1" casar com
  // "12"), mas disparadas em paralelo em vez de uma esperar a outra terminar.
  const resultadosPorRota = await Promise.all(rotasNormalizadas.map((rota) => supabaseClient
    .from('despesas')
    .select('id_hotel, numero_rota')
    .ilike('numero_rota', `%${rota}%`)
    .limit(200)));

  const erroDespesas = resultadosPorRota.find((res) => res.error);
  if (erroDespesas) throw erroDespesas.error;

  const despesasEncontradas = resultadosPorRota.flatMap((res) => res.data || []);

  // Confere com precisao (evita "1" casar com "12") comparando a lista normalizada de rotas de cada despesa.
  const rotasPorHotel = new Map();
  despesasEncontradas.forEach((despesa) => {
    if (!despesa.id_hotel) return;
    const rotasDaDespesa = normalizarListaRotas(despesa.numero_rota).filter((r) => rotasNormalizadas.includes(r));
    if (!rotasDaDespesa.length) return;

    const rotasAssociadas = rotasPorHotel.get(despesa.id_hotel) || new Set();
    rotasDaDespesa.forEach((r) => rotasAssociadas.add(r));
    rotasPorHotel.set(despesa.id_hotel, rotasAssociadas);
  });

  const idsHotel = Array.from(rotasPorHotel.keys()).slice(0, MAX_HOTEIS_ROTA_MAPA);
  if (!idsHotel.length) return [];

  const hoteisCadastro = await obterHoteisCadastroComCache();
  const hoteisPorId = new Map(hoteisCadastro.map((hotel) => [String(hotel.id), hotel]));

  return idsHotel
    .map((id) => hoteisPorId.get(String(id)))
    .filter(Boolean)
    .map((hotel) => ({
      ...hotel,
      rotas: Array.from(rotasPorHotel.get(hotel.id) || []).join(', ')
    }));
}

async function plotarHoteisDasRotas(escalas) {
  if (!camadaHoteisRota) return;
  camadaHoteisRota.clearLayers();
  hoteisAtuais = [];
  renderizarListaHoteis();

  const rotas = Array.from(new Set((escalas || []).map((escala) => escala.rota).filter(Boolean)));
  if (!rotas.length) return;

  const hoteis = await buscarHoteisDasRotas(rotas);
  if (!hoteis.length) return;

  const cache = obterCacheGeocodeClientes();
  let localizados = 0;
  for (const hotel of hoteis) {
    const endereco = montarEnderecoHotel(hotel);
    hotel.enderecoMapa = endereco;

    const temCoordenadaDireta = aplicarGeolocalizacaoHotel(hotel);
    if (!temCoordenadaDireta && cache[endereco]) {
      hotel.lat = cache[endereco].lat;
      hotel.lng = cache[endereco].lng;
    } else if (!temCoordenadaDireta) {
      const posicao = await geocodificarHotelRota(hotel);
      if (posicao) {
        hotel.lat = posicao.lat;
        hotel.lng = posicao.lng;
        cache[endereco] = posicao;
        salvarCacheGeocodeClientes(cache);
      }
      await sleep(GEOCODE_DELAY_MS);
    }

    if (Number.isFinite(hotel.lat) && Number.isFinite(hotel.lng)) {
      adicionarHotelRotaNoMapa(hotel);
      localizados += 1;
    }
  }

  hoteisAtuais = hoteis.filter((hotel) => Number.isFinite(hotel.lat) && Number.isFinite(hotel.lng));
  renderizarListaHoteis();
  mostrarMensagem(`Histórico carregado. Clientes e hoteis da rota no mapa (${localizados} hotel(is)).`);
}

function montarEnderecoPosto(posto) {
  return [posto.endereco, posto.cidade, posto.uf, 'Brasil'].map(limparTexto).filter(Boolean).join(', ');
}

function aplicarGeolocalizacaoPosto(posto) {
  const coordenadas = obterCoordenadasGeolocalizacao(posto?.geolocalizacao);
  if (!coordenadas) return false;
  posto.lat = coordenadas.lat;
  posto.lng = coordenadas.lng;
  return true;
}

function valorGeolocalizacaoPosto(posto) {
  const coordenadasCadastradas = obterCoordenadasGeolocalizacao(posto?.geolocalizacao);
  if (coordenadasCadastradas) {
    return `${coordenadasCadastradas.lat.toFixed(6)}, ${coordenadasCadastradas.lng.toFixed(6)}`;
  }
  if (Number.isFinite(posto?.lat) && Number.isFinite(posto?.lng)) {
    return `${posto.lat.toFixed(6)}, ${posto.lng.toFixed(6)}`;
  }
  return '';
}

function controlesGeolocalizacaoPosto(posto) {
  const valor = valorGeolocalizacaoPosto(posto);
  return `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
      <label style="display:block;font-size:11px;font-weight:700;color:#374151;margin-bottom:3px;">Geolocalizacao</label>
      <input
        type="text"
        class="input-geolocalizacao-posto"
        value="${escaparHTML(valor)}"
        placeholder="-23.330692, -47.851799"
        style="box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:5px 7px;font-size:12px;"
      >
      <button
        type="button"
        data-id-posto="${escaparHTML(posto.id)}"
        onclick="window.salvarGeolocalizacaoPostoRelatorio(this)"
        style="margin-top:6px;border:0;border-radius:6px;background:#006937;color:#fff;padding:5px 8px;font-size:12px;cursor:pointer;"
      >Salvar geolocalizacao</button>
      <span class="status-geolocalizacao-posto" style="display:block;margin-top:4px;font-size:11px;color:#64748b;"></span>
    </div>
  `;
}

async function salvarGeolocalizacaoPostoRelatorio(botao) {
  const container = obterContainerPopupCliente(botao);
  const input = container?.querySelector('.input-geolocalizacao-posto');
  const status = container?.querySelector('.status-geolocalizacao-posto');
  const idPosto = limparTexto(botao?.dataset?.idPosto);
  const valor = limparTexto(input?.value);
  const coordenadas = obterCoordenadasGeolocalizacao(valor);

  if (!idPosto) {
    if (status) status.textContent = 'Posto nao identificado.';
    return;
  }
  if (!coordenadas) {
    if (status) status.textContent = 'Informe no formato latitude, longitude.';
    input?.focus();
    return;
  }

  const valorNormalizado = `${coordenadas.lat.toFixed(6)}, ${coordenadas.lng.toFixed(6)}`;
  botao.disabled = true;
  if (status) status.textContent = 'Salvando...';

  try {
    const { error } = await supabaseClient
      .from('postos')
      .update({ geolocalizacao: valorNormalizado })
      .eq('id', idPosto);
    if (error) throw error;

    if (input) input.value = valorNormalizado;
    atualizarLinkStreetViewCliente(container, coordenadas);
    if (status) status.textContent = 'Geolocalizacao salva no cadastro.';
    limparCachesComPrefixo('relatorio_localizacao_cache_postos_rota_');
    // Move o pino no mapa na hora, sem esperar uma nova consulta.
    marcadoresPostosPorId.get(String(idPosto))?.setLatLng([coordenadas.lat, coordenadas.lng]);
    mostrarMensagem('Geolocalizacao do posto atualizada.');
  } catch (error) {
    console.error('Erro ao salvar geolocalizacao do posto:', error);
    if (status) status.textContent = 'Erro ao salvar geolocalizacao.';
    mostrarMensagem(error?.message || 'Nao foi possivel salvar a geolocalizacao do posto.', true);
  } finally {
    botao.disabled = false;
  }
}

window.salvarGeolocalizacaoPostoRelatorio = salvarGeolocalizacaoPostoRelatorio;

function adicionarPostoRotaNoMapa(posto) {
  if (!Number.isFinite(posto.lat) || !Number.isFinite(posto.lng)) return;
  if (!camadaPostosRota) return;

  const icone = L.divIcon({
    className: '',
    html: '<div class="posto-rota-marker"><i class="fas fa-gas-pump"></i></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });

  const streetViewUrl = urlStreetViewPorCoordenadas(obterCoordenadasGeolocalizacao(valorGeolocalizacaoPosto(posto)));
  posto._marker = L.marker([posto.lat, posto.lng], { icon: icone })
    .bindPopup(`
      <strong>${escaparHTML(posto.razao_social || 'Posto')}</strong><br>
      ${posto.filial ? `Filial: ${escaparHTML(posto.filial)}<br>` : ''}
      ${posto.cnpj ? `CNPJ: ${escaparHTML(posto.cnpj)}<br>` : ''}
      ${posto.rotas ? `Rota(s) abastecida(s): ${escaparHTML(posto.rotas)}<br>` : ''}
      ${escaparHTML(posto.enderecoMapa || montarEnderecoPosto(posto))}<br>
      ${controlesGeolocalizacaoPosto(posto)}<br>
      <a href="${streetViewUrl}" class="link-streetview-cliente" onclick="return window.abrirStreetViewClienteRelatorio(this)" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;color:#1a73e8;font-size:13px;text-decoration:none;">
        <i class="fas fa-street-view"></i> Abrir no Street View
      </a>
    `)
    .addTo(camadaPostosRota);

  if (posto.id != null) marcadoresPostosPorId.set(String(posto.id), posto._marker);
}

// Posto no mapa segue o mesmo criterio da aba "Abastecimento Externo" de relatorio-abastecimento.html:
// olha o campo Tanque/Posto (posto_id) de abastecimento_externo, filtrado pela Data e Rota do periodo
// consultado, e usa a identificacao do posto ali informado - nao "todos os postos da filial".
async function buscarPostosAbastecidos(escalas, dataInicioISO, dataFimISO) {
  const rotasNormalizadas = Array.from(new Set((escalas || []).map((escala) => escala.rota).filter(Boolean).map(normalizarRotaCliente).filter(Boolean)));
  if (!rotasNormalizadas.length) return [];

  const chaveCache = chaveCacheRota('postos_rota', [...rotasNormalizadas, dataInicioISO || '', dataFimISO || '']);
  const cache = obterCacheCadastro(chaveCache, CACHE_ROTA_TTL_MS);
  if (cache) return cache;

  // Uma consulta por rota (o "ilike" nao permite unificar num .in() sem risco de "1" casar com
  // "12"), mas disparadas em paralelo em vez de uma esperar a outra terminar.
  const resultadosPorRota = await Promise.all(rotasNormalizadas.map((rota) => {
    let query = supabaseClient
      .from('abastecimento_externo')
      .select('id, data_hora, posto_id, rota, postos(id, filial, razao_social, cnpj, cidade, uf, endereco, geolocalizacao)')
      .ilike('rota', `%${rota}%`)
      .limit(MAX_POSTOS_ROTA_MAPA);
    if (dataInicioISO) query = query.gte('data_hora', dataInicioISO);
    if (dataFimISO) query = query.lte('data_hora', dataFimISO);
    return query;
  }));

  const erroPostos = resultadosPorRota.find((res) => res.error);
  if (erroPostos) throw erroPostos.error;

  const registrosEncontrados = resultadosPorRota.flatMap((res) => res.data || []);

  // Confere com precisao (evita "1" casar com "12"), igual ao buscarHoteisDasRotas.
  const postosPorId = new Map();
  registrosEncontrados.forEach((registro) => {
    if (!registro.posto_id || !registro.postos) return;
    const rotasDoRegistro = normalizarListaRotas(registro.rota).filter((r) => rotasNormalizadas.includes(r));
    if (!rotasDoRegistro.length) return;

    if (!postosPorId.has(registro.posto_id)) {
      postosPorId.set(registro.posto_id, { ...registro.postos, rotas: new Set() });
    }
    rotasDoRegistro.forEach((r) => postosPorId.get(registro.posto_id).rotas.add(r));
  });

  const resultado = Array.from(postosPorId.values())
    .map((posto) => ({ ...posto, rotas: Array.from(posto.rotas).join(', ') }))
    .slice(0, MAX_POSTOS_ROTA_MAPA);

  salvarCacheCadastro(chaveCache, resultado);
  return resultado;
}

async function plotarPostosAbastecidos(escalas, dataInicioISO, dataFimISO) {
  if (!camadaPostosRota) return;
  camadaPostosRota.clearLayers();
  postosAtuais = [];
  renderizarListaPostos();

  const postos = await buscarPostosAbastecidos(escalas, dataInicioISO, dataFimISO);
  if (!postos.length) return;

  let localizados = 0;
  postos.forEach((posto) => {
    posto.enderecoMapa = montarEnderecoPosto(posto);
    if (aplicarGeolocalizacaoPosto(posto) && Number.isFinite(posto.lat) && Number.isFinite(posto.lng)) {
      adicionarPostoRotaNoMapa(posto);
      localizados += 1;
    }
  });

  postosAtuais = postos.filter((posto) => Number.isFinite(posto.lat) && Number.isFinite(posto.lng));
  renderizarListaPostos();

  if (localizados) {
    mostrarMensagem(`Histórico carregado. Postos abastecidos no mapa: ${localizados} de ${postos.length}.`);
  }
}

function destacarPonto(indice) {
  const ponto = pontosAtuais[indice];
  if (!ponto) return;

  document.querySelectorAll('#tabela-posicoes-body tr').forEach((linha) => {
    linha.classList.toggle('ativo', Number(linha.dataset.indice) === indice);
  });

  if (marcadorSelecionado) mapa.removeLayer(marcadorSelecionado);
  const coordenadaVisual = coordenadaVisualNaLinha(ponto, segmentosRotaAtuais);
  marcadorSelecionado = L.circleMarker(coordenadaVisual, {
    color: '#17332a',
    fillColor: '#ffe14f',
    fillOpacity: 1,
    radius: 10,
    weight: 3
  }).addTo(mapa).bindPopup(popupPonto(ponto, `Posição ${indice + 1}`)).openPopup();
  mapa.setView(coordenadaVisual, Math.max(mapa.getZoom(), 15));
}

function centralizarItemNoMapa(item) {
  if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
  mapa.setView([item.lat, item.lng], Math.max(mapa.getZoom(), 15));
  item._marker?.openPopup();
}

function renderizarListaClientes() {
  if (!painelClienteLista) return;

  if (!clientesAtuais.length) {
    painelClienteLista.innerHTML = '<li class="painel-lista-vazia">Nenhum cliente encontrado na rota.</li>';
    return;
  }

  painelClienteLista.innerHTML = clientesAtuais.map((cliente, indice) => `
    <li>
      <span class="rota-ponto-marcador"></span>
      <button type="button" data-indice-cliente="${indice}">
        <strong>${escaparHTML(cliente.fantasia || cliente.nome || cliente.codigo)}</strong>
        <small>${escaparHTML(cliente.enderecoMapa || montarEnderecoCliente(cliente))}</small>
      </button>
    </li>
  `).join('');
}

function renderizarListaHoteis() {
  if (!painelHotelLista) return;

  if (!hoteisAtuais.length) {
    painelHotelLista.innerHTML = '<li class="painel-lista-vazia">Nenhum hotel encontrado na rota.</li>';
    return;
  }

  painelHotelLista.innerHTML = hoteisAtuais.map((hotel, indice) => `
    <li>
      <span class="rota-ponto-marcador"></span>
      <button type="button" data-indice-hotel="${indice}">
        <strong>${escaparHTML(hotel.nome || hotel.razao_social || 'Hotel')}</strong>
        <small>${escaparHTML(hotel.enderecoMapa || montarEnderecoHotel(hotel))}</small>
      </button>
    </li>
  `).join('');
}

function renderizarListaPostos() {
  if (!painelPostoLista) return;

  if (!postosAtuais.length) {
    painelPostoLista.innerHTML = '<li class="painel-lista-vazia">Nenhum abastecimento externo encontrado na rota/período.</li>';
    return;
  }

  painelPostoLista.innerHTML = postosAtuais.map((posto, indice) => `
    <li>
      <span class="rota-ponto-marcador"></span>
      <button type="button" data-indice-posto="${indice}">
        <strong>${escaparHTML(posto.razao_social || 'Posto')}</strong>
        <small>${escaparHTML(posto.enderecoMapa || montarEnderecoPosto(posto))}</small>
      </button>
    </li>
  `).join('');
}

function selecionarAbaPainel(aba) {
  abaPainelAtiva = aba;

  abasPainelRota.forEach((botao) => {
    const ativa = botao.dataset.aba === aba;
    botao.classList.toggle('ativo', ativa);
    botao.setAttribute('aria-selected', String(ativa));
  });

  if (painelRotaResumo) painelRotaResumo.hidden = aba !== 'rota';
  if (painelRotaParadas) painelRotaParadas.hidden = aba !== 'rota';
  if (painelRotaAcoes) painelRotaAcoes.hidden = aba !== 'rota';
  if (painelClienteLista) painelClienteLista.hidden = aba !== 'cliente';
  if (painelHotelLista) painelHotelLista.hidden = aba !== 'hotel';
  if (painelPostoLista) painelPostoLista.hidden = aba !== 'posto';
}

function valorOrdenacao(ponto, campo) {
  if (campo === 'indice') return ponto.indiceOriginal;
  if (campo === 'dataInicial') return new Date(ponto.dataInicial || 0).getTime();
  if (campo === 'dataFinal') return new Date(ponto.dataFinal || ponto.dataInicial || 0).getTime();
  if (campo === 'rota') return obterCampoEscalaPonto(ponto, 'rota');
  if (campo === 'motorista') return obterCampoEscalaPonto(ponto, 'motorista');
  if (campo === 'auxiliar') return obterCampoEscalaPonto(ponto, 'auxiliar');
  if (campo === 'velocidade') return Number(ponto.velocidade) || 0;
  if (campo === 'tipo') return ponto.tipo || '';
  if (campo === 'tempoParado') return calcularTempoParadoMs(ponto);
  if (campo === 'cidade') return ponto.cidade || '';
  if (campo === 'coordenadas') return `${ponto.latitude},${ponto.longitude}`;
  if (campo === 'quantidadePosicoes') return Number(ponto.quantidadePosicoes) || 0;
  return '';
}

function obterPontosFiltradosOrdenados() {
  const filtroIndice = filtrosTabela.indice.value.trim();
  const filtroData = filtrosTabela.data.value.trim().toLocaleLowerCase('pt-BR');
  const filtroDataFinal = filtrosTabela.dataFinal.value.trim().toLocaleLowerCase('pt-BR');
  const filtroRota = filtrosTabela.rota.value.trim().toLocaleLowerCase('pt-BR');
  const filtroMotorista = filtrosTabela.motorista.value.trim().toLocaleLowerCase('pt-BR');
  const filtroAuxiliar = filtrosTabela.auxiliar.value.trim().toLocaleLowerCase('pt-BR');
  const filtroVelocidade = filtrosTabela.velocidade.value.trim();
  const filtroSituacao = filtrosTabela.situacao.value;
  const filtroTempoParado = filtrosTabela.tempoParado.value.trim().toLocaleLowerCase('pt-BR');
  const filtroCidade = filtrosTabela.cidade.value.trim().toLocaleLowerCase('pt-BR');
  const filtroCoordenadas = filtrosTabela.coordenadas.value.trim().toLowerCase();
  const filtroQuantidade = filtrosTabela.quantidade.value.trim();

  const filtrados = pontosAtuais.filter((ponto) => {
    const indiceExibido = ponto.indiceOriginal + 1;
    const dataFormatada = formatarData(ponto.dataInicial).toLocaleLowerCase('pt-BR');
    const dataFinalFormatada = formatarData(ponto.dataFinal || ponto.dataInicial).toLocaleLowerCase('pt-BR');
    const rota = obterCampoEscalaPonto(ponto, 'rota').toLocaleLowerCase('pt-BR');
    const motorista = obterCampoEscalaPonto(ponto, 'motorista').toLocaleLowerCase('pt-BR');
    const auxiliar = obterCampoEscalaPonto(ponto, 'auxiliar').toLocaleLowerCase('pt-BR');
    const tempoParado = formatarDuracao(calcularTempoParadoMs(ponto)).toLocaleLowerCase('pt-BR');
    const cidade = String(ponto.cidade || '').toLocaleLowerCase('pt-BR');
    const coordenadas = `${ponto.latitude.toFixed(6)}, ${ponto.longitude.toFixed(6)}`.toLowerCase();

    return (!filtroIndice || indiceExibido === Number(filtroIndice))
      && (!filtroData || dataFormatada.includes(filtroData))
      && (!filtroDataFinal || dataFinalFormatada.includes(filtroDataFinal))
      && (!filtroRota || rota.includes(filtroRota))
      && (!filtroMotorista || motorista.includes(filtroMotorista))
      && (!filtroAuxiliar || auxiliar.includes(filtroAuxiliar))
      && (!filtroVelocidade || Math.round(ponto.velocidade || 0) === Number(filtroVelocidade))
      && (!filtroSituacao || ponto.tipo === filtroSituacao)
      && (!filtroTempoParado || tempoParado.includes(filtroTempoParado))
      && (!filtroCidade || cidade.includes(filtroCidade))
      && (!filtroCoordenadas || coordenadas.includes(filtroCoordenadas))
      && (!filtroQuantidade || Number(ponto.quantidadePosicoes || 1) === Number(filtroQuantidade));
  });

  const multiplicador = ordenacaoTabela.direcao === 'asc' ? 1 : -1;
  return filtrados.sort((a, b) => {
    const valorA = valorOrdenacao(a, ordenacaoTabela.campo);
    const valorB = valorOrdenacao(b, ordenacaoTabela.campo);
    if (typeof valorA === 'string' || typeof valorB === 'string') {
      return String(valorA).localeCompare(String(valorB), 'pt-BR') * multiplicador;
    }
    return (valorA - valorB) * multiplicador;
  });
}

function atualizarIconesOrdenacao() {
  document.querySelectorAll('.btn-ordenar').forEach((botao) => {
    const ativo = botao.dataset.ordenar === ordenacaoTabela.campo;
    const icone = botao.querySelector('i');
    botao.classList.toggle('ativo', ativo);
    icone.className = ativo
      ? `fas fa-sort-${ordenacaoTabela.direcao === 'asc' ? 'up' : 'down'}`
      : 'fas fa-sort';
  });
}

function renderizarTabela() {
  const pontos = obterPontosFiltradosOrdenados();
  tabelaBody.innerHTML = '';
  const fragmento = document.createDocumentFragment();

  pontos.slice(0, 2000).forEach((ponto) => {
    const linha = document.createElement('tr');
    linha.dataset.indice = String(ponto.indiceOriginal);
    linha.innerHTML = `
      <td>${ponto.indiceOriginal + 1}</td>
      <td>${formatarData(ponto.dataInicial)}</td>
      <td>${formatarData(ponto.dataFinal || ponto.dataInicial)}</td>
      <td>${obterCampoEscalaPonto(ponto, 'rota')}</td>
      <td>${obterCampoEscalaPonto(ponto, 'motorista')}</td>
      <td>${obterCampoEscalaPonto(ponto, 'auxiliar')}</td>
      <td>${Math.round(ponto.velocidade || 0)} km/h</td>
      <td><span class="status-posicao ${ponto.tipo}">${ponto.tipo === 'parado' ? 'Parado' : 'Deslocamento'}</span></td>
      <td>${formatarDuracao(calcularTempoParadoMs(ponto))}</td>
      <td>${escaparHTML(ponto.cidade || '-')}</td>
      <td class="celula-coordenadas" title="Clique com o botão direito para abrir no Google Maps">${ponto.latitude.toFixed(6)}, ${ponto.longitude.toFixed(6)}</td>
      <td>${ponto.quantidadePosicoes || 1}</td>
    `;
    linha.addEventListener('click', () => destacarPonto(ponto.indiceOriginal));
    fragmento.appendChild(linha);
  });

  if (pontos.length === 0) {
    const linha = document.createElement('tr');
    linha.innerHTML = '<td colspan="12" class="tabela-sem-resultados">Nenhuma posição encontrada com os filtros informados.</td>';
    fragmento.appendChild(linha);
  }

  tabelaBody.appendChild(fragmento);
  contadorPosicoes.textContent = pontos.length > 2000
    ? `Exibindo 2.000 de ${pontos.length}`
    : `${pontos.length} de ${pontosAtuais.length} registros`;
  atualizarIconesOrdenacao();
}

function preencherResumo(dados) {
  const pontos = dados.pontos;
  const maiorVelocidade = Math.max(0, ...pontos.map((ponto) => ponto.velocidade || 0));
  const quantidadePosicoes = pontos.reduce(
    (total, ponto) => total + (Number(ponto.quantidadePosicoes) || 1),
    0
  );
  document.getElementById('resumo-posicoes').textContent = quantidadePosicoes.toLocaleString('pt-BR');
  document.getElementById('resumo-distancia').textContent = `${calcularDistancia(pontos).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} km`;
  document.getElementById('resumo-velocidade').textContent = `${Math.round(maiorVelocidade)} km/h`;
  document.getElementById('resumo-periodo').textContent = `${formatarData(dados.dataInicial)} até ${formatarData(dados.dataFinal)}`;
  document.getElementById('titulo-percurso').textContent = dados.unidade || dados.placa;
}

function preencherResumoEscala(escalas) {
  resumoEscalaRotaLabel.textContent = 'Rotas na escala';
  resumoEscalaMotoristaLabel.textContent = 'Motoristas na escala';
  resumoEscalaAuxiliarLabel.textContent = 'Auxiliares na escala';

  if (!escalas.length) {
    resumoEscalaRota.textContent = 'Sem escala';
    resumoEscalaMotorista.textContent = 'Sem escala';
    resumoEscalaAuxiliar.textContent = 'Sem escala';
    return;
  }

  resumoEscalaRota.textContent = escalas
    .map((escala) => `${formatarDataCurtaISO(escala.data_escala)}: ${valorResumoEscala(escala.rota)}`)
    .join(' / ');
  resumoEscalaMotorista.textContent = escalas
    .map((escala) => `${formatarDataCurtaISO(escala.data_escala)}: ${valorResumoEscala(escala.motorista)}`)
    .join(' / ');
  resumoEscalaAuxiliar.textContent = escalas
    .map((escala) => `${formatarDataCurtaISO(escala.data_escala)}: ${valorResumoEscala(escala.auxiliar)}`)
    .join(' / ');
}

async function buscarEscalasDaPlaca(placa, dataInicioISO, dataTerminoISO) {
  if (!placa || !dataInicioISO || !dataTerminoISO) return [];

  const placasPossiveis = Array.from(new Set([placa, formatarPlaca(placa)].filter(Boolean)));
  const { data, error } = await supabaseClient
    .from('escala')
    .select('data_escala, rota, motorista, auxiliar, terceiro, status, tipo_escala')
    .gte('data_escala', dataInicioISO)
    .lte('data_escala', dataTerminoISO)
    .in('placa', placasPossiveis)
    .order('data_escala', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Erro ao buscar escala da placa:', error);
    return [];
  }

  return data || [];
}

async function buscarEscalasPorTermo(tipoBusca, termo, dataInicioISO, dataTerminoISO) {
  if (!tipoBusca || !termo || !dataInicioISO || !dataTerminoISO) return [];

  let query = supabaseClient
    .from('escala')
    .select('data_escala, placa, rota, motorista, auxiliar, terceiro, status, tipo_escala')
    .gte('data_escala', dataInicioISO)
    .lte('data_escala', dataTerminoISO)
    .not('placa', 'is', null)
    .order('data_escala', { ascending: true })
    .order('id', { ascending: true });

  if (tipoBusca === 'rota') {
    query = query.ilike('rota', `%${termo}%`);
  } else if (tipoBusca === 'motorista') {
    query = query.or(`motorista.ilike.%${termo}%,terceiro.ilike.%${termo}%`);
  } else if (tipoBusca === 'auxiliar') {
    query = query.or(`auxiliar.ilike.%${termo}%,terceiro.ilike.%${termo}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((registro) => normalizarPlaca(registro.placa).length === 7);
}

function agruparEscalasPorData(escalas) {
  return (escalas || []).reduce((mapa, escala) => {
    const dataEscala = obterDataISOInput(escala.data_escala);
    if (!dataEscala) return mapa;
    if (!mapa.has(dataEscala)) mapa.set(dataEscala, []);
    mapa.get(dataEscala).push(escala);
    return mapa;
  }, new Map());
}

function obterPeriodoValidado() {
  const inicio = new Date(inicioInput.value);
  const termino = new Date(terminoInput.value);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime()) || termino <= inicio) {
    mostrarMensagem('Informe um período válido. O término deve ser posterior ao início.', true);
    return null;
  }
  if (termino.getTime() - inicio.getTime() > 30 * 24 * 60 * 60 * 1000) {
    mostrarMensagem('O período máximo por consulta é de 30 dias.', true);
    return null;
  }

  return {
    inicio,
    termino,
    dataEscalaInicioISO: obterDataISOInput(inicioInput.value),
    dataEscalaTerminoISO: obterDataISOInput(terminoInput.value)
  };
}

function definirCarregando(carregando) {
  botaoConsultar.disabled = carregando;
  const buscandoVeiculo = tipoBuscaInput.value === 'veiculo';
  botaoConsultar.querySelector('i').className = carregando
    ? 'fas fa-circle-notch fa-spin'
    : 'fas fa-magnifying-glass-location';
  botaoConsultar.querySelector('span').textContent = carregando
    ? (buscandoVeiculo ? 'Consultando histórico...' : 'Buscando na escala...')
    : (buscandoVeiculo ? 'Consultar percurso' : 'Buscar na escala');
}

function mostrarMensagem(texto, erro = false) {
  mensagem.textContent = texto;
  mensagem.classList.toggle('erro', erro);
}

async function carregarVeiculos() {
  const { data, error } = await supabaseClient
    .from('veiculos')
    .select('placa, modelo, filial')
    .not('placa', 'is', null)
    .order('placa');

  if (error) {
    console.error('Erro ao carregar veículos:', error);
    return;
  }

  listaVeiculos.innerHTML = '';
  (data || []).forEach((veiculo) => {
    const option = document.createElement('option');
    option.value = normalizarPlaca(veiculo.placa);
    option.label = [
      formatarPlaca(veiculo.placa),
      veiculo.modelo,
      veiculo.filial
    ].filter(Boolean).join(' - ');
    listaVeiculos.appendChild(option);
  });
}

function renderizarResultadosEscala(registros) {
  tabelaEscalaBody.innerHTML = '';
  const fragmento = document.createDocumentFragment();

  registros.forEach((registro) => {
    const placa = normalizarPlaca(registro.placa);
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${escaparHTML(formatarDataCurtaISO(registro.data_escala))}</td>
      <td>${escaparHTML(valorResumoEscala(registro.rota))}</td>
      <td><strong>${escaparHTML(formatarPlaca(placa))}</strong></td>
      <td>${escaparHTML(valorResumoEscala(registro.motorista))}</td>
      <td>${escaparHTML(valorResumoEscala(registro.auxiliar))}</td>
      <td>${escaparHTML(valorResumoEscala(registro.status))}</td>
      <td>
        <button class="btn-ver-percurso" type="button" data-placa="${escaparHTML(placa)}">
          <i class="fas fa-route"></i> Ver percurso
        </button>
      </td>
    `;
    fragmento.appendChild(linha);
  });

  if (registros.length === 0) {
    const linha = document.createElement('tr');
    linha.innerHTML = '<td colspan="7" class="tabela-sem-resultados">Nenhum veículo encontrado na escala para os filtros informados.</td>';
    fragmento.appendChild(linha);
  }

  tabelaEscalaBody.appendChild(fragmento);
  contadorEscala.textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;
  resultadoEscala.hidden = false;
}

function obterRegistrosUnicosEscala(registros) {
  const vistos = new Set();
  return (registros || []).filter((registro) => {
    const chave = [
      obterDataISOInput(registro.data_escala),
      normalizarPlaca(registro.placa),
      String(registro.rota || '').trim(),
      String(registro.motorista || '').trim(),
      String(registro.auxiliar || '').trim()
    ].join('|');
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

async function consultarEscalaParaPercurso() {
  const tipoBusca = tipoBuscaInput.value;
  const termo = normalizarTextoBusca(placaInput.value);
  const periodo = obterPeriodoValidado();

  if (!periodo) return;
  if (!termo) {
    mostrarMensagem(`Informe ${termoLabel.textContent.toLowerCase()} para buscar na escala.`, true);
    return;
  }

  resultado.hidden = true;
  escalasPorDataAtual = new Map();
  definirCarregando(true);
  mostrarMensagem('Buscando veículos na escala...');

  try {
    const registros = await buscarEscalasPorTermo(
      tipoBusca,
      termo,
      periodo.dataEscalaInicioISO,
      periodo.dataEscalaTerminoISO
    );
    const registrosUnicos = obterRegistrosUnicosEscala(registros);
    renderizarResultadosEscala(registrosUnicos);
    mostrarMensagem(registrosUnicos.length
      ? 'Selecione um veículo encontrado na escala para traçar o percurso.'
      : 'Nenhum veículo encontrado na escala para os filtros informados.',
      registrosUnicos.length === 0);
  } catch (error) {
    console.error('Erro ao buscar escala:', error);
    resultadoEscala.hidden = true;
    mostrarMensagem(error?.message || 'Não foi possível buscar veículos na escala.', true);
  } finally {
    definirCarregando(false);
  }
}

async function consultarHistorico() {
  if (tipoBuscaInput.value !== 'veiculo') {
    await consultarEscalaParaPercurso();
    return;
  }

  resultadoEscala.hidden = true;
  const placa = normalizarPlaca(placaInput.value);
  const inicio = new Date(inicioInput.value);
  const termino = new Date(terminoInput.value);
  const dataEscalaInicioISO = obterDataISOInput(inicioInput.value);
  const dataEscalaTerminoISO = obterDataISOInput(terminoInput.value);

  if (placa.length !== 7) {
    mostrarMensagem('Informe uma placa válida com 7 caracteres.', true);
    return;
  }
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime()) || termino <= inicio) {
    mostrarMensagem('Informe um período válido. O término deve ser posterior ao início.', true);
    return;
  }
  if (termino.getTime() - inicio.getTime() > 30 * 24 * 60 * 60 * 1000) {
    mostrarMensagem('O período máximo por consulta é de 30 dias.', true);
    return;
  }

  placaInput.value = placa;
  escalasPorDataAtual = new Map();
  definirCarregando(true);
  mostrarMensagem('Buscando as posições no rastreador...');

  try {
    const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
      body: {
        acao: 'historico',
        placa,
        dataInicial: inicio.toISOString(),
        dataFinal: termino.toISOString()
      }
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || 'Não foi possível consultar o histórico.');
    if (!Array.isArray(data.data?.pontos) || data.data.pontos.length === 0) {
      resultado.hidden = true;
      mostrarMensagem('Nenhuma posição encontrada para a placa no período informado.', true);
      return;
    }

    pontosAtuais = data.data.pontos.map((ponto, indice) => ({
      ...ponto,
      indiceOriginal: indice
    }));
    const escalasDoPeriodo = await buscarEscalasDaPlaca(placa, dataEscalaInicioISO, dataEscalaTerminoISO);
    escalasPorDataAtual = agruparEscalasPorData(escalasDoPeriodo);
    preencherResumo(data.data);
    preencherResumoEscala(escalasDoPeriodo);
    mostrarMensagem('Calculando percurso nas vias...');
    await desenharMapa(pontosAtuais);
    renderizarTabela();
    resultado.hidden = false;
    setTimeout(() => mapa.invalidateSize(), 50);
    mostrarMensagem(data.data.truncado
      ? 'Consulta concluída. O resultado foi limitado às primeiras 10.000 posições. Buscando clientes da rota...'
      : 'Histórico carregado com sucesso. Buscando clientes da rota...');
    plotarFiliaisMarquespan().catch((e) => console.warn('Erro ao plotar filiais Marquespan:', e));
    try {
      await plotarClientesDasRotas(escalasDoPeriodo);
    } catch (erroClientes) {
      console.warn('Erro ao plotar clientes da rota:', erroClientes);
      mostrarMensagem('Histórico carregado. Não foi possível geocodificar os clientes da rota (serviço temporariamente indisponível).');
    }
    try {
      await plotarHoteisDasRotas(escalasDoPeriodo);
    } catch (erroHoteis) {
      console.warn('Erro ao plotar hoteis da rota:', erroHoteis);
    }
    try {
      await plotarPostosAbastecidos(escalasDoPeriodo, inicio.toISOString(), termino.toISOString());
    } catch (erroPostos) {
      console.warn('Erro ao plotar postos abastecidos:', erroPostos);
    }
  } catch (error) {
    console.error('Erro ao consultar histórico:', error);
    resultado.hidden = true;
    mostrarMensagem(error?.message || 'Não foi possível consultar o histórico.', true);
  } finally {
    definirCarregando(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  consultarHistorico();
});

function atualizarTipoBusca() {
  const tipoBusca = tipoBuscaInput.value;
  const configuracoes = {
    veiculo: { label: 'Veículo', placeholder: 'GIH8F22', maxLength: 8, list: 'relatorio-lista-veiculos' },
    rota: { label: 'Rota', placeholder: 'Digite a rota', maxLength: 30, list: '' },
    motorista: { label: 'Motorista', placeholder: 'Nome do motorista', maxLength: 80, list: '' },
    auxiliar: { label: 'Auxiliar', placeholder: 'Nome do auxiliar', maxLength: 80, list: '' }
  };
  const config = configuracoes[tipoBusca] || configuracoes.veiculo;

  termoLabel.textContent = config.label;
  placaInput.placeholder = config.placeholder;
  placaInput.maxLength = config.maxLength;
  if (config.list) {
    placaInput.setAttribute('list', config.list);
  } else {
    placaInput.removeAttribute('list');
  }
  placaInput.value = '';
  resultadoEscala.hidden = true;
  resultado.hidden = true;
  botaoConsultar.querySelector('span').textContent = tipoBusca === 'veiculo'
    ? 'Consultar percurso'
    : 'Buscar na escala';
  mostrarMensagem('O período máximo por consulta é de 30 dias.');
}

tipoBuscaInput.addEventListener('change', atualizarTipoBusca);

placaInput.addEventListener('input', () => {
  if (tipoBuscaInput.value === 'veiculo') {
    placaInput.value = normalizarPlaca(placaInput.value);
  }
});

tabelaEscalaBody.addEventListener('click', (event) => {
  const botao = event.target.closest('.btn-ver-percurso');
  if (!botao) return;

  const placa = botao.dataset.placa;
  tipoBuscaInput.value = 'veiculo';
  atualizarTipoBusca();
  placaInput.value = placa;
  consultarHistorico();
});

tabelaBody.addEventListener('contextmenu', (event) => {
  const celula = event.target.closest('.celula-coordenadas');
  if (!celula) return;

  const linha = celula.closest('tr');
  const ponto = pontosAtuais[Number(linha?.dataset.indice)];
  if (!ponto) return;

  event.preventDefault();
  const url = `https://www.google.com/maps?q=${encodeURIComponent(`${ponto.latitude},${ponto.longitude}`)}`;
  window.open(url, '_blank', 'noopener');
});

Object.values(filtrosTabela).forEach((campo) => {
  campo.addEventListener(campo.tagName === 'SELECT' ? 'change' : 'input', renderizarTabela);
});

document.querySelectorAll('.btn-ordenar').forEach((botao) => {
  botao.addEventListener('click', () => {
    const campo = botao.dataset.ordenar;
    ordenacaoTabela = {
      campo,
      direcao: ordenacaoTabela.campo === campo && ordenacaoTabela.direcao === 'asc'
        ? 'desc'
        : 'asc'
    };
    renderizarTabela();
  });
});

botaoLimparFiltros.addEventListener('click', () => {
  Object.values(filtrosTabela).forEach((campo) => {
    campo.value = '';
  });
  renderizarTabela();
});

painelRotaParadas?.addEventListener('click', (event) => {
  const botao = event.target.closest('button[data-indice]');
  if (!botao) return;

  destacarPonto(Number(botao.dataset.indice));
});

abasPainelRota.forEach((botao) => {
  botao.addEventListener('click', () => selecionarAbaPainel(botao.dataset.aba));
});

painelClienteLista?.addEventListener('click', (event) => {
  const botao = event.target.closest('button[data-indice-cliente]');
  if (!botao) return;

  centralizarItemNoMapa(clientesAtuais[Number(botao.dataset.indiceCliente)]);
});

painelHotelLista?.addEventListener('click', (event) => {
  const botao = event.target.closest('button[data-indice-hotel]');
  if (!botao) return;

  centralizarItemNoMapa(hoteisAtuais[Number(botao.dataset.indiceHotel)]);
});

painelPostoLista?.addEventListener('click', (event) => {
  const botao = event.target.closest('button[data-indice-posto]');
  if (!botao) return;

  centralizarItemNoMapa(postosAtuais[Number(botao.dataset.indicePosto)]);
});

btnFecharPainelRota?.addEventListener('click', () => {
  if (painelRotaEmulada) painelRotaEmulada.hidden = true;
  if (btnMostrarPainelRota) btnMostrarPainelRota.hidden = false;
});

btnMostrarPainelRota?.addEventListener('click', () => {
  if (painelRotaEmulada) painelRotaEmulada.hidden = false;
  btnMostrarPainelRota.hidden = true;
});

definirPeriodoPadrao();
iniciarMapa();
carregarVeiculos();
atualizarTipoBusca();
