import { supabaseClient } from './supabase.js';

const AUTH_VERSION = '2026-05-16-auth-v1';
const AUTH_VERSION_KEY = 'marquespan_auth_version';
const CONFIGURACAO_SESSAO_ID = 'global';
const TEMPO_INATIVIDADE_PADRAO_MINUTOS = 30;
const AVISO_ANTES_EXPIRAR_MS = 60 * 1000;
const INTERVALO_VERIFICACAO_MS = 1000;
const INTERVALO_REGISTRO_ATIVIDADE_MS = 5000;
const ULTIMA_ATIVIDADE_KEY = 'marquespan_ultima_atividade';

let encerrandoSessao = false;
let ultimoRegistroAtividade = 0;
let tempoInatividadeMs = TEMPO_INATIVIDADE_PADRAO_MINUTOS * 60 * 1000;
let verificadorInatividade = null;

function limparSessaoLocalAntiga() {
  localStorage.removeItem('usuarioLogado');
  localStorage.removeItem('usuario');
  localStorage.removeItem('perfil');
  localStorage.removeItem('empresa_id');
  localStorage.removeItem(ULTIMA_ATIVIDADE_KEY);
}

function obterUsuarioLocal() {
  try {
    return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
  } catch {
    return null;
  }
}

async function carregarTempoInatividade(authUserId) {
  try {
    const [configuracaoResult, usuarioResult] = await Promise.all([
      supabaseClient
        .from('configuracoes_sistema')
        .select('tempo_inatividade_minutos')
        .eq('id', CONFIGURACAO_SESSAO_ID)
        .maybeSingle(),
      supabaseClient
        .from('usuarios')
        .select('tempo_inatividade_minutos')
        .eq('auth_user_id', authUserId)
        .maybeSingle()
    ]);

    if (configuracaoResult.error) throw configuracaoResult.error;
    if (usuarioResult.error) throw usuarioResult.error;

    const tempoIndividual = usuarioResult.data?.tempo_inatividade_minutos;
    if (tempoIndividual !== null && tempoIndividual !== undefined) {
      const minutos = Number(tempoIndividual);
      if (Number.isFinite(minutos) && minutos >= 0) return minutos;
    }

    const minutosGlobais = Number(configuracaoResult.data?.tempo_inatividade_minutos);
    if (Number.isFinite(minutosGlobais) && minutosGlobais >= 0) return minutosGlobais;
  } catch (error) {
    console.warn('Nao foi possivel carregar a configuracao de inatividade. Usando 30 minutos.', error);
  }

  return TEMPO_INATIVIDADE_PADRAO_MINUTOS;
}

function criarAvisoInatividade() {
  if (document.getElementById('auth-idle-warning')) return;

  const style = document.createElement('style');
  style.id = 'auth-idle-warning-style';
  style.textContent = `
    #auth-idle-warning {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.58);
      backdrop-filter: blur(4px);
    }
    #auth-idle-warning.auth-idle-visible { display: flex; }
    #auth-idle-warning .auth-idle-card {
      width: min(420px, 100%);
      padding: 24px;
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
      color: #1f2937;
      text-align: center;
    }
    #auth-idle-warning .auth-idle-icon {
      margin-bottom: 10px;
      color: #fd7e14;
      font-size: 2rem;
    }
    #auth-idle-warning h2 { margin: 0 0 10px; font-size: 1.35rem; }
    #auth-idle-warning p { margin: 0 0 18px; line-height: 1.5; }
    #auth-idle-countdown { font-weight: 800; color: #b45309; }
    #auth-idle-continue {
      border: 0;
      border-radius: 10px;
      padding: 11px 18px;
      background: linear-gradient(135deg, #28a745, #1e7e34);
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
  `;

  const aviso = document.createElement('div');
  aviso.id = 'auth-idle-warning';
  aviso.setAttribute('role', 'dialog');
  aviso.setAttribute('aria-modal', 'true');
  aviso.setAttribute('aria-labelledby', 'auth-idle-title');
  aviso.innerHTML = `
    <div class="auth-idle-card">
      <div class="auth-idle-icon">&#9201;</div>
      <h2 id="auth-idle-title">Sessao prestes a expirar</h2>
      <p>
        Por seguranca, voce sera desconectado por inatividade em
        <span id="auth-idle-countdown">60 segundos</span>.
      </p>
      <button type="button" id="auth-idle-continue">Continuar conectado</button>
    </div>
  `;

  document.head.appendChild(style);
  document.body.appendChild(aviso);
  document.getElementById('auth-idle-continue')?.addEventListener('click', registrarAtividade);
}

function ocultarAvisoInatividade() {
  document.getElementById('auth-idle-warning')?.classList.remove('auth-idle-visible');
}

function registrarAtividade() {
  if (encerrandoSessao || tempoInatividadeMs <= 0) return;

  const agora = Date.now();
  if (agora - ultimoRegistroAtividade < INTERVALO_REGISTRO_ATIVIDADE_MS) return;

  ultimoRegistroAtividade = agora;
  localStorage.setItem(ULTIMA_ATIVIDADE_KEY, String(agora));
  ocultarAvisoInatividade();
}

function mostrarAvisoInatividade(tempoRestanteMs) {
  const aviso = document.getElementById('auth-idle-warning');
  const contador = document.getElementById('auth-idle-countdown');
  if (!aviso || !contador) return;

  const segundos = Math.max(1, Math.ceil(tempoRestanteMs / 1000));
  contador.textContent = `${segundos} segundo${segundos === 1 ? '' : 's'}`;
  aviso.classList.add('auth-idle-visible');
}

async function encerrarPorInatividade() {
  if (encerrandoSessao) return;
  encerrandoSessao = true;
  clearInterval(verificadorInatividade);
  limparSessaoLocalAntiga();

  try {
    await supabaseClient.auth.signOut();
  } finally {
    window.location.replace('index.html?motivo=inatividade');
  }
}

function verificarInatividade() {
  if (tempoInatividadeMs <= 0 || encerrandoSessao) return;

  const ultimaAtividade = Number(localStorage.getItem(ULTIMA_ATIVIDADE_KEY)) || Date.now();
  const tempoRestante = tempoInatividadeMs - (Date.now() - ultimaAtividade);

  if (tempoRestante <= 0) {
    encerrarPorInatividade();
  } else if (tempoRestante <= Math.min(AVISO_ANTES_EXPIRAR_MS, tempoInatividadeMs)) {
    mostrarAvisoInatividade(tempoRestante);
  } else {
    ocultarAvisoInatividade();
  }
}

async function iniciarControleInatividade(authUserId) {
  const minutos = await carregarTempoInatividade(authUserId);
  tempoInatividadeMs = minutos * 60 * 1000;
  if (tempoInatividadeMs <= 0) return;

  criarAvisoInatividade();

  const ultimaAtividade = Number(localStorage.getItem(ULTIMA_ATIVIDADE_KEY));
  if (!Number.isFinite(ultimaAtividade) || ultimaAtividade <= 0) {
    localStorage.setItem(ULTIMA_ATIVIDADE_KEY, String(Date.now()));
  }

  ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll'].forEach(evento => {
    window.addEventListener(evento, registrarAtividade, { passive: true });
  });

  window.addEventListener('storage', event => {
    if (event.key === ULTIMA_ATIVIDADE_KEY) ocultarAvisoInatividade();
    if (event.key === 'usuarioLogado' && event.newValue === null) {
      window.location.replace('index.html');
    }
  });

  verificadorInatividade = window.setInterval(verificarInatividade, INTERVALO_VERIFICACAO_MS);
  verificarInatividade();
}

async function protegerPagina() {
  const versaoAuth = localStorage.getItem(AUTH_VERSION_KEY);

  if (versaoAuth !== AUTH_VERSION) {
    limparSessaoLocalAntiga();
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error || !session) {
    limparSessaoLocalAntiga();
    window.location.href = 'index.html';
    return;
  }

  const usuarioLocal = obterUsuarioLocal();

  if (!usuarioLocal) {
    limparSessaoLocalAntiga();
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  const divUsuario = document.getElementById('usuario-logado');
  if (divUsuario && usuarioLocal.nome) {
    divUsuario.textContent = `\u{1F464} Ol\u00e1, ${usuarioLocal.nome}`;
  }

  await iniciarControleInatividade(session.user.id);
}

protegerPagina();
