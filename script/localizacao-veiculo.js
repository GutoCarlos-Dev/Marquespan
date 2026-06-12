import { supabaseClient } from './supabase.js';

const form = document.getElementById('form-localizacao');
const inputPlaca = document.getElementById('placa-localizacao');
const listaVeiculos = document.getElementById('veiculos-localizacao');
const botaoLocalizar = document.getElementById('btn-localizar');
const botaoAtualizar = document.getElementById('btn-atualizar-localizacao');
const mensagem = document.getElementById('mensagem-localizacao');
const resultado = document.getElementById('resultado-localizacao');
const painelMapa = document.getElementById('painel-mapa-localizacao');
const iframeMapa = document.getElementById('iframe-mapa-localizacao');
const linkMapaExterno = document.getElementById('link-mapa-externo');
const painelMapaEndereco = document.getElementById('painel-mapa-endereco');

let urlMapaEmbed = '';

const campos = {
  placa: document.getElementById('resultado-placa'),
  unidade: document.getElementById('resultado-unidade'),
  status: document.getElementById('resultado-status'),
  endereco: document.getElementById('resultado-endereco'),
  referencia: document.getElementById('resultado-referencia'),
  data: document.getElementById('resultado-data'),
  velocidade: document.getElementById('resultado-velocidade'),
  ignicao: document.getElementById('resultado-ignicao'),
  odometro: document.getElementById('resultado-odometro'),
  coordenadas: document.getElementById('resultado-coordenadas'),
  grupo: document.getElementById('resultado-grupo'),
  filial: document.getElementById('resultado-filial'),
  mapa: document.getElementById('link-mapa')
};

function placaSemMascara(valor) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatarPlaca(valor) {
  const placa = placaSemMascara(valor);
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

function formatarData(valor) {
  if (!valor) return 'Não informada';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Não informada';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(data);
}

function formatarNumero(valor, casas = 0) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 'Não informado';
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

function definirCarregando(carregando) {
  botaoLocalizar.disabled = carregando;
  botaoLocalizar.querySelector('i').className = carregando
    ? 'fas fa-circle-notch fa-spin'
    : 'fas fa-satellite-dish';
  botaoLocalizar.querySelector('span').textContent = carregando
    ? 'Consultando rastreador...'
    : 'Localizar veículo';
}

function mostrarMensagem(texto, erro = false) {
  mensagem.textContent = texto;
  mensagem.classList.toggle('erro', erro);
}

function exibirMapa() {
  if (!urlMapaEmbed) return;
  painelMapa.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function carregarVeiculos() {
  const { data, error } = await supabaseClient
    .from('veiculos')
    .select('placa, modelo, filial, situacao')
    .not('placa', 'is', null)
    .order('placa');

  if (error) {
    console.error('Erro ao carregar veículos para localização:', error);
    return;
  }

  listaVeiculos.innerHTML = '';
  (data || []).forEach((veiculo) => {
    const option = document.createElement('option');
    option.value = placaSemMascara(veiculo.placa);
    option.label = [
      formatarPlaca(veiculo.placa),
      veiculo.modelo,
      veiculo.filial
    ].filter(Boolean).join(' - ');
    listaVeiculos.appendChild(option);
  });
}

function preencherResultado(dados) {
  campos.placa.textContent = dados.placa || formatarPlaca(inputPlaca.value);
  campos.unidade.textContent = dados.unidade || 'Unidade rastreada';
  campos.status.textContent = dados.desatualizado ? 'Sinal desatualizado' : 'Sinal atualizado';
  campos.status.classList.toggle('desatualizado', Boolean(dados.desatualizado));
  campos.endereco.textContent = dados.endereco || 'Endereço não disponível';
  campos.referencia.textContent = dados.referencia || '';
  campos.data.textContent = formatarData(dados.dataAtualizacao || dados.dataEvento);
  campos.velocidade.textContent = `${formatarNumero(dados.velocidade, 0)} km/h`;
  campos.ignicao.textContent = dados.ignicao === true
    ? 'Ligada'
    : dados.ignicao === false
      ? 'Desligada'
      : 'Não informada';
  campos.odometro.textContent = `${formatarNumero(dados.odometro, 1)} km`;
  campos.coordenadas.textContent = Number.isFinite(Number(dados.latitude))
    && Number.isFinite(Number(dados.longitude))
    ? `${Number(dados.latitude).toFixed(6)}, ${Number(dados.longitude).toFixed(6)}`
    : 'Não informadas';
  campos.grupo.textContent = dados.grupo || 'Não informado';
  campos.filial.textContent = dados.filial || 'Não informada';

  if (Number.isFinite(Number(dados.latitude)) && Number.isFinite(Number(dados.longitude))) {
    const coordenadas = `${dados.latitude},${dados.longitude}`;
    const urlMapaExterno = `https://www.google.com/maps?q=${encodeURIComponent(coordenadas)}`;
    urlMapaEmbed = `https://www.google.com/maps?q=${encodeURIComponent(coordenadas)}&output=embed`;
    campos.mapa.disabled = false;
    linkMapaExterno.href = urlMapaExterno;
    painelMapaEndereco.textContent = dados.endereco || coordenadas;
    document.getElementById('painel-mapa-titulo').textContent = `Mapa do veículo ${dados.placa || formatarPlaca(inputPlaca.value)}`;
    iframeMapa.src = urlMapaEmbed;
    painelMapa.hidden = false;
  } else {
    urlMapaEmbed = '';
    campos.mapa.disabled = true;
    linkMapaExterno.href = '#';
    iframeMapa.src = 'about:blank';
    painelMapa.hidden = true;
  }

  resultado.hidden = false;
}

async function consultarLocalizacao() {
  const placa = placaSemMascara(inputPlaca.value);
  if (placa.length !== 7) {
    mostrarMensagem('Informe uma placa válida com 7 caracteres.', true);
    resultado.hidden = true;
    return;
  }

  inputPlaca.value = placa;
  definirCarregando(true);
  mostrarMensagem('Acessando a última posição enviada pelo rastreador...');

  try {
    const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
      body: { placa }
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || 'Não foi possível localizar o veículo.');

    preencherResultado(data.data);
    mostrarMensagem('Localização atualizada com sucesso.');
  } catch (error) {
    console.error('Erro ao consultar localização:', error);
    resultado.hidden = true;
    mostrarMensagem(
      error?.message || 'Não foi possível consultar o rastreador. Tente novamente.',
      true
    );
  } finally {
    definirCarregando(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  consultarLocalizacao();
});

botaoAtualizar.addEventListener('click', consultarLocalizacao);
campos.mapa.addEventListener('click', exibirMapa);

inputPlaca.addEventListener('input', () => {
  inputPlaca.value = placaSemMascara(inputPlaca.value);
});

carregarVeiculos();
