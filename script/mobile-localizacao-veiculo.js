import { supabaseClient } from './supabase.js';

const form = document.getElementById('form-localizacao-mobile');
const placaInput = document.getElementById('placa-localizacao-mobile');
const listaVeiculos = document.getElementById('veiculos-localizacao-mobile');
const botaoLocalizar = document.getElementById('btn-localizar-mobile');
const botaoAtualizar = document.getElementById('btn-atualizar-mobile');
const botaoLimpar = document.getElementById('btn-limpar-placa-mobile');
const botaoCompartilhar = document.getElementById('btn-compartilhar-mobile');
const mensagem = document.getElementById('mensagem-localizacao-mobile');
const resultado = document.getElementById('resultado-localizacao-mobile');
const iframeMapa = document.getElementById('iframe-mapa-mobile');
const linkGoogle = document.getElementById('btn-abrir-google-mobile');

let localizacaoAtual = null;

function normalizarPlaca(valor) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatarPlaca(valor) {
  const placa = normalizarPlaca(valor);
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

function formatarData(valor) {
  const data = new Date(valor);
  if (!valor || Number.isNaN(data.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(data);
}

function mostrarMensagem(texto, erro = false) {
  mensagem.textContent = texto;
  mensagem.classList.toggle('erro', erro);
}

function definirCarregando(carregando) {
  botaoLocalizar.disabled = carregando;
  botaoLocalizar.querySelector('i').className = carregando
    ? 'fas fa-circle-notch fa-spin'
    : 'fas fa-satellite-dish';
  botaoLocalizar.querySelector('span').textContent = carregando
    ? 'Localizando...'
    : 'Localizar agora';
}

async function carregarVeiculos() {
  const { data, error } = await supabaseClient
    .from('veiculos')
    .select('placa, modelo')
    .not('placa', 'is', null)
    .order('placa');

  if (error) {
    console.error('Erro ao carregar veículos no app de localização:', error);
    return;
  }

  listaVeiculos.innerHTML = '';
  (data || []).forEach((veiculo) => {
    const option = document.createElement('option');
    option.value = normalizarPlaca(veiculo.placa);
    option.label = [formatarPlaca(veiculo.placa), veiculo.modelo].filter(Boolean).join(' - ');
    listaVeiculos.appendChild(option);
  });
}

function preencherResultado(dados) {
  const latitude = Number(dados.latitude);
  const longitude = Number(dados.longitude);
  const possuiCoordenadas = Number.isFinite(latitude) && Number.isFinite(longitude);
  const placa = dados.placa || formatarPlaca(placaInput.value);

  document.getElementById('mobile-resultado-placa').textContent = placa;
  document.getElementById('mobile-resultado-unidade').textContent = dados.unidade || 'Unidade rastreada';
  document.getElementById('mobile-resultado-endereco').textContent = dados.endereco || 'Endereço não disponível';
  document.getElementById('mobile-resultado-referencia').textContent = dados.referencia || '';
  document.getElementById('mobile-resultado-data').textContent = formatarData(
    dados.dataAtualizacao || dados.dataEvento
  );
  document.getElementById('mobile-resultado-velocidade').textContent = Number.isFinite(Number(dados.velocidade))
    ? `${Math.round(Number(dados.velocidade))} km/h`
    : 'Não informada';
  document.getElementById('mobile-resultado-ignicao').textContent = dados.ignicao === true
    ? 'Ligada'
    : dados.ignicao === false
      ? 'Desligada'
      : 'Não informada';

  const status = document.getElementById('mobile-resultado-status');
  status.textContent = dados.desatualizado ? 'Desatualizado' : 'Atualizado';
  status.classList.toggle('desatualizado', Boolean(dados.desatualizado));

  if (possuiCoordenadas) {
    const coordenadas = `${latitude},${longitude}`;
    const urlGoogle = `https://www.google.com/maps?q=${encodeURIComponent(coordenadas)}`;
    iframeMapa.src = `${urlGoogle}&output=embed`;
    linkGoogle.href = urlGoogle;
  } else {
    iframeMapa.src = 'about:blank';
    linkGoogle.href = '#';
  }

  localizacaoAtual = {
    placa,
    endereco: dados.endereco || '',
    latitude,
    longitude,
    url: linkGoogle.href
  };
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function consultarLocalizacao() {
  const placa = normalizarPlaca(placaInput.value);
  if (placa.length !== 7) {
    mostrarMensagem('Informe uma placa válida com 7 caracteres.', true);
    resultado.hidden = true;
    return;
  }

  placaInput.value = placa;
  definirCarregando(true);
  mostrarMensagem('Consultando a última posição...');

  try {
    const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
      body: { placa }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || 'Veículo não localizado.');

    preencherResultado(data.data);
    mostrarMensagem('Localização atualizada.');
  } catch (error) {
    console.error('Erro ao localizar veículo no app:', error);
    resultado.hidden = true;
    mostrarMensagem(error?.message || 'Não foi possível localizar o veículo.', true);
  } finally {
    definirCarregando(false);
  }
}

async function compartilharLocalizacao() {
  if (!localizacaoAtual?.url || localizacaoAtual.url === '#') return;
  const texto = [
    `Localização do veículo ${localizacaoAtual.placa}`,
    localizacaoAtual.endereco,
    localizacaoAtual.url
  ].filter(Boolean).join('\n');

  try {
    if (navigator.share) {
      await navigator.share({
        title: `Veículo ${localizacaoAtual.placa}`,
        text: texto
      });
      return;
    }

    await navigator.clipboard.writeText(texto);
    mostrarMensagem('Localização copiada para a área de transferência.');
  } catch (error) {
    if (error?.name !== 'AbortError') {
      mostrarMensagem('Não foi possível compartilhar a localização.', true);
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  consultarLocalizacao();
});

placaInput.addEventListener('input', () => {
  placaInput.value = normalizarPlaca(placaInput.value);
});

botaoLimpar.addEventListener('click', () => {
  placaInput.value = '';
  placaInput.focus();
});

botaoAtualizar.addEventListener('click', consultarLocalizacao);
botaoCompartilhar.addEventListener('click', compartilharLocalizacao);

carregarVeiculos();
