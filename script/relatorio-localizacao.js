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

let mapa;
let camadaPercurso;
let camadaClientesRota;
let camadaFiliaisMarquespan;
let marcadorSelecionado;
let pontosAtuais = [];
let escalasPorDataAtual = new Map();
let ordenacaoTabela = { campo: 'dataInicial', direcao: 'asc' };
const GEOCODE_DELAY_MS = 1200;
const MAX_CLIENTES_ROTA_MAPA = 120;
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

function desenharMapa(pontos) {
  if (!mapa || !camadaPercurso) {
    throw new Error('O mapa não foi carregado. Atualize a página e tente novamente.');
  }

  camadaPercurso.clearLayers();
  camadaClientesRota?.clearLayers();
  camadaFiliaisMarquespan?.clearLayers();
  if (marcadorSelecionado) {
    mapa.removeLayer(marcadorSelecionado);
    marcadorSelecionado = null;
  }

  const coordenadas = pontos.map((ponto) => [ponto.latitude, ponto.longitude]);
  L.polyline(coordenadas, {
    color: '#008f57',
    opacity: 0.88,
    weight: 5
  }).addTo(camadaPercurso);

  const inicio = pontos[0];
  const fim = pontos[pontos.length - 1];
  L.circleMarker([inicio.latitude, inicio.longitude], {
    color: '#fff',
    fillColor: '#198754',
    fillOpacity: 1,
    radius: 9,
    weight: 3
  }).bindPopup(popupPonto(inicio, 'Início do percurso')).addTo(camadaPercurso);

  const paradas = pontos.filter((ponto) => ponto.tipo === 'parado').slice(0, 200);
  paradas.forEach((ponto) => {
    L.circleMarker([ponto.latitude, ponto.longitude], {
      color: '#fff',
      fillColor: '#ff8a34',
      fillOpacity: 0.95,
      radius: 6,
      weight: 2
    }).bindPopup(popupPonto(ponto, 'Parada')).addTo(camadaPercurso);
  });

  L.circleMarker([fim.latitude, fim.longitude], {
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
  L.marker([cliente.lat, cliente.lng], { icon: icone })
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
}

async function buscarClientesDasRotas(rotas) {
  const rotasNormalizadas = Array.from(new Set((rotas || []).map(normalizarRotaCliente).filter(Boolean)));
  if (!rotasNormalizadas.length) return [];

  const rotasClientes = [];
  for (const rota of rotasNormalizadas) {
    const { data, error } = await supabaseClient
      .from('cliente_rotas')
      .select('cliente_codigo, rota, ativo')
      .eq('rota', rota)
      .eq('ativo', 'A')
      .limit(MAX_CLIENTES_ROTA_MAPA);
    if (error) throw error;
    rotasClientes.push(...(data || []));
  }

  const codigos = Array.from(new Set(rotasClientes.map((item) => item.cliente_codigo).filter(Boolean)));
  if (!codigos.length) return [];

  const { data, error } = await supabaseClient
    .from('clientes')
    .select('codigo, fantasia, nome, uf, municipio, endereco, geolocalizacao, bairro, cep, categoria, ativo')
    .in('codigo', codigos);
  if (error) throw error;

  const rotaPorCodigo = new Map(rotasClientes.map((item) => [item.cliente_codigo, item.rota]));
  return (data || []).map((cliente) => ({
    ...cliente,
    rota: rotaPorCodigo.get(cliente.codigo) || ''
  })).slice(0, MAX_CLIENTES_ROTA_MAPA);
}

async function plotarClientesDasRotas(escalas) {
  if (!camadaClientesRota) return;
  camadaClientesRota.clearLayers();

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

function destacarPonto(indice) {
  const ponto = pontosAtuais[indice];
  if (!ponto) return;

  document.querySelectorAll('#tabela-posicoes-body tr').forEach((linha) => {
    linha.classList.toggle('ativo', Number(linha.dataset.indice) === indice);
  });

  if (marcadorSelecionado) mapa.removeLayer(marcadorSelecionado);
  marcadorSelecionado = L.circleMarker([ponto.latitude, ponto.longitude], {
    color: '#17332a',
    fillColor: '#ffe14f',
    fillOpacity: 1,
    radius: 10,
    weight: 3
  }).addTo(mapa).bindPopup(popupPonto(ponto, `Posição ${indice + 1}`)).openPopup();
  mapa.setView([ponto.latitude, ponto.longitude], Math.max(mapa.getZoom(), 15));
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
    desenharMapa(pontosAtuais);
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

definirPeriodoPadrao();
iniciarMapa();
carregarVeiculos();
atualizarTipoBusca();
