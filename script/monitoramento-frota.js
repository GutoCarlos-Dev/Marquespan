import { supabaseClient } from './supabase.js';
import { configurarFiltroFilialUsuario } from './shared/filtro-filial-usuario.js';

const CORES_PADRAO = [
  '#1976d2', '#00a765', '#ff7a24', '#8e44ad', '#e53935',
  '#00838f', '#f9a825', '#5d4037', '#3949ab', '#7cb342'
];
const CHAVE_CORES = 'marquespan_cores_tipos_frota';
const CHAVE_VERSAO_CORES = 'marquespan_cores_tipos_frota_versao';
const VERSAO_CORES = '2';
const CORES_FIXAS_POR_TIPO = {
  BITREM: '#000000',
  BITRUCK: '#e4b51b',
  'CAMINHAO 3/4': '#f20d22',
  'HR/VAN': '#4d8ee8',
  LS: '#000000',
  MUNCK: '#ff7138',
  'SEMI-REBOQUE': '#000000',
  TRUCK: '#08ad5d'
};

const filialSelect = document.getElementById('filtro-filial-frota');
const tipoSelect = document.getElementById('filtro-tipo-frota');
const buscaInput = document.getElementById('filtro-busca-frota');
const botaoAtualizar = document.getElementById('btn-atualizar-frota');
const autoRefresh = document.getElementById('auto-refresh-frota');
const listaContainer = document.getElementById('lista-veiculos-frota');
const painelCores = document.getElementById('painel-cores-tipos');
const listaCores = document.getElementById('lista-cores-tipos');
const botaoTelaCheia = document.getElementById('btn-fullscreen-frota');
const botaoAlternarPainel = document.getElementById('btn-alternar-painel-frota');
const frotaLayout = document.querySelector('.frota-layout');

let mapa;
let camadaMarcadores;
let frotaCompleta = [];
let marcadoresPorPlaca = new Map();
let timerAtualizacao = null;
let coresTipos = carregarCores();
let consultaEmAndamento = false;

function escapeHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizarTipo(tipo) {
  return String(tipo || 'Sem tipo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function carregarCores() {
  let coresSalvas = {};
  try {
    coresSalvas = JSON.parse(localStorage.getItem(CHAVE_CORES) || '{}');
  } catch {
    coresSalvas = {};
  }

  if (localStorage.getItem(CHAVE_VERSAO_CORES) !== VERSAO_CORES) {
    Object.keys(coresSalvas).forEach((tipo) => {
      const corPadrao = CORES_FIXAS_POR_TIPO[normalizarTipo(tipo)];
      if (corPadrao) coresSalvas[tipo] = corPadrao;
    });

    localStorage.setItem(CHAVE_CORES, JSON.stringify(coresSalvas));
    localStorage.setItem(CHAVE_VERSAO_CORES, VERSAO_CORES);
  }

  return coresSalvas;
}

function salvarCores() {
  localStorage.setItem(CHAVE_CORES, JSON.stringify(coresTipos));
}

function corDoTipo(tipo) {
  const nome = String(tipo || 'Sem tipo');
  if (coresTipos[nome]) return coresTipos[nome];

  const corFixa = CORES_FIXAS_POR_TIPO[normalizarTipo(nome)];
  if (corFixa) {
    coresTipos[nome] = corFixa;
    salvarCores();
    return corFixa;
  }

  let hash = 0;
  for (let indice = 0; indice < nome.length; indice += 1) {
    hash = ((hash << 5) - hash) + nome.charCodeAt(indice);
  }
  const cor = CORES_PADRAO[Math.abs(hash) % CORES_PADRAO.length];
  coresTipos[nome] = cor;
  salvarCores();
  return cor;
}

function formatarData(valor) {
  const data = new Date(valor);
  if (!valor || Number.isNaN(data.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(data);
}

function iniciarMapa() {
  mapa = L.map('mapa-monitoramento-frota', { preferCanvas: true })
    .setView([-23.5505, -46.6333], 7);

  const mapaPadrao = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });
  const satelite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
  );

  mapaPadrao.addTo(mapa);
  L.control.layers({ 'Mapa': mapaPadrao, 'Satélite': satelite }).addTo(mapa);
  camadaMarcadores = L.layerGroup().addTo(mapa);
}

function marcadorIcone(cor) {
  return L.divIcon({
    className: '',
    html: `<div class="marcador-frota" style="background:${cor}"><i class="fas fa-truck"></i></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32]
  });
}

function popupVeiculo(veiculo) {
  const coordenadas = `${veiculo.latitude},${veiculo.longitude}`;
  const maps = `https://www.google.com/maps?q=${encodeURIComponent(coordenadas)}`;
  return `
    <div class="popup-frota">
      <h3>${escapeHtml(veiculo.placaFormatada)}</h3>
      <p><strong>Tipo:</strong> ${escapeHtml(veiculo.tipo)}</p>
      <p><strong>Modelo:</strong> ${escapeHtml(veiculo.modelo)}</p>
      <p><strong>Filial:</strong> ${escapeHtml(veiculo.filial)}</p>
      <p><strong>Velocidade:</strong> ${Math.round(Number(veiculo.velocidade) || 0)} km/h</p>
      <p><strong>Ignição:</strong> ${veiculo.ignicao ? 'Ligada' : 'Desligada'}</p>
      <p><strong>Atualização:</strong> ${formatarData(veiculo.dataAtualizacao)}</p>
      ${veiculo.referencia ? `<p>${escapeHtml(veiculo.referencia)}</p>` : ''}
      <a href="${maps}" target="_blank" rel="noopener noreferrer">
        <i class="fas fa-arrow-up-right-from-square"></i> Abrir no Google Maps
      </a>
    </div>
  `;
}

function obterFrotaFiltrada() {
  const tipo = tipoSelect.value;
  const busca = buscaInput.value.trim().toUpperCase();
  return frotaCompleta.filter((veiculo) => (
    (!tipo || veiculo.tipo === tipo)
    && (!busca
      || String(veiculo.placaFormatada).toUpperCase().includes(busca)
      || String(veiculo.tipo).toUpperCase().includes(busca)
      || String(veiculo.modelo).toUpperCase().includes(busca))
  ));
}

function statusVeiculo(veiculo) {
  if (veiculo.desatualizado) return { classe: 'desatualizado', texto: 'Desatualizado' };
  if (Number(veiculo.velocidade) > 3) return { classe: 'movimento', texto: 'Em movimento' };
  return { classe: 'parado', texto: 'Parado' };
}

function focarVeiculo(placa) {
  const marcador = marcadoresPorPlaca.get(placa);
  if (!marcador) return;
  mapa.setView(marcador.getLatLng(), Math.max(mapa.getZoom(), 15));
  marcador.openPopup();
  document.querySelectorAll('.frota-veiculo-item').forEach((item) => {
    item.classList.toggle('ativo', item.dataset.placa === placa);
  });
}

function renderizarFrota() {
  const frota = obterFrotaFiltrada();
  camadaMarcadores.clearLayers();
  marcadoresPorPlaca = new Map();
  listaContainer.innerHTML = '';
  const limites = [];

  frota.forEach((veiculo) => {
    const latitude = Number(veiculo.latitude);
    const longitude = Number(veiculo.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const cor = corDoTipo(veiculo.tipo);
    const marcador = L.marker([latitude, longitude], {
      icon: marcadorIcone(cor),
      title: veiculo.placaFormatada
    }).bindPopup(popupVeiculo(veiculo));
    marcador.addTo(camadaMarcadores);
    marcadoresPorPlaca.set(veiculo.placa, marcador);
    limites.push([latitude, longitude]);

    const status = statusVeiculo(veiculo);
    const item = document.createElement('article');
    item.className = 'frota-veiculo-item';
    item.dataset.placa = veiculo.placa;
    item.innerHTML = `
      <div class="frota-item-topo">
        <div class="frota-item-placa">
          <span class="frota-cor" style="background:${cor}"></span>
          ${escapeHtml(veiculo.placaFormatada)}
        </div>
        <span class="frota-item-status ${status.classe}">${status.texto}</span>
      </div>
      <div class="frota-item-modelo">${escapeHtml(veiculo.tipo)} · ${escapeHtml(veiculo.modelo)} · ${escapeHtml(veiculo.filial)}</div>
      <div class="frota-item-info">${Math.round(Number(veiculo.velocidade) || 0)} km/h · ${formatarData(veiculo.dataAtualizacao)}</div>
    `;
    item.addEventListener('click', () => focarVeiculo(veiculo.placa));
    listaContainer.appendChild(item);
  });

  if (frota.length === 0) {
    listaContainer.innerHTML = '<div class="frota-vazia"><i class="fas fa-truck"></i>Nenhum veículo encontrado com os filtros.</div>';
  }

  document.getElementById('contador-lista-frota').textContent = `${frota.length} veículos`;
  document.getElementById('total-frota-mapa').textContent = frota.length;
  document.getElementById('total-frota-movimento').textContent = frota.filter(v => Number(v.velocidade) > 3 && !v.desatualizado).length;
  document.getElementById('total-frota-desatualizada').textContent = frota.filter(v => v.desatualizado).length;

  if (limites.length > 0) {
    mapa.fitBounds(L.latLngBounds(limites), { padding: [35, 35], maxZoom: 14 });
  }
  setTimeout(() => mapa.invalidateSize(), 50);
}

function atualizarTipos() {
  const valorAtual = tipoSelect.value;
  const tipos = [...new Set(frotaCompleta.map(v => v.tipo || 'Sem tipo'))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  tipoSelect.innerHTML = '<option value="">Todos</option>';
  tipos.forEach(tipo => tipoSelect.add(new Option(tipo, tipo)));
  if (tipos.includes(valorAtual)) tipoSelect.value = valorAtual;

  listaCores.innerHTML = '';
  tipos.forEach(tipo => {
    const linha = document.createElement('label');
    linha.className = 'cor-tipo-item';
    const nomeTipo = document.createElement('span');
    nomeTipo.title = tipo;
    nomeTipo.textContent = tipo;
    linha.appendChild(nomeTipo);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = corDoTipo(tipo);
    input.addEventListener('input', () => {
      coresTipos[tipo] = input.value;
      salvarCores();
      renderizarFrota();
    });
    linha.appendChild(input);
    listaCores.appendChild(linha);
  });
}

function definirCarregando(carregando) {
  botaoAtualizar.disabled = carregando;
  botaoAtualizar.querySelector('i').className = carregando
    ? 'fas fa-circle-notch fa-spin'
    : 'fas fa-rotate';
}

async function consultarFrota() {
  if (consultaEmAndamento) return;
  consultaEmAndamento = true;
  definirCarregando(true);
  const status = document.getElementById('status-atualizacao-frota');
  status.className = '';
  status.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Consultando rastreadores';

  try {
    const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
      body: { acao: 'frota', filial: filialSelect.value }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || 'Não foi possível carregar a frota.');

    frotaCompleta = Array.isArray(data.data?.veiculos) ? data.data.veiculos : [];
    document.getElementById('total-frota-cadastrada').textContent = data.data?.totalCadastrados || 0;
    atualizarTipos();
    renderizarFrota();
    status.className = 'online';
    status.innerHTML = '<i class="fas fa-circle"></i> Monitoramento ativo';
    document.getElementById('hora-atualizacao-frota').textContent = `Atualizado em ${formatarData(data.data?.consultadoEm)}`;
  } catch (error) {
    console.error('Erro no monitoramento da frota:', error);
    status.className = '';
    status.innerHTML = '<i class="fas fa-circle"></i> Falha na atualização';
    listaContainer.innerHTML = `<div class="frota-vazia"><i class="fas fa-triangle-exclamation"></i>${error?.message || 'Não foi possível consultar a frota.'}</div>`;
  } finally {
    consultaEmAndamento = false;
    definirCarregando(false);
  }
}

function configurarAtualizacaoAutomatica() {
  clearInterval(timerAtualizacao);
  timerAtualizacao = null;
  if (autoRefresh.checked) {
    timerAtualizacao = setInterval(consultarFrota, 60000);
  }
}

function alternarTelaCheia() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((error) => {
      console.error(`Erro ao entrar em tela cheia: ${error.message}`);
    });
    return;
  }

  document.exitFullscreen?.();
}

function definirPainelVeiculosOculto(oculto) {
  frotaLayout?.classList.toggle('painel-veiculos-oculto', oculto);

  if (botaoAlternarPainel) {
    botaoAlternarPainel.innerHTML = oculto
      ? '<i class="fas fa-angles-right"></i>'
      : '<i class="fas fa-angles-left"></i>';
    botaoAlternarPainel.title = oculto ? 'Mostrar veículos' : 'Ocultar veículos';
    botaoAlternarPainel.setAttribute(
      'aria-label',
      oculto ? 'Mostrar lista de veículos' : 'Ocultar lista de veículos'
    );
    botaoAlternarPainel.setAttribute('aria-expanded', String(!oculto));
  }

  setTimeout(() => mapa?.invalidateSize(), 300);
}

function atualizarEstadoTelaCheia() {
  const telaCheiaAtiva = Boolean(document.fullscreenElement);
  const menuContainer = document.getElementById('menu-container');
  const sidebar = document.getElementById('sidebar');
  const header = document.querySelector('.frota-header');

  document.body.classList.toggle('frota-fullscreen-active', telaCheiaAtiva);
  menuContainer?.classList.toggle('hidden', telaCheiaAtiva);
  sidebar?.classList.toggle('hidden', telaCheiaAtiva);
  header?.classList.toggle('hidden', telaCheiaAtiva);

  if (!telaCheiaAtiva) definirPainelVeiculosOculto(false);

  if (botaoTelaCheia) {
    botaoTelaCheia.innerHTML = telaCheiaAtiva
      ? '<i class="fas fa-compress"></i>'
      : '<i class="fas fa-expand"></i>';
    botaoTelaCheia.title = telaCheiaAtiva ? 'Sair da Tela Cheia' : 'Tela Cheia';
    botaoTelaCheia.setAttribute(
      'aria-label',
      telaCheiaAtiva ? 'Sair do monitoramento em tela cheia' : 'Abrir monitoramento em tela cheia'
    );
  }

  setTimeout(() => {
    mapa?.invalidateSize();
    window.dispatchEvent(new Event('resize'));
  }, 300);
}

botaoAtualizar.addEventListener('click', consultarFrota);
botaoTelaCheia?.addEventListener('click', alternarTelaCheia);
botaoAlternarPainel?.addEventListener('click', () => {
  definirPainelVeiculosOculto(
    !frotaLayout?.classList.contains('painel-veiculos-oculto')
  );
});
filialSelect.addEventListener('change', consultarFrota);
tipoSelect.addEventListener('change', renderizarFrota);
buscaInput.addEventListener('input', renderizarFrota);
autoRefresh.addEventListener('change', configurarAtualizacaoAutomatica);
document.addEventListener('fullscreenchange', atualizarEstadoTelaCheia);
document.getElementById('btn-configurar-cores').addEventListener('click', () => {
  painelCores.hidden = !painelCores.hidden;
});
document.getElementById('btn-fechar-cores').addEventListener('click', () => {
  painelCores.hidden = true;
});

iniciarMapa();
await configurarFiltroFilialUsuario(filialSelect);
configurarAtualizacaoAutomatica();
consultarFrota();
