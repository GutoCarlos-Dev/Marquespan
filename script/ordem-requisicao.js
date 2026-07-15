const STORAGE_KEY_REQUISICOES = 'marquespan_ordem_requisicao_salvas_v1';
const CACHE_GEOCODE_CIDADE_KEY = 'marquespan_ordem_requisicao_geocode_cache_v1';
// Mesma chave publica ja usada em hoteis-mapa.js. Esta pagina nao tem sessao/Supabase (funciona
// so localmente no navegador), entao a geocodificacao precisa ser feita direto pelo navegador.
const GEOAPIFY_API_KEY = '0f54f744cbbb4620b9eb08a407a2a40f';
const OSRM_ROUTE_SERVICE_URL = 'https://router.project-osrm.org/route/v1/driving';

let clienteIndex = 0;
let requisicaoAtualId = null;
let mapaOrdem = null;
let camadaMapaOrdemMarcadores = null;
let camadaMapaOrdemRota = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dataOrdem').value = new Date().toISOString().slice(0, 10);
  atualizarSemanaPorData();
  document.getElementById('dataOrdem').addEventListener('change', atualizarSemanaPorData);
  document.getElementById('btnAdicionarCliente').addEventListener('click', () => adicionarCliente({}, true));
  document.getElementById('btnAtualizarOrdem').addEventListener('click', atualizarGridPelaOrdem);
  document.getElementById('btnSalvarLocal').addEventListener('click', salvarRequisicaoLocal);
  document.getElementById('btnGerarPDF').addEventListener('click', baixarPDF);
  document.getElementById('btnCompartilharWhatsapp').addEventListener('click', compartilharWhatsapp);
  document.getElementById('btnLimparFormulario').addEventListener('click', limparFormulario);
  document.getElementById('btnVisualizarMapa').addEventListener('click', visualizarRotaNoMapa);
  document.getElementById('btnFabAdicionarCliente').addEventListener('click', () => adicionarCliente({}, true));
  document.getElementById('btnFabRemoverCliente').addEventListener('click', removerUltimoCliente);
  document.getElementById('btnTelaCheiaMapa').addEventListener('click', alternarTelaCheiaMapa);
  document.addEventListener('fullscreenchange', atualizarBotaoTelaCheiaMapa);
  document.addEventListener('webkitfullscreenchange', atualizarBotaoTelaCheiaMapa);
  document.getElementById('supervisorNome').addEventListener('input', aplicarMaiusculo);
  adicionarCliente({}, false);
  renderizarRequisicoesSalvas();
  verificarRotaCompartilhadaNaUrl();
});

function aplicarMaiusculo(event) {
  const input = event.target;
  const inicio = input.selectionStart;
  const fim = input.selectionEnd;
  input.value = String(input.value || '').toLocaleUpperCase('pt-BR');
  input.setSelectionRange?.(inicio, fim);
}

function adicionarCliente(dados = {}, focar = true) {
  clienteIndex += 1;
  const container = document.getElementById('clientesContainer');
  // A Ordem padrao segue a quantidade atual de cards (proxima posicao livre), nao um contador
  // que so cresce - senao, depois de excluir clientes, o proximo adicionado vem com um numero
  // de ordem bem maior do que a quantidade real de clientes na lista.
  const proximaOrdem = dados.ordem || container.querySelectorAll('.cliente-card').length + 1;
  const card = document.createElement('article');
  card.className = 'cliente-card';
  card.dataset.clienteId = String(clienteIndex);
  card.innerHTML = `
    <div class="cliente-card-header">
      <strong>Cliente ${clienteIndex}</strong>
      <button type="button" class="btn-remove" title="Remover cliente"><i class="fas fa-trash"></i></button>
    </div>
    <div class="form-group">
      <label>Ordem</label>
      <input type="number" class="glass-input cliente-ordem" min="1" step="1" inputmode="numeric" value="${escapeHtml(proximaOrdem)}">
    </div>
    <div class="form-group">
      <label>Nome do Cliente</label>
      <input type="text" class="glass-input cliente-nome" placeholder="NOME DO CLIENTE" autocomplete="off" autocapitalize="characters" value="${escapeHtml(dados.nome || '')}">
    </div>
    <div class="form-group">
      <label>Cidade</label>
      <input type="text" class="glass-input cliente-cidade" placeholder="Cidade" autocomplete="off" autocapitalize="characters" value="${escapeHtml(dados.cidade || '')}">
    </div>
    <div class="form-group">
      <label>UF</label>
      <input type="text" class="glass-input cliente-uf" placeholder="UF" maxlength="2" autocomplete="off" value="${escapeHtml(dados.uf || '')}">
    </div>
    <div class="form-group">
      <label>OBS.</label>
      <textarea class="glass-input cliente-obs" rows="2" placeholder="Observacao" autocapitalize="characters">${escapeHtml(dados.obs || '')}</textarea>
    </div>
  `;

  card.querySelector('.cliente-nome').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.cliente-cidade').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.cliente-uf').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.cliente-obs').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.btn-remove').addEventListener('click', () => removerCliente(card));

  container.appendChild(card);
  atualizarTitulosClientes();
  if (focar) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => card.querySelector('.cliente-nome').focus(), 250);
  }
}

// Remove o card informado (ou so limpa os campos se for o unico restante, pra sempre sobrar
// pelo menos um cliente no formulario). Usado tanto pelo "x" de cada card quanto pelo flutuante "-".
function removerCliente(card) {
  if (!card) return;
  if (document.querySelectorAll('.cliente-card').length === 1) {
    card.querySelectorAll('input, textarea').forEach(input => {
      input.value = input.classList.contains('cliente-ordem') ? '1' : '';
    });
    return;
  }
  card.remove();
  renumerarOrdensVazias();
}

function removerUltimoCliente() {
  const cards = document.querySelectorAll('.cliente-card');
  removerCliente(cards[cards.length - 1]);
}

function renumerarOrdensVazias() {
  document.querySelectorAll('.cliente-card').forEach((card, index) => {
    const ordem = card.querySelector('.cliente-ordem');
    if (!ordem.value) ordem.value = String(index + 1);
  });
  atualizarTitulosClientes();
}

function atualizarTitulosClientes() {
  document.querySelectorAll('.cliente-card').forEach((card, index) => {
    const titulo = card.querySelector('.cliente-card-header strong');
    if (titulo) titulo.textContent = `Cliente ${index + 1}`;
  });
}

// Reordena os cards na tela conforme o campo "Ordem" de cada um, para o usuario visualizar na
// hora como a lista vai sair (mesmo criterio usado ao gerar o PDF em obterDadosFormulario).
function atualizarGridPelaOrdem() {
  const container = document.getElementById('clientesContainer');
  const cards = Array.from(container.querySelectorAll('.cliente-card'));
  if (!cards.length) return;

  cards
    .map((card, index) => ({
      card,
      ordem: Number(card.querySelector('.cliente-ordem').value) || index + 1
    }))
    .sort((a, b) => a.ordem - b.ordem)
    .forEach(({ card }) => container.appendChild(card));

  atualizarTitulosClientes();
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function obterDadosFormulario() {
  const semana = normalizarTexto(document.getElementById('semanaOrdem').value);
  const supervisor = normalizarTexto(document.getElementById('supervisorNome').value);
  const dataOrdem = document.getElementById('dataOrdem').value;
  const clientes = Array.from(document.querySelectorAll('.cliente-card'))
    .map((card, index) => ({
      ordem: Number(card.querySelector('.cliente-ordem').value || index + 1),
      nome: normalizarTexto(card.querySelector('.cliente-nome').value),
      cidade: normalizarTexto(card.querySelector('.cliente-cidade').value),
      uf: normalizarTexto(card.querySelector('.cliente-uf').value),
      obs: normalizarTexto(card.querySelector('.cliente-obs').value)
    }))
    .filter(cliente => cliente.nome || cliente.cidade || cliente.obs)
    .sort((a, b) => a.ordem - b.ordem);

  return { semana, supervisor, dataOrdem, clientes };
}

function validarFormulario() {
  const dados = obterDadosFormulario();
  if (!dados.semana) {
    alert('Informe a semana.');
    document.getElementById('semanaOrdem').focus();
    return null;
  }
  if (!dados.supervisor) {
    alert('Informe o nome do supervisor.');
    document.getElementById('supervisorNome').focus();
    return null;
  }
  if (!dados.clientes.length) {
    alert('Adicione pelo menos um cliente.');
    return null;
  }
  if (dados.clientes.some(cliente => !cliente.nome)) {
    alert('Informe o nome de todos os clientes lancados.');
    return null;
  }
  return dados;
}

// --- Rota no mapa ---

function inicializarMapaOrdem() {
  if (mapaOrdem) return;

  mapaOrdem = L.map('ordemMapa').setView([-23.330692, -47.851799], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapaOrdem);

  camadaMapaOrdemRota = L.layerGroup().addTo(mapaOrdem);
  camadaMapaOrdemMarcadores = L.layerGroup().addTo(mapaOrdem);
}

function chaveGeocodeCidade(cliente) {
  return `${normalizarTexto(cliente.cidade)}|${normalizarTexto(cliente.uf)}`;
}

function obterCacheGeocodeCidade() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_GEOCODE_CIDADE_KEY) || '{}');
  } catch {
    return {};
  }
}

function salvarCacheGeocodeCidade(cache) {
  try {
    localStorage.setItem(CACHE_GEOCODE_CIDADE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Nao foi possivel salvar cache de geocodificacao.', error);
  }
}

async function geocodificarCidade(cidade, uf) {
  const texto = [cidade, uf, 'Brasil'].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    text: texto,
    lang: 'pt',
    filter: 'countrycode:br',
    limit: '1',
    apiKey: GEOAPIFY_API_KEY
  });

  const resposta = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`);
  if (!resposta.ok) return null;

  const dados = await resposta.json();
  const coordenadas = dados?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordenadas) || coordenadas.length < 2) return null;

  const lng = Number(coordenadas[0]);
  const lat = Number(coordenadas[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function adicionarMarcadorOrdemNoMapa(cliente, coords) {
  const icone = L.divIcon({
    className: '',
    html: `<div class="ordem-mapa-numero-marker"><span>${escapeHtml(String(cliente.ordem))}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -28]
  });

  L.marker([coords.lat, coords.lng], { icon: icone })
    .bindPopup(`
      <div class="ordem-mapa-popup">
        <span class="ordem-mapa-popup-numero">Ordem ${escapeHtml(String(cliente.ordem))}</span>
        <strong>${escapeHtml(cliente.nome)}</strong>
        <div class="ordem-mapa-popup-cidade">${escapeHtml(formatarCidadeUf(cliente) || 'Cidade nao informada')}</div>
        ${cliente.obs ? `<div class="ordem-mapa-popup-obs">${escapeHtml(cliente.obs)}</div>` : ''}
      </div>
    `)
    .addTo(camadaMapaOrdemMarcadores);
}

async function desenharRotaOsrm(pontos) {
  const coordenadas = pontos.map(({ coords }) => `${coords.lng},${coords.lat}`).join(';');
  const url = `${OSRM_ROUTE_SERVICE_URL}/${coordenadas}?overview=full&geometries=geojson&steps=false`;

  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`OSRM retornou ${resposta.status}`);

  const dados = await resposta.json();
  const rota = dados?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(rota) || rota.length < 2) throw new Error('OSRM nao retornou geometria para a rota.');

  const linha = rota.map(([lng, lat]) => [lat, lng]);
  L.polyline(linha, { color: '#006937', weight: 5, opacity: 0.85 }).addTo(camadaMapaOrdemRota);
}

// Geocodifica uma lista de clientes (usando o cache local), retornando os pontos localizados
// (na mesma ordem recebida) e os nomes que nao foi possivel localizar. Compartilhado entre a
// visualizacao no mapa e o link de rota enviado no WhatsApp.
async function obterPontosGeocodificados(clientes) {
  const cache = obterCacheGeocodeCidade();
  const pontos = [];
  const naoLocalizados = [];

  for (const cliente of clientes) {
    const chave = chaveGeocodeCidade(cliente);
    let coords = cache[chave];

    if (!coords) {
      try {
        coords = await geocodificarCidade(cliente.cidade, cliente.uf);
      } catch (error) {
        console.warn('Erro ao geocodificar cidade:', cliente.cidade, error);
        coords = null;
      }
      if (coords) {
        cache[chave] = coords;
        salvarCacheGeocodeCidade(cache);
      }
    }

    if (coords) {
      pontos.push({ cliente, coords });
    } else {
      naoLocalizados.push(cliente.nome);
    }
  }

  return { pontos, naoLocalizados };
}

// Converte texto UTF-8 (acentos, etc.) para base64 "seguro para URL" (sem +, / ou = que
// precisariam de percent-encoding). Isso evita ter que combinar base64 com
// encodeURIComponent/decodeURIComponent, fonte do bug de decodificacao dupla abaixo.
function utf8ParaBase64Url(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  bytes.forEach(byte => { binario += String.fromCharCode(byte); });
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlParaUtf8(base64url) {
  let base64 = String(base64url || '').replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binario = atob(base64);
  const bytes = Uint8Array.from(binario, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// O link de rota do Google Maps tem limite de waypoints (na pratica, poucos pontos via URL sem
// chave de API). Para nao depender desse limite, o link compartilhado aponta para esta mesma
// pagina com os pontos codificados na URL - quem abrir ve o mesmo mapa gratuito (Leaflet/OSM +
// OSRM), com todos os pontos marcados, sem limitador nenhum. Usa base64url (em vez de JSON +
// encodeURIComponent) pra deixar o link bem mais curto e evitar caracteres que precisem de
// percent-encoding, que causavam erro ao decodificar o link recebido pelo WhatsApp.
function codificarPontosParaUrl(pontos) {
  const compacto = pontos.map(({ cliente, coords }) => ({
    o: cliente.ordem,
    n: cliente.nome,
    c: cliente.cidade,
    u: cliente.uf,
    b: cliente.obs,
    la: Number(coords.lat.toFixed(6)),
    lo: Number(coords.lng.toFixed(6))
  }));
  return utf8ParaBase64Url(JSON.stringify(compacto));
}

function decodificarPontosDaUrl(texto) {
  try {
    const compacto = JSON.parse(base64UrlParaUtf8(texto));
    if (!Array.isArray(compacto) || !compacto.length) return null;

    return compacto
      .map(item => ({
        cliente: { ordem: item.o, nome: item.n, cidade: item.c, uf: item.u, obs: item.b },
        coords: { lat: Number(item.la), lng: Number(item.lo) }
      }))
      .filter(({ coords }) => Number.isFinite(coords.lat) && Number.isFinite(coords.lng));
  } catch {
    return null;
  }
}

function montarUrlMapaCompartilhavel(pontos) {
  if (!pontos.length) return '';
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?rota=${codificarPontosParaUrl(pontos)}`;
}

function exibirPontosNoMapa(pontos) {
  const secaoMapa = document.getElementById('ordemMapaCard');
  const status = document.getElementById('ordemMapaStatus');
  secaoMapa.hidden = false;

  inicializarMapaOrdem();
  camadaMapaOrdemMarcadores.clearLayers();
  camadaMapaOrdemRota.clearLayers();
  setTimeout(() => mapaOrdem.invalidateSize(), 50);

  pontos.forEach(({ cliente, coords }) => adicionarMarcadorOrdemNoMapa(cliente, coords));
  mapaOrdem.fitBounds(L.latLngBounds(pontos.map(({ coords }) => [coords.lat, coords.lng])), {
    padding: [40, 40],
    maxZoom: 12
  });

  if (pontos.length <= 1) {
    status.textContent = `${pontos.length} ponto(s) no mapa.`;
    return Promise.resolve();
  }

  status.textContent = 'Calculando rota pelas estradas...';
  return desenharRotaOsrm(pontos)
    .then(() => { status.textContent = `${pontos.length} ponto(s) no mapa, na ordem definida.`; })
    .catch(error => {
      console.warn('Nao foi possivel calcular a rota pelas estradas.', error);
      status.textContent = `${pontos.length} ponto(s) no mapa (sem tracado pelas estradas).`;
    });
}

function verificarRotaCompartilhadaNaUrl() {
  const parametro = new URLSearchParams(window.location.search).get('rota');
  if (!parametro) return;

  const pontos = decodificarPontosDaUrl(parametro);
  if (!pontos || !pontos.length) {
    alert('Nao foi possivel abrir a rota compartilhada: link invalido ou incompleto.');
    return;
  }

  // Modo "link compartilhado": esconde o formulario e mostra so a Rota no Mapa preenchida.
  document.body.classList.add('ordem-modo-compartilhado');
  document.getElementById('linkNovaOrdemMapa').hidden = false;

  exibirPontosNoMapa(pontos);
  document.getElementById('ordemMapaCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function obterElementoTelaCheia() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function alternarTelaCheiaMapa() {
  const secaoMapa = document.getElementById('ordemMapaCard');
  if (!obterElementoTelaCheia()) {
    const metodoEntrar = secaoMapa.requestFullscreen || secaoMapa.webkitRequestFullscreen;
    // webkitRequestFullscreen (Safari) nao retorna Promise, entao o .catch precisa ser opcional.
    metodoEntrar?.call(secaoMapa)?.catch?.(error => console.warn('Nao foi possivel entrar em tela cheia.', error));
  } else {
    const metodoSair = document.exitFullscreen || document.webkitExitFullscreen;
    metodoSair?.call(document);
  }
}

function atualizarBotaoTelaCheiaMapa() {
  if (mapaOrdem) setTimeout(() => mapaOrdem.invalidateSize(), 100);

  const botao = document.getElementById('btnTelaCheiaMapa');
  if (!botao) return;
  botao.innerHTML = obterElementoTelaCheia()
    ? '<i class="fas fa-compress"></i> Sair da Tela Cheia'
    : '<i class="fas fa-expand"></i> Tela Cheia';
}

async function visualizarRotaNoMapa() {
  const dados = validarFormulario();
  if (!dados) return;

  const clientesComCidade = dados.clientes.filter(cliente => cliente.cidade);
  if (!clientesComCidade.length) {
    alert('Informe a cidade de pelo menos um cliente para visualizar no mapa.');
    return;
  }

  const secaoMapa = document.getElementById('ordemMapaCard');
  const status = document.getElementById('ordemMapaStatus');
  secaoMapa.hidden = false;
  secaoMapa.scrollIntoView({ behavior: 'smooth', block: 'start' });
  status.textContent = 'Localizando as cidades...';

  const { pontos, naoLocalizados } = await obterPontosGeocodificados(clientesComCidade);

  if (!pontos.length) {
    status.textContent = 'Nenhuma cidade foi localizada. Verifique os nomes informados.';
    return;
  }

  await exibirPontosNoMapa(pontos);

  if (naoLocalizados.length) {
    status.textContent = `${status.textContent} Nao localizada(s): ${naoLocalizados.join(', ')}.`;
  }
}

async function criarPDFBlob() {
  const dados = validarFormulario();
  if (!dados) return null;
  return criarPDFBlobDeDados(dados);
}

async function criarPDFBlobDeDados(dados) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('Biblioteca PDF nao carregada.');
    return null;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await carregarLogoComFundoBranco();
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logo) doc.addImage(logo, 'JPEG', 14, 10, 42, 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 105, 55);
  doc.setFontSize(17);
  doc.text('ORDEM DE REQUISICAO', pageWidth / 2, 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.setFontSize(10);
  doc.text(`Referente a Semana: ${dados.semana}`, 14, 34);
  doc.text(`Supervisor: ${dados.supervisor}`, 14, 40);
  doc.text(`Data: ${formatarData(dados.dataOrdem)}`, pageWidth - 14, 34, { align: 'right' });
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 40, { align: 'right' });

  doc.autoTable({
    startY: 50,
    head: [['Ordem', 'Cliente', 'Cidade', 'OBS.']],
    body: dados.clientes.map(cliente => [
      String(cliente.ordem),
      cliente.nome,
      formatarCidadeUf(cliente) || '-',
      cliente.obs || '-'
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [0, 105, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 62 },
      2: { cellWidth: 45 },
      3: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 }
  });

  adicionarRodape(doc);
  return {
    blob: doc.output('blob'),
    filename: `Ordem_Requisicao_${new Date().toISOString().slice(0, 10)}.pdf`
  };
}

function salvarRequisicaoLocal() {
  const dados = validarFormulario();
  if (!dados) return;

  const salvas = obterRequisicoesSalvas();
  const agora = new Date().toISOString();
  const id = requisicaoAtualId || criarIdLocal();
  const registroExistente = salvas.find(item => item.id === id);
  const registro = {
    id,
    ...dados,
    criadoEm: registroExistente?.criadoEm || agora,
    atualizadoEm: agora
  };

  const atualizadas = registroExistente
    ? salvas.map(item => (item.id === id ? registro : item))
    : [registro, ...salvas];

  if (!gravarRequisicoesSalvas(atualizadas)) return;
  requisicaoAtualId = id;
  renderizarRequisicoesSalvas();
  alert('Requisicao salva localmente neste aparelho/navegador.');
}

async function baixarPDF() {
  const arquivo = await criarPDFBlob();
  if (!arquivo) return;
  const url = URL.createObjectURL(arquivo.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo.filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function compartilharWhatsapp() {
  const dados = validarFormulario();
  if (!dados) return;
  await compartilharDadosPeloWhatsapp(dados, document.getElementById('btnCompartilharWhatsapp'));
}

// Compartilha uma requisicao salva localmente direto pelo WhatsApp, sem precisar carregar os
// clientes no grid do formulario antes. Usado tanto pelo botao principal (dados do formulario)
// quanto pelo botao "Compartilhar" de cada linha da tabela de Requisicoes Salvas.
async function compartilharRequisicaoSalva(id, botao) {
  const registro = obterRequisicoesSalvas().find(item => item.id === id);
  if (!registro) {
    alert('Requisicao salva nao encontrada.');
    renderizarRequisicoesSalvas();
    return;
  }

  const clientes = Array.isArray(registro.clientes) ? registro.clientes : [];
  if (!clientes.length) {
    alert('Esta requisicao nao possui clientes para compartilhar.');
    return;
  }

  const dados = {
    semana: registro.semana || '',
    supervisor: registro.supervisor || '',
    dataOrdem: registro.dataOrdem || '',
    clientes
  };

  await compartilharDadosPeloWhatsapp(dados, botao);
}

async function compartilharDadosPeloWhatsapp(dados, botao) {
  const textoOriginalBotao = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Localizando rota...';

  let linkMapa = '';
  try {
    const clientesComCidade = dados.clientes.filter(cliente => cliente.cidade);
    if (clientesComCidade.length) {
      const { pontos } = await obterPontosGeocodificados(clientesComCidade);
      linkMapa = montarUrlMapaCompartilhavel(pontos);
    }
  } catch (error) {
    console.warn('Nao foi possivel montar o link da rota para o WhatsApp.', error);
  } finally {
    botao.disabled = false;
    botao.innerHTML = textoOriginalBotao;
  }

  const arquivo = await criarPDFBlobDeDados(dados);
  if (!arquivo) return;
  const file = new File([arquivo.blob], arquivo.filename, { type: 'application/pdf' });

  const linhaMapa = linkMapa ? `\nRota no mapa: ${linkMapa}` : '';

  // O link do mapa sempre vai como mensagem de texto separada pelo wa.me. Quando o PDF e
  // compartilhado junto via Web Share API (navigator.share, caminho do celular), o WhatsApp
  // no Android descarta o texto/legenda que acompanha um arquivo de documento - so o anexo
  // chega, o link do mapa nunca aparecia. Enviando por wa.me garante que o link sempre chega,
  // tanto no computador quanto no celular.
  const texto = encodeURIComponent(`Ordem de Requisicao gerada.${linhaMapa}`);
  window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener');

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({
      title: 'Ordem de Requisicao',
      text: 'Segue Ordem de Requisicao em PDF.',
      files: [file]
    });
    return;
  }

  const url = URL.createObjectURL(arquivo.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function limparFormulario() {
  if (!confirm('Deseja limpar todo o formulario?')) return;
  resetarFormulario();
}

function resetarFormulario() {
  requisicaoAtualId = null;
  document.getElementById('supervisorNome').value = '';
  document.getElementById('dataOrdem').value = new Date().toISOString().slice(0, 10);
  atualizarSemanaPorData();
  document.getElementById('clientesContainer').innerHTML = '';
  clienteIndex = 0;
  adicionarCliente({}, false);
}

function carregarRequisicaoSalva(id) {
  const registro = obterRequisicoesSalvas().find(item => item.id === id);
  if (!registro) {
    alert('Requisicao salva nao encontrada.');
    renderizarRequisicoesSalvas();
    return;
  }

  requisicaoAtualId = registro.id;
  document.getElementById('semanaOrdem').value = registro.semana || '';
  document.getElementById('supervisorNome').value = registro.supervisor || '';
  document.getElementById('dataOrdem').value = registro.dataOrdem || new Date().toISOString().slice(0, 10);
  document.getElementById('clientesContainer').innerHTML = '';
  clienteIndex = 0;

  const clientes = Array.isArray(registro.clientes) && registro.clientes.length ? registro.clientes : [{}];
  clientes.forEach(cliente => adicionarCliente(cliente, false));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function excluirRequisicaoSalva(id) {
  if (!confirm('Deseja excluir esta requisicao salva localmente?')) return;
  const atualizadas = obterRequisicoesSalvas().filter(item => item.id !== id);
  if (!gravarRequisicoesSalvas(atualizadas)) return;
  if (requisicaoAtualId === id) requisicaoAtualId = null;
  renderizarRequisicoesSalvas();
}

function renderizarRequisicoesSalvas() {
  const tbody = document.getElementById('requisicoesSalvasBody');
  if (!tbody) return;

  const salvas = obterRequisicoesSalvas();
  if (!salvas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="ordem-salvas-vazio">Nenhuma requisicao salva localmente.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = salvas.map(registro => `
    <tr>
      <td data-label="Referente a Semana">${escapeHtml(registro.semana || '-')}</td>
      <td data-label="Data">${escapeHtml(formatarData(registro.dataOrdem))}</td>
      <td data-label="Supervisor">${escapeHtml(registro.supervisor || '-')}</td>
      <td data-label="Clientes">${Number(registro.clientes?.length || 0)}</td>
      <td data-label="Acoes">
        <div class="acoes-salvas">
          <button type="button" class="btn-grid btn-editar" data-editar-requisicao="${escapeHtml(registro.id)}">
            <i class="fas fa-pen"></i> Editar
          </button>
          <button type="button" class="btn-grid btn-excluir" data-excluir-requisicao="${escapeHtml(registro.id)}">
            <i class="fas fa-trash"></i> Excluir
          </button>
          <button type="button" class="btn-grid btn-compartilhar" data-compartilhar-requisicao="${escapeHtml(registro.id)}">
            <i class="fab fa-whatsapp"></i> Compartilhar
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-editar-requisicao]').forEach(botao => {
    botao.addEventListener('click', () => carregarRequisicaoSalva(botao.dataset.editarRequisicao));
  });
  tbody.querySelectorAll('[data-excluir-requisicao]').forEach(botao => {
    botao.addEventListener('click', () => excluirRequisicaoSalva(botao.dataset.excluirRequisicao));
  });
  tbody.querySelectorAll('[data-compartilhar-requisicao]').forEach(botao => {
    botao.addEventListener('click', () => compartilharRequisicaoSalva(botao.dataset.compartilharRequisicao, botao));
  });
}

function obterRequisicoesSalvas() {
  try {
    const salvas = JSON.parse(localStorage.getItem(STORAGE_KEY_REQUISICOES) || '[]');
    return Array.isArray(salvas) ? salvas : [];
  } catch (error) {
    console.warn('Nao foi possivel ler requisicoes salvas localmente.', error);
    return [];
  }
}

function gravarRequisicoesSalvas(requisicoes) {
  try {
    localStorage.setItem(STORAGE_KEY_REQUISICOES, JSON.stringify(requisicoes));
    return true;
  } catch (error) {
    console.error('Nao foi possivel salvar localmente.', error);
    alert('Nao foi possivel salvar localmente. Verifique o espaco do navegador ou permissoes.');
    return false;
  }
}

function criarIdLocal() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function adicionarRodape(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let pagina = 1; pagina <= pageCount; pagina += 1) {
    doc.setPage(pagina);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('GTSYSTEM - Marquespan', 14, pageHeight - 10);
    doc.text(`Pagina ${pagina} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
}

function carregarLogoComFundoBranco() {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'logo.png';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(null);
  });
}

function formatarData(value) {
  if (!value) return '-';
  const [ano, mes, dia] = value.split('-');
  return `${dia}/${mes}/${ano}`;
}

function atualizarSemanaPorData() {
  document.getElementById('semanaOrdem').value = calcularSemanaAno(document.getElementById('dataOrdem').value);
}

function calcularSemanaAno(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  if (!ano || !mes || !dia) return '';

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const diaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaSemana);

  const anoSemana = data.getUTCFullYear();
  const inicioAno = new Date(Date.UTC(anoSemana, 0, 1));
  const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
  return `${String(semana).padStart(2, '0')}-${anoSemana}`;
}

function normalizarTexto(value) {
  return String(value || '').trim().toLocaleUpperCase('pt-BR');
}

function formatarCidadeUf(cliente) {
  return [cliente.cidade, cliente.uf].filter(Boolean).join('/');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}
