import { supabaseClient } from './supabase.js';

const STAFF_NIVEIS = new Set(['administrador', 'tecnologia']);
const HELPDESK_BUCKET = 'helpdesk_anexos';
const ANEXO_MAX_BYTES = 8 * 1024 * 1024; // 8MB

const CATEGORIA_LABEL = {
  'Hardware': 'Hardware',
  'Software': 'Software',
  'Rede/Internet': 'Rede/Internet',
  'Sistema Marquespan': 'Sistema Marquespan',
  'Acesso/Senha': 'Acesso/Senha',
  'Outro': 'Outro'
};
const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const PRIORIDADE_BADGE = { baixa: 'hd-badge-cinza', media: 'hd-badge-azul', alta: 'hd-badge-vermelho' };
const STATUS_LABEL = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído' };
const STATUS_BADGE = { aberto: 'hd-badge-laranja', em_andamento: 'hd-badge-azul', concluido: 'hd-badge-verde' };

// Lista de páginas do sistema, usada só como sugestão (datalist) no cadastro de vídeos —
// o admin também pode digitar qualquer outro nome de página livremente.
const PAGINAS_SISTEMA = [
  ['dashboard.html', 'Dashboard'], ['usuarios.html', 'Usuários'], ['permissoes.html', 'Permissões'],
  ['filiais.html', 'Filiais'], ['auditoria.html', 'Auditoria do Sistema'], ['acesso-remoto.html', 'Acesso Remoto'],
  ['abastecimento.html', 'Registrar Abastecimento'], ['cadastro-tanque.html', 'Cadastrar Tanque'],
  ['cadastro-bombas-bicos.html', 'Cadastrar Bombas/Bicos'], ['leituras-bomba.html', 'Leituras da Bomba'],
  ['relatorio-abastecimento.html', 'Relatório de Abastecimentos'], ['estoque-abastecimento.html', 'Estoque de Combustível'],
  ['veiculos.html', 'Cadastro de Veículos'], ['rotas.html', 'Cadastro de Rotas'], ['clientes.html', 'Cadastro de Clientes'],
  ['funcionario.html', 'Cadastro de Funcionário'], ['supervisor.html', 'Cadastro de Supervisor'],
  ['oficina.html', 'Cadastro de Oficina'], ['thermoking.html', 'Cadastro de Thermoking'],
  ['coletar-manutencao.html', 'Coletar Manutenção'], ['coletar-KM.html', 'Coletar KM'], ['engraxe.html', 'Controle de Engraxe'],
  ['lavagem.html', 'Controle de Lavagem'], ['revisao.html', 'Revisão'], ['incluir-manutencao.html', 'Incluir Manutenção'],
  ['buscar-manutencao.html', 'Relatório de Manutenção'], ['tacografo.html', 'Tacógrafo'],
  ['monitoramento.html', 'Manutenção - Real Time'], ['monitoramento-servicos.html', 'Serviços - Real Time'],
  ['monitoramento-retorno-rota.html', 'Retorno de Rota - Real Time'],
  ['monitoramento-abastecimento-interno.html', 'Abastecimento Interno - Real Time'],
  ['monitoramento-frota.html', 'Localização da Frota Real-Time'], ['pneu.html', 'Entrada de Pneu'],
  ['consumo-pneu.html', 'Consumo de Pneus'], ['saidas-pneus.html', 'Saida de Pneus'], ['estoque-pneus.html', 'Estoque de Pneus'],
  ['cadastro-carregamento.html', 'Requisição'], ['iniciar-carregamento.html', 'Iniciar Carregamento'],
  ['buscar-carregamento.html', 'Buscar Carregamento'], ['escala.html', 'Escala'], ['diaria.html', 'Diaria/Janta/PerNoite'],
  ['controle-cadeado.html', 'Controle de Cadeado'], ['controle-kit-higienizacao.html', 'Controle de Kit - Higienização'],
  ['controle-de-jornada.html', 'Controle de Jornada'], ['peso-rota.html', 'Peso de Rota'],
  ['relatorio-peso-rota.html', 'Relatorio de Peso de Rota'], ['retorno-rota.html', 'Retorno de Rota'],
  ['estoque_geral.html', 'Estoque Peças'], ['compras.html', 'Cotações e Cadastros'], ['hotel.html', 'Cadastro de Hotel'],
  ['despesas.html', 'Lançamento de Despesas'], ['relatorio-despesas.html', 'Relatório de Despesas'],
  ['pedagio.html', 'Gestão de Pedágios'], ['relatorio-pedagio.html', 'Relatório de Pedágios'],
  ['fiscalizacao-acompanhamento.html', 'Acompanhamento'], ['localizacao-veiculo.html', 'Localização de Veículos'],
  ['relatorio-localizacao.html', 'Relatório de Localização'], ['fiscalizacao-ocorrencia.html', 'Ocorrências'],
  ['portaria-controle-acesso.html', 'Controle de Acesso'], ['relatorio-acesso-portaria.html', 'Relatorio de Acessos'],
  ['monitoramento-portaria.html', 'Monitoramento Real-Time (Portaria)'], ['ordem-requisicao.html', 'Ordem de Requisição'],
  ['mapa.html', 'Mapa de Rotas'], ['roteirizar-rota.html', 'Roterizar Rota'], ['reserva_comodato.html', 'Reservar Comodato'],
  ['estoque_comodato.html', 'Estoque Comodato'], ['buscar_comodato.html', 'Buscar Comodato'],
  ['cadastro_comodato.html', 'Cadastro Comodato'], ['relatorio-estatistica.html', 'Estatística'],
  ['cadastro-produtos-camara-fria.html', 'Cadastro de Produtos (Camara Fria)'],
  ['estoque-camara-fria.html', 'Estoque Semanal (Camara Fria)'], ['contagem-camara-fria.html', 'Contagem (Camara Fria)'],
  ['carregamento-camara-fria.html', 'Carregamento (Camara Fria)'],
  ['relatorio-contagem-camara-fria.html', 'Relatorio de Contagem (Camara Fria)'],
  ['transferencias-camara-fria.html', 'Transferencias CDS']
];

function esc(s) {
  return s ? String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : '';
}

function usuarioAtual() {
  try { return JSON.parse(localStorage.getItem('usuarioLogado')) || null; } catch { return null; }
}

function nivelAtual() {
  return String(usuarioAtual()?.nivel || '').trim().toLowerCase();
}

function ehStaff() { return STAFF_NIVEIS.has(nivelAtual()); }
function ehAdministrador() { return nivelAtual() === 'administrador'; }

function fmtData(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

function sanitizarNomeArquivo(nome) {
  return String(nome || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function fmtTamanho(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Cache local dos chamados carregados (Meus Chamados + Gestão), usado pra baixar o
// anexo sem precisar consultar o Supabase de novo a cada clique.
let hdChamadosCache = {};
function cacheChamados(lista) {
  (lista || []).forEach(c => { hdChamadosCache[c.id] = c; });
}

// ── Abas ─────────────────────────────────────────────────────────────────
function hdSetTab(tab) {
  document.querySelectorAll('.hd-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.hd-tab-content').forEach(el => el.classList.remove('active'));
  const alvo = document.getElementById(`hd-tab-${tab}`);
  if (alvo) alvo.classList.add('active');
}
window.hdSetTab = hdSetTab;

// ── Abrir chamado ────────────────────────────────────────────────────────
async function enviarChamado(event) {
  event.preventDefault();
  const usuario = usuarioAtual();
  if (!usuario) { alert('Sessão inválida. Faça login novamente.'); return; }

  const categoria = document.getElementById('hd-categoria').value;
  const prioridade = document.getElementById('hd-prioridade').value;
  const assunto = document.getElementById('hd-assunto').value.trim();
  const descricao = document.getElementById('hd-descricao').value.trim();
  if (!assunto || !descricao) return;

  const arquivo = document.getElementById('hd-anexo')?.files?.[0] || null;
  if (arquivo && arquivo.size > ANEXO_MAX_BYTES) {
    alert('O anexo deve ter no máximo 8MB.');
    return;
  }

  const btn = event.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  let caminhoAnexo = null;
  try {
    const payload = {
      usuario_id: String(usuario.id),
      usuario_nome: usuario.nome || '',
      usuario_nivel: usuario.nivel || '',
      filial: usuario.filial || '',
      categoria, prioridade, assunto, descricao,
      status: 'aberto'
    };

    // Gera o id no cliente pra poder subir o anexo pra uma pasta própria ANTES de
    // inserir o chamado — assim não precisa de um update depois (a policy de update
    // é restrita ao Suporte, o próprio autor não poderia alterar o registro).
    if (arquivo) {
      const novoId = crypto.randomUUID();
      caminhoAnexo = `${novoId}/${Date.now()}-${sanitizarNomeArquivo(arquivo.name)}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(HELPDESK_BUCKET)
        .upload(caminhoAnexo, arquivo, { contentType: arquivo.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;

      payload.id = novoId;
      payload.anexo_path = caminhoAnexo;
      payload.anexo_nome = arquivo.name;
      payload.anexo_tipo = arquivo.type || null;
      payload.anexo_tamanho = arquivo.size || null;
    }

    const { error } = await supabaseClient.from('helpdesk_chamados').insert(payload);
    if (error) throw error;

    document.getElementById('hd-form-chamado').reset();
    document.getElementById('hd-prioridade').value = 'media';
    document.getElementById('hd-categoria').value = 'Sistema Marquespan';
    alert('✓ Chamado aberto com sucesso! O Setor de Tecnologia vai analisar em breve.');
    carregarMeusChamados();
    if (ehStaff()) carregarGestaoChamados();
  } catch (e) {
    console.error('[helpdesk][enviarChamado]', e);
    if (caminhoAnexo) {
      supabaseClient.storage.from(HELPDESK_BUCKET).remove([caminhoAnexo]).catch(() => {});
    }
    alert('Não foi possível abrir o chamado. Tente novamente em instantes.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Abrir Chamado'; }
  }
}

function renderChamadoCard(c, { comAcoes = false } = {}) {
  const catBadge = `<span class="hd-badge hd-badge-cinza">${esc(CATEGORIA_LABEL[c.categoria] || c.categoria)}</span>`;
  const prioBadge = `<span class="hd-badge ${PRIORIDADE_BADGE[c.prioridade] || 'hd-badge-cinza'}">${esc(PRIORIDADE_LABEL[c.prioridade] || c.prioridade)}</span>`;
  const statusBadge = `<span class="hd-badge ${STATUS_BADGE[c.status] || 'hd-badge-cinza'}">${esc(STATUS_LABEL[c.status] || c.status)}</span>`;
  const meta = comAcoes
    ? `${esc(c.usuario_nome)} · ${esc(c.filial || '—')} · ${fmtData(c.created_at)}`
    : fmtData(c.created_at);

  const resposta = c.resposta
    ? `<div class="hd-card-resposta"><b>Resposta do Suporte${c.respondido_por ? ' — ' + esc(c.respondido_por) : ''}:</b><br>${esc(c.resposta)}</div>`
    : '';

  const anexo = c.anexo_path
    ? `<div class="hd-card-anexo">
         <button type="button" class="btn-secondary" onclick="hdBaixarAnexo('${c.id}')">
           <i class="fas fa-paperclip"></i> Baixar anexo${c.anexo_nome ? ' — ' + esc(c.anexo_nome) : ''}${c.anexo_tamanho ? ' (' + fmtTamanho(c.anexo_tamanho) + ')' : ''}
         </button>
       </div>`
    : '';

  const acoes = comAcoes
    ? `<div class="hd-card-actions">
         <button type="button" class="btn-primary" onclick="hdAbrirRespostaModal('${c.id}')"><i class="fas fa-reply"></i> Responder</button>
       </div>`
    : '';

  return `<div class="hd-card" data-chamado-id="${esc(c.id)}">
    <div class="hd-card-head">
      <div>
        <div class="hd-card-title">${esc(c.assunto)}</div>
        <div class="hd-card-meta">${meta}</div>
      </div>
      <div class="hd-badges">${catBadge}${prioBadge}${statusBadge}</div>
    </div>
    <div class="hd-card-desc">${esc(c.descricao)}</div>
    ${anexo}
    ${resposta}
    ${acoes}
  </div>`;
}

async function hdBaixarAnexo(id) {
  const c = hdChamadosCache[id];
  if (!c || !c.anexo_path) return;
  try {
    const { data, error } = await supabaseClient.storage.from(HELPDESK_BUCKET).download(c.anexo_path);
    if (error) throw error;

    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = c.anexo_nome || c.anexo_path.split('/').pop() || 'anexo';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('[helpdesk][hdBaixarAnexo]', e);
    alert('Não foi possível baixar o anexo.');
  }
}
window.hdBaixarAnexo = hdBaixarAnexo;

async function carregarMeusChamados() {
  const usuario = usuarioAtual();
  const container = document.getElementById('hd-meus-chamados');
  if (!usuario || !container) return;

  try {
    const { data, error } = await supabaseClient
      .from('helpdesk_chamados')
      .select('*')
      .eq('usuario_id', String(usuario.id))
      .order('created_at', { ascending: false });
    if (error) throw error;

    cacheChamados(data);
    if (!data || !data.length) {
      container.innerHTML = '<p class="hd-vazio">Você ainda não abriu nenhum chamado.</p>';
      return;
    }
    container.innerHTML = data.map(c => renderChamadoCard(c)).join('');
  } catch (e) {
    console.error('[helpdesk][carregarMeusChamados]', e);
    container.innerHTML = '<p class="hd-vazio">Não foi possível carregar seus chamados.</p>';
  }
}

// ── Gestão de chamados (staff) ───────────────────────────────────────────
let hdChamadoRespondendoId = null;

async function carregarGestaoChamados() {
  const container = document.getElementById('hd-gestao-lista');
  if (!container) return;
  const statusFiltro = document.getElementById('hd-gestao-filtro-status')?.value || '';

  try {
    let query = supabaseClient.from('helpdesk_chamados').select('*').order('created_at', { ascending: false });
    if (statusFiltro) query = query.eq('status', statusFiltro);
    const { data, error } = await query;
    if (error) throw error;

    cacheChamados(data);
    if (!data || !data.length) {
      container.innerHTML = '<p class="hd-vazio">Nenhum chamado encontrado.</p>';
      return;
    }
    container.innerHTML = data.map(c => renderChamadoCard(c, { comAcoes: true })).join('');
  } catch (e) {
    console.error('[helpdesk][carregarGestaoChamados]', e);
    container.innerHTML = '<p class="hd-vazio">Não foi possível carregar os chamados.</p>';
  }
}

function hdAbrirRespostaModal(id) {
  hdChamadoRespondendoId = id;
  const card = document.querySelector(`.hd-card[data-chamado-id="${id}"]`);
  const titulo = card?.querySelector('.hd-card-title')?.textContent || '';
  document.getElementById('hd-resposta-sub').textContent = titulo;
  document.getElementById('hd-resposta-status').value = 'em_andamento';
  document.getElementById('hd-resposta-texto').value = '';
  document.getElementById('hd-resposta-overlay').classList.add('open');
}
window.hdAbrirRespostaModal = hdAbrirRespostaModal;

function hdCloseRespostaModal() {
  document.getElementById('hd-resposta-overlay').classList.remove('open');
  hdChamadoRespondendoId = null;
}
window.hdCloseRespostaModal = hdCloseRespostaModal;

async function hdSalvarRespostaChamado() {
  if (!hdChamadoRespondendoId) return;
  const usuario = usuarioAtual();
  const status = document.getElementById('hd-resposta-status').value;
  const resposta = document.getElementById('hd-resposta-texto').value.trim();

  try {
    const { error } = await supabaseClient.from('helpdesk_chamados').update({
      status,
      resposta: resposta || null,
      respondido_por: usuario?.nome || null,
      respondido_em: new Date().toISOString()
    }).eq('id', hdChamadoRespondendoId);
    if (error) throw error;

    hdCloseRespostaModal();
    carregarGestaoChamados();
  } catch (e) {
    console.error('[helpdesk][hdSalvarRespostaChamado]', e);
    alert('Não foi possível salvar a resposta.');
  }
}
window.hdSalvarRespostaChamado = hdSalvarRespostaChamado;

// ── Vídeos de ajuda ──────────────────────────────────────────────────────
function paraEmbedUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith('/embed/')) return url;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace('/', '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch { /* URL inválida — cai no fallback de link */ }
  return null;
}

function renderVideoCard(v) {
  const embed = paraEmbedUrl(v.url);
  const midia = embed
    ? `<div class="hd-video-embed"><iframe src="${esc(embed)}" allowfullscreen loading="lazy"></iframe></div>`
    : `<a class="hd-video-link" href="${esc(v.url)}" target="_blank" rel="noopener"><i class="fas fa-play-circle"></i> Assistir vídeo</a>`;

  const tags = [];
  if (v.categoria) tags.push(`<span class="hd-badge hd-badge-cinza">${esc(v.categoria)}</span>`);
  if (v.pagina_vinculada) tags.push(`<span class="hd-badge hd-badge-azul">${esc(v.pagina_vinculada)}</span>`);

  return `<div class="hd-video-card">
    ${midia}
    <div class="hd-video-body">
      <div class="hd-video-titulo">${esc(v.titulo)}</div>
      ${v.descricao ? `<div class="hd-video-desc">${esc(v.descricao)}</div>` : ''}
      ${tags.length ? `<div class="hd-video-tags">${tags.join('')}</div>` : ''}
    </div>
  </div>`;
}

async function carregarVideos() {
  const container = document.getElementById('hd-videos-grid');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('helpdesk_videos')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (!data || !data.length) {
      container.innerHTML = '<p class="hd-vazio">Nenhum vídeo disponível para o seu acesso no momento.</p>';
      return;
    }
    container.innerHTML = data.map(renderVideoCard).join('');
  } catch (e) {
    console.error('[helpdesk][carregarVideos]', e);
    container.innerHTML = '<p class="hd-vazio">Não foi possível carregar os vídeos.</p>';
  }
}

// ── Gerenciar vídeos (administrador) ─────────────────────────────────────
function preencherDatalistPaginas() {
  const datalist = document.getElementById('hd-paginas-list');
  if (!datalist) return;
  datalist.innerHTML = PAGINAS_SISTEMA.map(([arquivo, label]) => `<option value="${esc(arquivo)}">${esc(label)}</option>`).join('');
}

function limparFormVideo() {
  document.getElementById('hd-form-video').reset();
  document.getElementById('hd-video-editing-id').value = '';
  document.getElementById('hd-video-ativo').checked = true;
  document.getElementById('hd-video-form-title').innerHTML = '<i class="fas fa-plus-circle"></i> Novo Vídeo de Ajuda';
  document.getElementById('hd-video-cancelar-edicao').style.display = 'none';
}

function hdCancelarEdicaoVideo() { limparFormVideo(); }
window.hdCancelarEdicaoVideo = hdCancelarEdicaoVideo;

async function salvarVideo(event) {
  event.preventDefault();
  const usuario = usuarioAtual();
  const id = document.getElementById('hd-video-editing-id').value || null;
  const payload = {
    titulo: document.getElementById('hd-video-titulo').value.trim(),
    descricao: document.getElementById('hd-video-descricao').value.trim() || null,
    url: document.getElementById('hd-video-url').value.trim(),
    pagina_vinculada: document.getElementById('hd-video-pagina').value.trim() || null,
    categoria: document.getElementById('hd-video-categoria').value.trim() || null,
    ativo: document.getElementById('hd-video-ativo').checked
  };
  if (!payload.titulo || !payload.url) return;

  try {
    if (id) {
      const { error } = await supabaseClient.from('helpdesk_videos').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      payload.criado_por = usuario?.nome || null;
      const { error } = await supabaseClient.from('helpdesk_videos').insert(payload);
      if (error) throw error;
    }
    limparFormVideo();
    carregarVideosAdmin();
    carregarVideos();
  } catch (e) {
    console.error('[helpdesk][salvarVideo]', e);
    alert('Não foi possível salvar o vídeo.');
  }
}

function hdEditarVideo(id, video) {
  document.getElementById('hd-video-editing-id').value = id;
  document.getElementById('hd-video-titulo').value = video.titulo || '';
  document.getElementById('hd-video-descricao').value = video.descricao || '';
  document.getElementById('hd-video-url').value = video.url || '';
  document.getElementById('hd-video-pagina').value = video.pagina_vinculada || '';
  document.getElementById('hd-video-categoria').value = video.categoria || '';
  document.getElementById('hd-video-ativo').checked = !!video.ativo;
  document.getElementById('hd-video-form-title').innerHTML = '<i class="fas fa-edit"></i> Editar Vídeo de Ajuda';
  document.getElementById('hd-video-cancelar-edicao').style.display = '';
  document.getElementById('hd-tab-videos-admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function hdExcluirVideo(id) {
  if (!confirm('Remover este vídeo de ajuda?')) return;
  try {
    const { error } = await supabaseClient.from('helpdesk_videos').delete().eq('id', id);
    if (error) throw error;
    carregarVideosAdmin();
    carregarVideos();
  } catch (e) {
    console.error('[helpdesk][hdExcluirVideo]', e);
    alert('Não foi possível remover o vídeo.');
  }
}

let hdVideosAdminCache = {};

async function carregarVideosAdmin() {
  const container = document.getElementById('hd-videos-admin-lista');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('helpdesk_videos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    hdVideosAdminCache = {};
    (data || []).forEach(v => { hdVideosAdminCache[v.id] = v; });

    if (!data || !data.length) {
      container.innerHTML = '<p class="hd-vazio">Nenhum vídeo cadastrado ainda.</p>';
      return;
    }
    container.innerHTML = data.map(v => `
      <div class="hd-video-admin-row">
        <div class="hd-video-admin-info">
          <b>${esc(v.titulo)}</b> ${v.ativo ? '' : '<span class="hd-badge hd-badge-cinza">Inativo</span>'}
          <div>${v.pagina_vinculada ? 'Página: ' + esc(v.pagina_vinculada) : 'Visível para todos'}${v.categoria ? ' · ' + esc(v.categoria) : ''}</div>
        </div>
        <div class="hd-video-admin-actions">
          <button type="button" class="btn-secondary" onclick="hdEditarVideoPorId('${v.id}')"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn-danger" onclick="hdExcluirVideoPorId('${v.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('[helpdesk][carregarVideosAdmin]', e);
    container.innerHTML = '<p class="hd-vazio">Não foi possível carregar os vídeos.</p>';
  }
}

window.hdEditarVideoPorId = (id) => { const v = hdVideosAdminCache[id]; if (v) hdEditarVideo(id, v); };
window.hdExcluirVideoPorId = (id) => hdExcluirVideo(id);

// ── Inicialização ────────────────────────────────────────────────────────
function init() {
  document.getElementById('hd-form-chamado')?.addEventListener('submit', enviarChamado);
  carregarMeusChamados();
  carregarVideos();

  if (ehStaff()) {
    document.querySelectorAll('.hd-staff-only').forEach(el => { el.style.display = ''; });
    carregarGestaoChamados();
    document.getElementById('hd-gestao-filtro-status')?.addEventListener('change', carregarGestaoChamados);
  }

  if (ehAdministrador()) {
    document.querySelectorAll('.hd-admin-only').forEach(el => { el.style.display = ''; });
    preencherDatalistPaginas();
    document.getElementById('hd-form-video')?.addEventListener('submit', salvarVideo);
    carregarVideosAdmin();
  }
}

document.addEventListener('DOMContentLoaded', init);
