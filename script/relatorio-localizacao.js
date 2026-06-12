import { supabaseClient } from './supabase.js';

const form = document.getElementById('form-relatorio-localizacao');
const placaInput = document.getElementById('relatorio-placa');
const inicioInput = document.getElementById('relatorio-inicio');
const terminoInput = document.getElementById('relatorio-termino');
const listaVeiculos = document.getElementById('relatorio-lista-veiculos');
const botaoConsultar = document.getElementById('btn-consultar-historico');
const mensagem = document.getElementById('mensagem-relatorio-localizacao');
const resultado = document.getElementById('resultado-relatorio-localizacao');
const tabelaBody = document.getElementById('tabela-posicoes-body');

let mapa;
let camadaPercurso;
let marcadorSelecionado;
let pontosAtuais = [];

function normalizarPlaca(valor) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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

function iniciarMapa() {
  mapa = L.map('mapa-relatorio-localizacao', {
    preferCanvas: true
  }).setView([-23.5505, -46.6333], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  camadaPercurso = L.layerGroup().addTo(mapa);
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
  return `
    <strong>${titulo}</strong><br>
    ${formatarData(ponto.dataInicial)}<br>
    Velocidade: ${Math.round(ponto.velocidade || 0)} km/h<br>
    ${ponto.latitude.toFixed(6)}, ${ponto.longitude.toFixed(6)}
  `;
}

function desenharMapa(pontos) {
  camadaPercurso.clearLayers();
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

function renderizarTabela(pontos) {
  tabelaBody.innerHTML = '';
  const fragmento = document.createDocumentFragment();

  pontos.slice(0, 2000).forEach((ponto, indice) => {
    const linha = document.createElement('tr');
    linha.dataset.indice = String(indice);
    linha.innerHTML = `
      <td>${indice + 1}</td>
      <td>${formatarData(ponto.dataInicial)}</td>
      <td>${Math.round(ponto.velocidade || 0)} km/h</td>
      <td><span class="status-posicao ${ponto.tipo}">${ponto.tipo === 'parado' ? 'Parado' : 'Deslocamento'}</span></td>
      <td>${ponto.latitude.toFixed(6)}, ${ponto.longitude.toFixed(6)}</td>
      <td>${ponto.quantidadePosicoes || 1}</td>
    `;
    linha.addEventListener('click', () => destacarPonto(indice));
    fragmento.appendChild(linha);
  });

  tabelaBody.appendChild(fragmento);
  document.getElementById('contador-posicoes').textContent = pontos.length > 2000
    ? `Exibindo 2.000 de ${pontos.length}`
    : `${pontos.length} registros`;
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

function definirCarregando(carregando) {
  botaoConsultar.disabled = carregando;
  botaoConsultar.querySelector('i').className = carregando
    ? 'fas fa-circle-notch fa-spin'
    : 'fas fa-magnifying-glass-location';
  botaoConsultar.querySelector('span').textContent = carregando
    ? 'Consultando histórico...'
    : 'Consultar percurso';
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

async function consultarHistorico() {
  const placa = normalizarPlaca(placaInput.value);
  const inicio = new Date(inicioInput.value);
  const termino = new Date(terminoInput.value);

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

    pontosAtuais = data.data.pontos;
    preencherResumo(data.data);
    desenharMapa(pontosAtuais);
    renderizarTabela(pontosAtuais);
    resultado.hidden = false;
    setTimeout(() => mapa.invalidateSize(), 50);
    mostrarMensagem(data.data.truncado
      ? 'Consulta concluída. O resultado foi limitado às primeiras 10.000 posições.'
      : 'Histórico carregado com sucesso.');
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

placaInput.addEventListener('input', () => {
  placaInput.value = normalizarPlaca(placaInput.value);
});

definirPeriodoPadrao();
iniciarMapa();
carregarVeiculos();
