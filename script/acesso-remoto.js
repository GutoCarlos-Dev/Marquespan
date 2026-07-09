import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
if (!usuarioLogado || String(usuarioLogado.nivel || '').toLowerCase() !== 'administrador') {
  alert('Acesso restrito a administradores.');
  window.location.href = 'dashboard.html';
}

let canalPresenca = null;
let canalSinais = null;
let usuariosOnline = [];
let sessaoAtual = null;
let usuarioMensagemSelecionado = null;

document.addEventListener('DOMContentLoaded', iniciarPagina);

function iniciarPagina() {
  document.getElementById('remoteSearchUser')?.addEventListener('input', renderUsuariosOnline);
  document.getElementById('btnRemoteStop')?.addEventListener('click', () => encerrarSessao(true));
  document.getElementById('remoteVideo')?.addEventListener('click', enviarCliqueRemoto);
  document.getElementById('btnCloseRemoteMessage')?.addEventListener('click', fecharModalMensagem);
  document.getElementById('btnCancelRemoteMessage')?.addEventListener('click', fecharModalMensagem);
  document.getElementById('btnSendRemoteMessage')?.addEventListener('click', enviarMensagemUsuario);
  document.getElementById('modalRemoteMessage')?.addEventListener('click', event => {
    if (event.target.id === 'modalRemoteMessage') fecharModalMensagem();
  });

  iniciarPresenca();
  iniciarSinais();
}

function iniciarPresenca() {
  canalPresenca = supabaseClient.channel('presenca_usuarios');
  canalPresenca
    .on('presence', { event: 'sync' }, () => {
      usuariosOnline = normalizarPresencas(canalPresenca.presenceState());
      renderUsuariosOnline();
    })
    .subscribe();
}

function iniciarSinais() {
  canalSinais = supabaseClient.channel('sinais_admin');
  canalSinais
    .on('broadcast', { event: 'remote_response' }, ({ payload }) => receberRespostaSolicitacao(payload))
    .on('broadcast', { event: 'remote_message_received' }, ({ payload }) => confirmarMensagemRecebida(payload))
    .on('broadcast', { event: 'remote_offer' }, ({ payload }) => receberOffer(payload))
    .on('broadcast', { event: 'remote_ice' }, ({ payload }) => receberIce(payload))
    .on('broadcast', { event: 'remote_stop' }, ({ payload }) => {
      if (payload?.session_id === sessaoAtual?.sessionId) {
        setStatus('Encerrada', 'idle');
        limparSessao();
      }
    })
    .subscribe();
}

function normalizarPresencas(state) {
  const mapa = new Map();
  Object.values(state).flat().forEach(item => {
    const chave = String(item.user_id ?? item.nome ?? '');
    if (!chave) return;
    const atual = mapa.get(chave);
    if (!atual || new Date(item.entrou_em || 0) > new Date(atual.entrou_em || 0)) {
      mapa.set(chave, item);
    }
  });
  return [...mapa.values()].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

function renderUsuariosOnline() {
  const container = document.getElementById('remoteUsersGrid');
  const termo = normalizar(document.getElementById('remoteSearchUser')?.value);
  const meuId = String(usuarioLogado.id);
  const usuarios = usuariosOnline.filter(u => {
    if (String(u.user_id) === meuId) return false;
    if (!termo) return true;
    return normalizar([u.nome, u.filial, nomePagina(u.pagina), u.pagina].join(' ')).includes(termo);
  });

  document.getElementById('remoteOnlineCount').textContent = `${usuariosOnline.length} online`;

  if (!usuarios.length) {
    container.innerHTML = '<p class="remote-empty">Nenhum usuario online disponivel para suporte.</p>';
    return;
  }

  container.innerHTML = usuarios.map(u => `
    <article class="remote-user-card">
      <div class="remote-user-avatar"><i class="fas fa-user-circle"></i></div>
      <div class="remote-user-info">
        <strong>${escapeHtml(u.nome || 'Usuario')}</strong>
        <span><i class="fas fa-building"></i> ${escapeHtml(u.filial || 'Global')}</span>
        <span><i class="fas fa-window-maximize"></i> ${escapeHtml(nomePagina(u.pagina))}</span>
      </div>
      <div class="remote-user-actions">
        <button type="button" class="btn-glass btn-blue" data-remote-mode="view" data-user-id="${escapeHtml(u.user_id)}">
          <i class="fas fa-eye"></i> Visualizar
        </button>
        <button type="button" class="btn-glass btn-blue" data-remote-message data-user-id="${escapeHtml(u.user_id)}">
          <i class="fas fa-comment-dots"></i> Mensagem
        </button>
        <button type="button" class="btn-glass btn-green" data-remote-mode="control" data-user-id="${escapeHtml(u.user_id)}">
          <i class="fas fa-mouse-pointer"></i> Controle total
        </button>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('[data-remote-mode]').forEach(button => {
    button.addEventListener('click', () => solicitarAcesso(button.dataset.userId, button.dataset.remoteMode));
  });
  container.querySelectorAll('[data-remote-message]').forEach(button => {
    button.addEventListener('click', () => abrirModalMensagem(button.dataset.userId));
  });
}

function abrirModalMensagem(userId) {
  const alvo = usuariosOnline.find(u => String(u.user_id) === String(userId));
  if (!alvo) return;
  usuarioMensagemSelecionado = alvo;
  document.getElementById('remoteMessageTarget').textContent = `Para: ${alvo.nome || 'Usuario'} (${alvo.filial || 'Global'})`;
  document.getElementById('remoteMessageText').value = '';
  document.getElementById('modalRemoteMessage').classList.remove('hidden');
  document.getElementById('remoteMessageText').focus();
}

function fecharModalMensagem() {
  usuarioMensagemSelecionado = null;
  document.getElementById('modalRemoteMessage')?.classList.add('hidden');
}

async function enviarMensagemUsuario() {
  const alvo = usuarioMensagemSelecionado;
  const mensagem = document.getElementById('remoteMessageText').value.trim();
  if (!alvo || !canalSinais) return;
  if (!mensagem) {
    alert('Digite a mensagem antes de enviar.');
    return;
  }

  const btn = document.getElementById('btnSendRemoteMessage');
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando';

  const sentAt = new Date().toISOString();
  const resultado = await canalSinais.send({
    type: 'broadcast',
    event: 'remote_message',
    payload: {
      admin_id: usuarioLogado.id,
      admin_nome: usuarioLogado.nome || usuarioLogado.nomecompleto || 'Administrador',
      target_user_id: String(alvo.user_id),
      target_nome: alvo.nome || 'Usuario',
      message: mensagem,
      sent_at: sentAt
    }
  });

  btn.disabled = false;
  btn.innerHTML = textoOriginal;

  if (resultado !== 'ok') {
    alert(`Erro ao enviar mensagem: ${resultado}`);
    return;
  }

  registrarAuditoria('INCLUIR', 'Acesso Remoto', `Mensagem enviada para ${alvo.nome || alvo.user_id}: ${mensagem.slice(0, 120)}`);
  fecharModalMensagem();
  setStatus('Mensagem enviada', 'online');
}

function confirmarMensagemRecebida(payload) {
  if (String(payload?.admin_id) !== String(usuarioLogado.id)) return;
  setStatus(`Mensagem recebida por ${payload.target_nome || 'usuario'}`, 'online');
}

async function solicitarAcesso(userId, mode) {
  const alvo = usuariosOnline.find(u => String(u.user_id) === String(userId));
  if (!alvo || !canalSinais) return;
  if (sessaoAtual) {
    alert('Encerre a sessao atual antes de iniciar outra.');
    return;
  }

  const sessionId = criarSessionId();
  sessaoAtual = {
    sessionId,
    targetUserId: String(userId),
    targetNome: alvo.nome || 'Usuario',
    mode,
    peer: null,
    remoteStream: null
  };

  atualizarTituloSessao(alvo, mode);
  setStatus('Aguardando aceite', 'waiting');
  document.getElementById('btnRemoteStop').disabled = false;

  const resultado = await canalSinais.send({
    type: 'broadcast',
    event: 'remote_request',
    payload: {
      session_id: sessionId,
      admin_id: usuarioLogado.id,
      admin_nome: usuarioLogado.nome || usuarioLogado.nomecompleto || 'Administrador',
      target_user_id: String(userId),
      mode
    }
  });

  if (resultado !== 'ok') {
    setStatus('Falha ao enviar', 'error');
    alert(`Erro ao enviar solicitacao: ${resultado}`);
    limparSessao();
    return;
  }

  registrarAuditoria('INCLUIR', 'Acesso Remoto', `Solicitacao de ${mode === 'control' ? 'controle total' : 'visualizacao'} enviada para ${alvo.nome || userId}`);
}

function receberRespostaSolicitacao(payload) {
  if (!sessaoAtual || payload?.session_id !== sessaoAtual.sessionId || String(payload?.admin_id) !== String(usuarioLogado.id)) return;

  if (!payload.accepted) {
    setStatus('Recusada', 'error');
    alert(payload.reason || 'O usuario recusou a solicitacao.');
    registrarAuditoria('ALTERAR', 'Acesso Remoto', `Solicitacao recusada por ${payload.target_nome || sessaoAtual.targetNome}`);
    limparSessao();
    return;
  }

  setStatus('Aprovada, conectando', 'waiting');
}

async function receberOffer(payload) {
  if (!sessaoAtual || payload?.session_id !== sessaoAtual.sessionId || String(payload?.admin_id) !== String(usuarioLogado.id)) return;

  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  sessaoAtual.peer = peer;

  peer.ontrack = event => {
    const stream = event.streams?.[0];
    if (!stream) return;
    sessaoAtual.remoteStream = stream;
    const video = document.getElementById('remoteVideo');
    video.srcObject = stream;
    document.querySelector('.remote-screen-wrap')?.classList.add('has-video');
    setStatus('Conectado', 'online');
    registrarAuditoria('ALTERAR', 'Acesso Remoto', `Sessao remota iniciada com ${sessaoAtual.targetNome}`);
  };

  peer.onicecandidate = event => {
    if (!event.candidate) return;
    canalSinais.send({
      type: 'broadcast',
      event: 'remote_ice',
      payload: {
        session_id: sessaoAtual.sessionId,
        admin_id: usuarioLogado.id,
        target_user_id: sessaoAtual.targetUserId,
        from: 'admin',
        candidate: event.candidate
      }
    });
  };

  peer.onconnectionstatechange = () => {
    if (['closed', 'failed', 'disconnected'].includes(peer.connectionState)) {
      setStatus('Desconectado', peer.connectionState === 'failed' ? 'error' : 'idle');
    }
  };

  await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  await canalSinais.send({
    type: 'broadcast',
    event: 'remote_answer',
    payload: {
      session_id: sessaoAtual.sessionId,
      admin_id: usuarioLogado.id,
      target_user_id: sessaoAtual.targetUserId,
      sdp: answer
    }
  });
}

async function receberIce(payload) {
  if (!sessaoAtual || payload?.session_id !== sessaoAtual.sessionId || payload?.from !== 'target' || !payload?.candidate) return;
  try {
    await sessaoAtual.peer?.addIceCandidate(new RTCIceCandidate(payload.candidate));
  } catch (error) {
    console.warn('Falha ao adicionar ICE do usuario:', error);
  }
}

async function enviarCliqueRemoto(event) {
  if (!sessaoAtual || sessaoAtual.mode !== 'control' || !canalSinais) return;
  const video = event.currentTarget;
  const rect = video.getBoundingClientRect();
  const xRatio = (event.clientX - rect.left) / rect.width;
  const yRatio = (event.clientY - rect.top) / rect.height;

  await canalSinais.send({
    type: 'broadcast',
    event: 'remote_control',
    payload: {
      session_id: sessaoAtual.sessionId,
      admin_id: usuarioLogado.id,
      target_user_id: sessaoAtual.targetUserId,
      type: 'click',
      xRatio: Math.min(1, Math.max(0, xRatio)),
      yRatio: Math.min(1, Math.max(0, yRatio))
    }
  });
}

async function encerrarSessao(notificarUsuario) {
  if (!sessaoAtual) return;
  const { sessionId, targetUserId, targetNome } = sessaoAtual;
  if (notificarUsuario && canalSinais) {
    await canalSinais.send({
      type: 'broadcast',
      event: 'remote_stop',
      payload: {
        session_id: sessionId,
        admin_id: usuarioLogado.id,
        target_user_id: targetUserId,
        target_nome: targetNome,
        from: 'admin'
      }
    });
    registrarAuditoria('ALTERAR', 'Acesso Remoto', `Sessao remota encerrada com ${targetNome}`);
  }
  limparSessao();
  setStatus('Encerrada', 'idle');
}

function limparSessao() {
  if (sessaoAtual?.peer) sessaoAtual.peer.close();
  if (sessaoAtual?.remoteStream) sessaoAtual.remoteStream.getTracks().forEach(track => track.stop());
  sessaoAtual = null;
  const video = document.getElementById('remoteVideo');
  if (video) video.srcObject = null;
  document.querySelector('.remote-screen-wrap')?.classList.remove('has-video');
  document.getElementById('btnRemoteStop').disabled = true;
  document.getElementById('remoteSessionTitle').innerHTML = '<i class="fas fa-display"></i> Nenhuma sessao ativa';
  document.getElementById('remoteSessionMeta').textContent = 'Selecione um usuario online para solicitar visualizacao ou controle.';
}

function atualizarTituloSessao(alvo, mode) {
  document.getElementById('remoteSessionTitle').innerHTML = `<i class="fas fa-display"></i> ${escapeHtml(alvo.nome || 'Usuario')}`;
  document.getElementById('remoteSessionMeta').textContent = `${mode === 'control' ? 'Controle total' : 'Visualizacao'} solicitado em ${nomePagina(alvo.pagina)} - ${alvo.filial || 'Global'}`;
}

function setStatus(texto, classe) {
  const el = document.getElementById('remoteSessionStatus');
  if (!el) return;
  el.textContent = texto;
  el.className = `remote-status ${classe || 'idle'}`;
}

function criarSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `remote-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nomePagina(pagina) {
  const nomes = {
    'dashboard.html': 'Dashboard',
    'auditoria.html': 'Auditoria',
    'acesso-remoto.html': 'Acesso Remoto',
    'portaria-controle-acesso.html': 'Portaria',
    'monitoramento-portaria.html': 'Portaria Real-Time',
    'coletar-manutencao.html': 'Coleta Manutencao',
    'retorno-rota.html': 'Retorno de Rota',
    'monitoramento-retorno-rota.html': 'Retorno de Rota Real-Time'
  };
  return nomes[pagina] || (pagina ? String(pagina).replace('.html', '') : 'Sistema');
}

function normalizar(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
  if (sessaoAtual) encerrarSessao(true);
  if (canalPresenca) supabaseClient.removeChannel(canalPresenca);
  if (canalSinais) supabaseClient.removeChannel(canalSinais);
});
