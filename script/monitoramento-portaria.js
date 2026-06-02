import { supabaseClient } from './supabase.js';

const REFRESH_INTERVAL = 30000;
const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';

let acessos = [];
let portariaChannel = null;
let refreshTimer = null;
let wakeLockSentinel = null;

document.addEventListener('DOMContentLoaded', () => {
  initMonitoramentoPortaria();
});

function initMonitoramentoPortaria() {
  const dataInput = document.getElementById('dataPortaria');
  if (dataInput) dataInput.value = getDataSaoPaulo();

  document.getElementById('btn-aplicar-filtro')?.addEventListener('click', carregarDados);
  document.getElementById('btn-refresh')?.addEventListener('click', carregarDados);
  document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullScreen);
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());
  document.getElementById('dataPortaria')?.addEventListener('change', carregarDados);
  document.getElementById('searchInput')?.addEventListener('input', renderDashboard);

  document.addEventListener('fullscreenchange', atualizarEstadoTelaCheia);
  document.addEventListener('visibilitychange', restaurarWakeLockQuandoVisivel);

  carregarDados();
  configurarRealtime();
  ativarBloqueioDescansoTela();

  refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);
}

function getDataSaoPaulo(date = new Date()) {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE_SAO_PAULO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${partes.year}-${partes.month}-${partes.day}`;
}

function getIntervaloDiaSaoPaulo(data) {
  return {
    inicio: `${data}T00:00:00-03:00`,
    fim: `${data}T23:59:59-03:00`
  };
}

async function carregarDados() {
  const btnRefresh = document.getElementById('btn-refresh');
  btnRefresh?.querySelector('i')?.classList.add('fa-spin');

  const dataPortaria = document.getElementById('dataPortaria')?.value;
  if (!dataPortaria) {
    btnRefresh?.querySelector('i')?.classList.remove('fa-spin');
    return;
  }

  try {
    const intervalo = getIntervaloDiaSaoPaulo(dataPortaria);
    const { data, error } = await supabaseClient
      .from('portaria_acessos')
      .select('*')
      .gte('created_at', intervalo.inicio)
      .lte('created_at', intervalo.fim)
      .order('created_at', { ascending: false });

    if (error) throw error;

    acessos = data || [];
    renderDashboard();
    atualizarTimestamp();
  } catch (error) {
    console.error('Erro ao carregar monitoramento da portaria:', error);
    renderErro();
  } finally {
    btnRefresh?.querySelector('i')?.classList.remove('fa-spin');
  }
}

function configurarRealtime() {
  if (portariaChannel) {
    supabaseClient.removeChannel(portariaChannel);
  }

  portariaChannel = supabaseClient
    .channel('monitoramento-portaria')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'portaria_acessos' }, () => {
      carregarDados();
    })
    .subscribe((status) => {
      const online = status === 'SUBSCRIBED';
      atualizarStatusRealtime(online ? 'online' : 'offline', online ? 'Online' : 'Conectando');
    });
}

function renderDashboard() {
  const dados = filtrarRegistros(acessos);
  const aguardando = dados.filter(item => item.status === 'aguardando');
  const dentro = dados.filter(item => item.status === 'entrada');
  const saiu = dados.filter(item => item.status === 'saida');

  setText('kpi-aguardando', aguardando.length);
  setText('kpi-dentro', dentro.length);
  setText('kpi-saiu', saiu.length);
  setText('kpi-total', dados.length);
  setText('count-aguardando', aguardando.length);
  setText('count-dentro', dentro.length);
  setText('count-saiu', saiu.length);

  renderLista('lista-aguardando', aguardando, 'aguardando');
  renderLista('lista-dentro', dentro, 'dentro');
  renderLista('lista-saiu', saiu, 'saiu');
}

function filtrarRegistros(registros) {
  const termo = normalizarBusca(document.getElementById('searchInput')?.value);
  if (!termo) return registros;

  return registros.filter(item => [
    item.empresa_nome,
    item.empresa_documento,
    item.pessoa_nome,
    item.pessoa_documento,
    item.placa_veiculo,
    item.setor_nome,
    item.produto_servico,
    item.observacoes,
    item.usuario_nome
  ].some(valor => normalizarBusca(valor).includes(termo)));
}

function renderLista(containerId, itens, tipo) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!itens.length) {
    container.innerHTML = `<div class="empty-state">${getMensagemVazia(tipo)}</div>`;
    return;
  }

  container.innerHTML = itens.map(item => `
    <article class="portaria-access-card ${tipo}">
      <div class="portaria-access-icon"><i class="${getIconeStatus(tipo)}"></i></div>
      <div class="portaria-access-main">
        <div class="portaria-access-title">
          <span class="portaria-access-name">${escapeHtml(item.pessoa_nome || '-')}</span>
          <span class="portaria-access-plate">${escapeHtml(item.placa_veiculo || 'SEM PLACA')}</span>
        </div>
        <div class="portaria-access-details">
          <span><i class="fas fa-building"></i> ${escapeHtml(item.empresa_nome || '-')}</span>
          <span><i class="fas fa-id-card"></i> ${escapeHtml(item.empresa_documento || item.pessoa_documento || '-')}</span>
          <span><i class="fas fa-location-dot"></i> ${escapeHtml(item.setor_nome || '-')}</span>
          <span><i class="fas fa-box-open"></i> ${escapeHtml(item.produto_servico || '-')}</span>
          <span><i class="fas fa-clock"></i> Registro ${escapeHtml(formatarDataHoraCompleta(item.created_at))}</span>
          <span><i class="fas fa-sign-in-alt"></i> Entrada ${escapeHtml(formatarDataHoraCompleta(item.entrada_em))}</span>
          <span><i class="fas fa-sign-out-alt"></i> Saida ${escapeHtml(formatarDataHoraCompleta(item.saida_em))}</span>
        </div>
        ${item.observacoes ? `<div class="portaria-access-observacao">${escapeHtml(item.observacoes)}</div>` : ''}
      </div>
    </article>
  `).join('');
}

function getMensagemVazia(tipo) {
  return {
    aguardando: 'Nenhum fornecedor aguardando entrada.',
    dentro: 'Nenhum fornecedor dentro da empresa.',
    saiu: 'Nenhuma saida registrada para os filtros selecionados.'
  }[tipo] || 'Nenhum registro encontrado.';
}

function getIconeStatus(tipo) {
  return {
    aguardando: 'fas fa-hourglass-half',
    dentro: 'fas fa-building-circle-check',
    saiu: 'fas fa-person-walking-arrow-right'
  }[tipo] || 'fas fa-door-open';
}

async function ativarBloqueioDescansoTela() {
  if (!('wakeLock' in navigator)) return;

  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
  } catch (error) {
    console.warn('Nao foi possivel manter a tela ativa:', error);
  }
}

function restaurarWakeLockQuandoVisivel() {
  if (document.visibilityState === 'visible' && !wakeLockSentinel) {
    ativarBloqueioDescansoTela();
  }
}

async function liberarBloqueioDescansoTela() {
  if (!wakeLockSentinel) return;

  try {
    await wakeLockSentinel.release();
  } catch (error) {
    console.warn('Nao foi possivel liberar o bloqueio de descanso da tela:', error);
  } finally {
    wakeLockSentinel = null;
  }
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(error => {
      console.error(`Erro ao entrar em tela cheia: ${error.message}`);
    });
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}

function atualizarEstadoTelaCheia() {
  const btn = document.getElementById('btn-fullscreen');
  const container = document.querySelector('.container');
  const header = document.querySelector('.glass-header');
  const menuContainer = document.getElementById('menu-container');
  const sidebar = document.getElementById('sidebar');

  if (document.fullscreenElement) {
    if (btn) btn.innerHTML = '<i class="fas fa-compress"></i>';
    container?.classList.add('fullscreen-active');
    header?.classList.add('hidden');
    menuContainer?.classList.add('hidden');
    sidebar?.classList.add('hidden');
  } else {
    if (btn) btn.innerHTML = '<i class="fas fa-expand"></i>';
    container?.classList.remove('fullscreen-active');
    header?.classList.remove('hidden');
    menuContainer?.classList.remove('hidden');
    sidebar?.classList.remove('hidden');
  }
}

function atualizarTimestamp() {
  setText('last-update', `Atualizado as: ${formatarHoraSaoPaulo()}`);
}

function atualizarStatusRealtime(status, texto) {
  const el = document.getElementById('realtime-status');
  if (!el) return;

  el.classList.toggle('online', status === 'online');
  el.classList.toggle('offline', status !== 'online');
  el.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;
}

function renderErro() {
  const mensagem = '<div class="empty-state">Erro ao carregar dados da portaria.</div>';
  ['lista-aguardando', 'lista-dentro', 'lista-saiu'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = mensagem;
  });
}

function formatarHoraSaoPaulo(value = new Date()) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_SAO_PAULO,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatarDataHoraCompleta(value) {
  if (!value) return '-';
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR', {
    timeZone: TIMEZONE_SAO_PAULO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function normalizarBusca(value) {
  return String(value || '').trim().toUpperCase();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
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

window.addEventListener('beforeunload', () => {
  if (portariaChannel) supabaseClient.removeChannel(portariaChannel);
  if (refreshTimer) clearInterval(refreshTimer);
  liberarBloqueioDescansoTela();
});
