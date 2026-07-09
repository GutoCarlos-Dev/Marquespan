import { supabaseClient } from './supabase.js';

const SIGNAL_CHANNEL = 'sinais_admin';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let sessaoAtual = null;
const conversasMensagem = new Map();

export function iniciarAgenteAcessoRemoto({ usuario, canalSinais }) {
  if (!usuario?.id || !canalSinais || window.__remoteSupportAgentStarted) return;
  window.__remoteSupportAgentStarted = true;

  canalSinais
    .on('broadcast', { event: 'remote_request' }, ({ payload }) => receberSolicitacao(usuario, canalSinais, payload))
    .on('broadcast', { event: 'remote_answer' }, ({ payload }) => receberRespostaAdmin(payload))
    .on('broadcast', { event: 'remote_ice' }, ({ payload }) => receberIce(payload))
    .on('broadcast', { event: 'remote_stop' }, ({ payload }) => encerrarSeSessao(payload?.session_id, true))
    .on('broadcast', { event: 'remote_control' }, ({ payload }) => executarControle(payload))
    .on('broadcast', { event: 'remote_message' }, ({ payload }) => receberMensagem(usuario, canalSinais, payload));
}

async function receberSolicitacao(usuario, canalSinais, payload) {
  if (String(payload?.target_user_id) !== String(usuario.id)) return;
  if (sessaoAtual) {
    await enviarSinal(canalSinais, 'remote_response', {
      session_id: payload.session_id,
      admin_id: payload.admin_id,
      target_user_id: usuario.id,
      accepted: false,
      reason: 'Usuario ja esta em uma sessao remota.'
    });
    return;
  }

  const admin = await buscarAdmin(payload.admin_id);
  if (!admin) {
    console.warn('Solicitacao de acesso remoto ignorada: solicitante nao e administrador.');
    return;
  }

  const modoControle = payload.mode === 'control';
  const aprovado = !modoControle || window.confirm(
    `${admin.nome || payload.admin_nome || 'Administrador'} esta solicitando permissao para visualizar e controlar esta pagina.\n\n` +
    'Aceite somente se voce solicitou suporte agora. Voce podera encerrar a sessao a qualquer momento.'
  );

  if (!aprovado) {
    await enviarSinal(canalSinais, 'remote_response', {
      session_id: payload.session_id,
      admin_id: payload.admin_id,
      target_user_id: usuario.id,
      target_nome: usuario.nome || 'Usuario',
      accepted: false,
      reason: 'Usuario recusou a solicitacao.'
    });
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 24, max: 30 },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    sessaoAtual = {
      sessionId: payload.session_id,
      adminId: String(payload.admin_id),
      targetUserId: String(usuario.id),
      targetNome: usuario.nome || 'Usuario',
      mode: payload.mode === 'control' ? 'control' : 'view',
      canalSinais,
      stream,
      peer: criarPeer(canalSinais, payload.session_id, payload.admin_id, usuario.id)
    };

    sessaoAtual.controlChannel = sessaoAtual.peer.createDataChannel('remote-control', {
      ordered: false,
      maxRetransmits: 0
    });
    configurarCanalControle(sessaoAtual.controlChannel);

    stream.getTracks().forEach(track => {
      if ('contentHint' in track) track.contentHint = 'detail';
      track.addEventListener('ended', () => encerrarSessao(false));
      sessaoAtual.peer.addTrack(track, stream);
    });

    mostrarBarraSessao(admin.nome || payload.admin_nome || 'Administrador', sessaoAtual.mode);

    await enviarSinal(canalSinais, 'remote_response', {
      session_id: payload.session_id,
      admin_id: payload.admin_id,
      target_user_id: usuario.id,
      target_nome: usuario.nome || 'Usuario',
      accepted: true,
      mode: sessaoAtual.mode
    });

    const offer = await sessaoAtual.peer.createOffer();
    await sessaoAtual.peer.setLocalDescription(offer);
    await enviarSinal(canalSinais, 'remote_offer', {
      session_id: payload.session_id,
      admin_id: payload.admin_id,
      target_user_id: usuario.id,
      sdp: offer
    });
  } catch (error) {
    await enviarSinal(canalSinais, 'remote_response', {
      session_id: payload.session_id,
      admin_id: payload.admin_id,
      target_user_id: usuario.id,
      target_nome: usuario.nome || 'Usuario',
      accepted: false,
      reason: error?.message || 'Nao foi possivel iniciar o compartilhamento.'
    });
    limparSessao();
  }
}

async function buscarAdmin(adminId) {
  if (!adminId) return null;
  const { data, error } = await supabaseClient
    .from('usuarios')
    .select('id, nome, nomecompleto, nivel')
    .eq('id', adminId)
    .single();

  if (error || String(data?.nivel || '').toLowerCase() !== 'administrador') return null;
  return {
    ...data,
    nome: data.nomecompleto || data.nome
  };
}

function criarPeer(canalSinais, sessionId, adminId, targetUserId) {
  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peer.onicecandidate = event => {
    if (!event.candidate) return;
    enviarSinal(canalSinais, 'remote_ice', {
      session_id: sessionId,
      admin_id: adminId,
      target_user_id: targetUserId,
      from: 'target',
      candidate: event.candidate
    });
  };
  peer.onconnectionstatechange = () => {
    if (['closed', 'failed', 'disconnected'].includes(peer.connectionState)) {
      encerrarSessao(false);
    }
  };
  return peer;
}

async function receberRespostaAdmin(payload) {
  if (!sessaoAtual || payload?.session_id !== sessaoAtual.sessionId || !payload?.sdp) return;
  await sessaoAtual.peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
}

async function receberIce(payload) {
  if (!sessaoAtual || payload?.session_id !== sessaoAtual.sessionId || payload?.from !== 'admin' || !payload?.candidate) return;
  try {
    await sessaoAtual.peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
  } catch (error) {
    console.warn('Falha ao adicionar ICE remoto:', error);
  }
}

function executarControle(payload) {
  if (!sessaoAtual || payload?.session_id !== sessaoAtual.sessionId || sessaoAtual.mode !== 'control') return;
  if (!['move', 'click'].includes(payload.type)) return;

  const x = Math.round(Number(payload.xRatio || 0) * window.innerWidth);
  const y = Math.round(Number(payload.yRatio || 0) * window.innerHeight);
  mostrarPonteiroRemoto(x, y);
  if (payload.type === 'move') return;

  const el = document.elementFromPoint(x, y);
  if (!el) return;

  const clicavel = el.closest('button, a, input, select, textarea, label, [role="button"], [onclick]') || el;
  if (typeof clicavel.focus === 'function') clicavel.focus();
  if (typeof clicavel.click === 'function') clicavel.click();
}

function configurarCanalControle(channel) {
  channel.onmessage = event => {
    try {
      executarControle(JSON.parse(event.data));
    } catch (error) {
      console.warn('Comando remoto invalido:', error);
    }
  };
}

async function receberMensagem(usuario, canalSinais, payload) {
  if (String(payload?.target_user_id) !== String(usuario.id)) return;
  const mensagem = String(payload?.message || '').trim();
  if (!mensagem) return;

  const adminId = String(payload.admin_id || '');
  adicionarMensagemConversa(adminId, {
    from: 'admin',
    nome: payload.admin_nome || 'Administrador',
    message: mensagem,
    timestamp: payload.sent_at || new Date().toISOString()
  });
  mostrarPopupMensagem(usuario, canalSinais, payload.admin_id, payload.admin_nome || 'Administrador');
  await enviarSinal(canalSinais, 'remote_message_received', {
    target_user_id: usuario.id,
    target_nome: usuario.nome || 'Usuario',
    admin_id: payload.admin_id,
    sent_at: payload.sent_at,
    received_at: new Date().toISOString()
  });
}

function mostrarPopupMensagem(usuario, canalSinais, adminId, adminNome) {
  const conversaId = String(adminId || '');
  let overlay = document.querySelector(`.remoteSupportMessageOverlay[data-admin-id="${cssEscape(conversaId)}"]`);
  if (overlay) {
    renderPopupHistorico(overlay, conversaId);
    overlay.querySelector('.remoteSupportReplyText')?.focus();
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'remoteSupportMessageOverlay';
  overlay.dataset.adminId = conversaId;
  overlay.innerHTML = `
    <div class="remoteSupportMessageBox">
      <div class="remoteSupportMessageHeader">
        <strong>Chat com suporte</strong>
        <button type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="remoteSupportMessageSender">${escapeHtml(adminNome)}</div>
      <div class="remoteSupportMessageHistory"></div>
      <textarea class="remoteSupportReplyText" maxlength="800" rows="3" placeholder="Digite sua resposta..."></textarea>
      <div class="remoteSupportMessageFooter">
        <button type="button" class="remoteSupportCloseBtn">Fechar</button>
        <button type="button" class="remoteSupportSendBtn">Responder</button>
      </div>
    </div>
  `;

  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(15,23,42,0.42)',
    padding: '18px'
  });

  const box = overlay.querySelector('.remoteSupportMessageBox');
  Object.assign(box.style, {
    width: 'min(460px, 100%)',
    borderRadius: '10px',
    background: '#fff',
    boxShadow: '0 18px 46px rgba(0,0,0,0.28)',
    fontFamily: 'Arial, sans-serif',
    overflow: 'hidden'
  });

  const header = overlay.querySelector('.remoteSupportMessageHeader');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    background: '#006937',
    color: '#fff'
  });

  const close = header.querySelector('button');
  Object.assign(close.style, {
    border: '0',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '24px',
    lineHeight: '1'
  });

  const sender = overlay.querySelector('.remoteSupportMessageSender');
  Object.assign(sender.style, {
    padding: '12px 16px 0',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: '700'
  });

  const history = overlay.querySelector('.remoteSupportMessageHistory');
  Object.assign(history.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    height: '230px',
    overflow: 'auto',
    margin: '12px 16px',
    padding: '10px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    background: '#f8fafc'
  });

  const textarea = overlay.querySelector('.remoteSupportReplyText');
  Object.assign(textarea.style, {
    boxSizing: 'border-box',
    width: 'calc(100% - 32px)',
    margin: '0 16px 12px',
    minHeight: '76px',
    padding: '10px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    resize: 'vertical',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px'
  });

  const footer = overlay.querySelector('.remoteSupportMessageFooter');
  Object.assign(footer.style, {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    padding: '12px 16px',
    background: '#f8fafc',
    borderTop: '1px solid #e5e7eb'
  });

  const botoes = footer.querySelectorAll('button');
  botoes.forEach(botao => Object.assign(botao.style, {
    border: '0',
    borderRadius: '7px',
    padding: '9px 18px',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '700'
  }));
  footer.querySelector('.remoteSupportCloseBtn').style.background = '#64748b';
  footer.querySelector('.remoteSupportSendBtn').style.background = '#006937';

  const fechar = () => overlay.remove();
  close.addEventListener('click', fechar);
  footer.querySelector('.remoteSupportCloseBtn').addEventListener('click', fechar);
  footer.querySelector('.remoteSupportSendBtn').addEventListener('click', () => enviarRespostaChat(usuario, canalSinais, adminId, adminNome, overlay));
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      enviarRespostaChat(usuario, canalSinais, adminId, adminNome, overlay);
    }
  });
  document.body.appendChild(overlay);
  renderPopupHistorico(overlay, conversaId);
  textarea.focus();
}

async function enviarRespostaChat(usuario, canalSinais, adminId, adminNome, overlay) {
  const textarea = overlay.querySelector('.remoteSupportReplyText');
  const mensagem = String(textarea.value || '').trim();
  if (!mensagem) return;

  const sentAt = new Date().toISOString();
  adicionarMensagemConversa(String(adminId || ''), {
    from: 'user',
    nome: usuario.nome || 'Usuario',
    message: mensagem,
    timestamp: sentAt
  });
  renderPopupHistorico(overlay, String(adminId || ''));
  textarea.value = '';
  textarea.focus();

  await enviarSinal(canalSinais, 'remote_message_reply', {
    admin_id: adminId,
    admin_nome: adminNome,
    target_user_id: usuario.id,
    target_nome: usuario.nome || 'Usuario',
    message: mensagem,
    sent_at: sentAt
  });
}

function adicionarMensagemConversa(adminId, mensagem) {
  if (!conversasMensagem.has(adminId)) conversasMensagem.set(adminId, []);
  conversasMensagem.get(adminId).push(mensagem);
}

function renderPopupHistorico(overlay, adminId) {
  const history = overlay.querySelector('.remoteSupportMessageHistory');
  const mensagens = conversasMensagem.get(adminId) || [];
  history.innerHTML = mensagens.map(item => {
    const isAdmin = item.from === 'admin';
    return `
      <div style="
        align-self:${isAdmin ? 'flex-start' : 'flex-end'};
        max-width:82%;
        padding:9px 11px;
        border-radius:8px;
        background:${isAdmin ? '#e0f2fe' : '#dcfce7'};
        color:${isAdmin ? '#0c4a6e' : '#14532d'};
        font-size:14px;
        line-height:1.35;
        white-space:pre-wrap;">
        <small style="display:block;margin-bottom:3px;opacity:.75;font-weight:700;">${escapeHtml(item.nome)} - ${escapeHtml(formatarHora(item.timestamp))}</small>
        ${escapeHtml(item.message)}
      </div>
    `;
  }).join('');
  history.scrollTop = history.scrollHeight;
}

function mostrarBarraSessao(adminNome, mode) {
  removerBarraSessao();
  const barra = document.createElement('div');
  barra.id = 'remoteSupportActiveBar';
  barra.innerHTML = `
    <span><strong>Suporte remoto ativo:</strong> ${escapeHtml(adminNome)} ${mode === 'control' ? 'pode visualizar e controlar esta pagina' : 'pode visualizar sua tela'}.</span>
    <button type="button">Encerrar</button>
  `;
  Object.assign(barra.style, {
    position: 'fixed',
    left: '12px',
    right: '12px',
    bottom: '12px',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: '8px',
    background: '#7f1d1d',
    color: '#fff',
    boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px'
  });
  const button = barra.querySelector('button');
  Object.assign(button.style, {
    border: '0',
    borderRadius: '6px',
    padding: '8px 12px',
    background: '#fff',
    color: '#7f1d1d',
    cursor: 'pointer',
    fontWeight: '700'
  });
  button.addEventListener('click', () => encerrarSessao(true));
  document.body.appendChild(barra);
}

function mostrarPonteiroRemoto(x, y) {
  let pointer = document.getElementById('remoteSupportPointer');
  if (!pointer) {
    pointer = document.createElement('div');
    pointer.id = 'remoteSupportPointer';
    Object.assign(pointer.style, {
      position: 'fixed',
      zIndex: '2147483646',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      border: '2px solid #dc2626',
      background: 'rgba(220,38,38,0.18)',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%)'
    });
    document.body.appendChild(pointer);
  }
  pointer.style.left = `${x}px`;
  pointer.style.top = `${y}px`;
  clearTimeout(pointer._timer);
  pointer._timer = setTimeout(() => pointer.remove(), 900);
}

async function encerrarSessao(notificarAdmin) {
  if (!sessaoAtual) return;
  const { canalSinais, sessionId, adminId, targetUserId, targetNome } = sessaoAtual;
  if (notificarAdmin) {
    await enviarSinal(canalSinais, 'remote_stop', {
      session_id: sessionId,
      admin_id: adminId,
      target_user_id: targetUserId,
      target_nome: targetNome,
      from: 'target'
    });
  }
  limparSessao();
}

function encerrarSeSessao(sessionId, silencioso = false) {
  if (!sessaoAtual || sessaoAtual.sessionId !== sessionId) return;
  if (!silencioso) encerrarSessao(false);
  limparSessao();
}

function limparSessao() {
  if (sessaoAtual?.stream) {
    sessaoAtual.stream.getTracks().forEach(track => track.stop());
  }
  if (sessaoAtual?.peer) {
    sessaoAtual.peer.close();
  }
  sessaoAtual = null;
  removerBarraSessao();
}

function removerBarraSessao() {
  document.getElementById('remoteSupportActiveBar')?.remove();
  document.getElementById('remoteSupportPointer')?.remove();
}

async function enviarSinal(canal, event, payload) {
  return canal.send({ type: 'broadcast', event, payload });
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

function formatarHora(value) {
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return '--:--';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

window.addEventListener('beforeunload', () => {
  if (sessaoAtual) limparSessao();
});
