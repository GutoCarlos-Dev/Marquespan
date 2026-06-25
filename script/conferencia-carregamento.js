import { supabaseClient } from './supabase.js';

// ── Tabelas ──────────────────────────────────────────────────────────────────
const REQUISICOES_TABLE  = 'requisicoes_carregamento';
const CARREGAMENTOS_TABLE = 'saidas_carregamento';
const CONFERENCIAS_TABLE  = 'conferencias_carregamento';

// ── Constantes de motivo ─────────────────────────────────────────────────────
const MOTIVOS_SO_RETORNO = ['Retirada Total', 'Retirada Parcial', 'Retirada de Empréstimo'];
const MOTIVOS_SO_ENTREGA = ['Aumento', 'Cliente Novo'];
const ITENS_ESPECIAIS_NOMES = ['ESTEIRA', 'FORMA'];

// ── Estado ───────────────────────────────────────────────────────────────────
let conferenciaAtiva       = null;
let conferenciaIndex       = 0;
let conferenciaResultados  = {};
let conferenciaEmModoApp   = false;
let carregamentosSalvos    = [];
let requisicoesSalvas      = [];

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatarData(value) {
  if (!value) return '-';
  const m = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}

function obterUsuarioAtualNome() {
  try {
    const u = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    return u?.nome || u?.nome_completo || u?.email || 'Sistema';
  } catch { return 'Sistema'; }
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isItemEspecial(nomeItem) {
  const n = normalizarTexto(nomeItem);
  return ITENS_ESPECIAIS_NOMES.some(e => n.includes(e));
}

function direcionarItemCarregamento(item, motivoRequisicao = '', temRetornoObservacao = false) {
  if (item.de_observacao) return 'retorno';
  const motiNorm = normalizarTexto(motivoRequisicao);
  if (MOTIVOS_SO_RETORNO.some(m => normalizarTexto(m) === motiNorm)) return 'retorno';
  if (MOTIVOS_SO_ENTREGA.some(m => normalizarTexto(m) === motiNorm)) return 'entrega';
  const mod    = normalizarTexto(item.modelo || '');
  const obsDir = normalizarTexto(item.obs    || '');
  if (mod === 'TROCA'   || obsDir === 'TROCA')   return 'troca';
  if (mod === 'AUMENTO' || obsDir === 'AUMENTO') return 'entrega';
  if (motiNorm === 'TROCA' && temRetornoObservacao) return 'entrega';
  if (!mod && !obsDir && motiNorm === 'TROCA') return 'troca';
  if (item.novo)  return 'entrega';
  if (item.usado) return 'retorno';
  return 'entrega';
}

// ── Carregamento de dados ─────────────────────────────────────────────────────
async function carregarDados() {
  const [{ data: cars }, { data: reqs }] = await Promise.all([
    supabaseClient.from(CARREGAMENTOS_TABLE).select('*').order('data_saida', { ascending: false }).limit(100),
    supabaseClient.from(REQUISICOES_TABLE).select('id, status, carregamento_id').order('created_at', { ascending: false }).limit(500)
  ]);
  carregamentosSalvos = cars || [];
  requisicoesSalvas   = reqs || [];
}

// ── Inicialização de resultados ───────────────────────────────────────────────
function inicializarResultadosConferencia(requisicoes) {
  conferenciaResultados = {};
  requisicoes.forEach(req => {
    conferenciaResultados[req.id] = (req.itens || []).map(() => ({
      status: null, obs: '', wasAutoSet: false,
      qtdReal: null, modeloReal: null, estadoReal: null, obsReal: null, autoObs: ''
    }));
  });
}

// ── Auto-obs ─────────────────────────────────────────────────────────────────
function calcularAutoObs(item, res) {
  const partes = [];
  if (res.qtdReal !== null && res.qtdReal !== undefined) {
    const orig = Number(item.quantidade) || 0;
    const novo = Number(res.qtdReal) || 0;
    if (orig !== novo) partes.push(`Qtd: ${orig} → ${novo}`);
  }
  if (res.modeloReal !== null && res.modeloReal !== undefined) {
    const orig = (item.modelo || '').trim();
    const novo = String(res.modeloReal || '').trim();
    if (orig !== novo) partes.push(`Modelo: "${orig || '-'}" → "${novo || '-'}"`);
  }
  if (res.estadoReal !== null && res.estadoReal !== undefined) {
    const orig = item.novo ? 'NOVO' : item.usado ? 'USADO' : '-';
    const novoLabel = res.estadoReal === 'novo' ? 'NOVO' : res.estadoReal === 'usado' ? 'USADO' : '-';
    if (orig !== novoLabel) partes.push(`Estado: ${orig} → ${novoLabel}`);
  }
  if (res.obsReal !== null && res.obsReal !== undefined) {
    const orig = (item.obs || '').trim();
    const novo = String(res.obsReal || '').trim();
    if (orig !== novo) partes.push(`OBS: "${orig || '-'}" → "${novo || '-'}"`);
  }
  return partes.join(' | ');
}

// ── Progresso ─────────────────────────────────────────────────────────────────
function calcularTotaisConferencia() {
  if (!conferenciaAtiva) return { totalItens: 0, confirmados: 0, okCount: 0, divCount: 0 };
  let totalItens = 0, confirmados = 0, okCount = 0, divCount = 0;
  conferenciaAtiva.requisicoes.forEach(req => {
    const resultados = conferenciaResultados[req.id] || [];
    (req.itens || []).forEach((_, idx) => {
      totalItens++;
      const r = resultados[idx];
      if (r?.status === 'ok')          { confirmados++; okCount++; }
      else if (r?.status === 'divergencia') { confirmados++; divCount++; }
    });
  });
  return { totalItens, confirmados, okCount, divCount };
}

function atualizarProgressoConferencia() {
  const { totalItens, confirmados } = calcularTotaisConferencia();
  const pct = totalItens > 0 ? Math.round(confirmados / totalItens * 100) : 0;
  const el  = document.getElementById('cvProgressoItens');
  const bar = document.getElementById('cvBarraProgresso');
  if (el)  el.textContent  = `${confirmados} de ${totalItens} itens confirmados (${pct}%)`;
  if (bar) bar.style.width = `${pct}%`;
}

// ── Edição de campo em tempo real ─────────────────────────────────────────────
function onCampoEditadoConferencia(reqId, itemIdx, campo, valor, item) {
  if (!conferenciaResultados[reqId]) conferenciaResultados[reqId] = [];
  if (!conferenciaResultados[reqId][itemIdx]) {
    conferenciaResultados[reqId][itemIdx] = {
      status: null, obs: '', wasAutoSet: false,
      qtdReal: null, modeloReal: null, estadoReal: null, obsReal: null, autoObs: ''
    };
  }
  const res = conferenciaResultados[reqId][itemIdx];
  res[campo] = valor;
  const autoObs = calcularAutoObs(item, res);
  res.autoObs = autoObs;
  if (autoObs) {
    res.status = 'divergencia'; res.wasAutoSet = true;
  } else if (res.wasAutoSet && !res.obs?.trim()) {
    res.status = null; res.wasAutoSet = false;
  }

  const row = document.querySelector(`[data-cv-item-idx="${itemIdx}"]`);
  if (row) {
    row.classList.toggle('cv-row-ok',  res.status === 'ok');
    row.classList.toggle('cv-row-div', res.status === 'divergencia');
    row.querySelector('[data-cv-ok]')?.classList.toggle('ativo',  res.status === 'ok');
    row.querySelector('[data-cv-div]')?.classList.toggle('ativo', res.status === 'divergencia');
    const badge = row.querySelector('.cv-app-item-status');
    if (badge) {
      badge.className  = `cv-app-item-status ${res.status === 'ok' ? 'cv-status-ok' : res.status === 'divergencia' ? 'cv-status-div' : ''}`;
      badge.textContent = res.status === 'ok' ? '✓ OK' : res.status === 'divergencia' ? '⚠ Div.' : '';
    }
    let divDetail = row.querySelector('.cv-app-div-detail');
    if (res.status === 'divergencia') {
      if (!divDetail) { divDetail = document.createElement('div'); divDetail.className = 'cv-app-div-detail'; row.appendChild(divDetail); }
      divDetail.innerHTML = `
        ${res.autoObs ? `<div class="cv-auto-obs-info"><i class="fas fa-sync-alt"></i> Modificado: ${escapeHtml(res.autoObs)}</div>` : ''}
        <input type="text" class="glass-input cv-obs-input" placeholder="Descreva o motivo da divergência..."
          value="${escapeHtml(res.obs || '')}" data-cv-obs="${itemIdx}">`;
      divDetail.querySelector('[data-cv-obs]')?.addEventListener('input', e => {
        if (conferenciaResultados[reqId]?.[itemIdx]) conferenciaResultados[reqId][itemIdx].obs = e.target.value;
      });
    } else { divDetail?.remove(); }
  }
  atualizarProgressoConferencia();
}

// ── Renderização do card ──────────────────────────────────────────────────────
function renderizarConferenciaAtual() {
  if (!conferenciaAtiva) return;
  const reqs = conferenciaAtiva.requisicoes;
  const req  = reqs[conferenciaIndex];
  if (!req) return;

  const { totalItens, confirmados } = calcularTotaisConferencia();
  const pct = totalItens > 0 ? Math.round(confirmados / totalItens * 100) : 0;
  document.getElementById('cvProgressoTexto').textContent = `Requisição ${conferenciaIndex + 1} de ${reqs.length}`;
  document.getElementById('cvProgressoItens').textContent = `${confirmados} de ${totalItens} itens confirmados (${pct}%)`;
  document.getElementById('cvBarraProgresso').style.width = `${pct}%`;
  document.getElementById('cvReqNumero').textContent      = conferenciaIndex + 1;

  const btnAnt = document.getElementById('btnCvAnterior');
  const btnPro = document.getElementById('btnCvProxima');
  if (btnAnt) btnAnt.disabled = conferenciaIndex === 0;
  if (btnPro) {
    const isUltimo = conferenciaIndex === reqs.length - 1;
    btnPro.innerHTML = isUltimo
      ? '<i class="fas fa-flag-checkered"></i> Finalizar'
      : 'Próxima <i class="fas fa-chevron-right"></i>';
    btnPro.className = `btn-glass cv-nav-btn ${isUltimo ? 'btn-green' : 'btn-blue'}`;
  }

  const itens      = req.itens || [];
  const resultados = conferenciaResultados[req.id] || [];
  const itensOkCount  = resultados.filter(r => r?.status === 'ok').length;
  const itensDivCount = resultados.filter(r => r?.status === 'divergencia').length;

  const card = document.getElementById('cvRequisicaoCard');
  if (!card) return;

  const cabecalhoCard = `
    <div class="cv-card-header">
      <div class="cv-card-meta">
        <span class="cv-meta-item"><i class="fas fa-user-tie"></i> ${escapeHtml(req.supervisor || '-')}</span>
        <span class="cv-meta-item"><i class="fas fa-store"></i> ${escapeHtml(req.cliente_nome || '-')}</span>
        <span class="cv-meta-item"><i class="fas fa-tag"></i> ${escapeHtml(req.motivo || '-')}</span>
      </div>
      <div class="cv-card-status-bar">
        <span class="cv-badge-ok"><i class="fas fa-check"></i> ${itensOkCount} OK</span>
        ${itensDivCount > 0 ? `<span class="cv-badge-div"><i class="fas fa-exclamation-triangle"></i> ${itensDivCount} Div.</span>` : ''}
        <button type="button" class="btn-glass btn-sm btn-green cv-btn-todos-ok" data-cv-todos-ok>
          <i class="fas fa-check-double"></i> Todos OK
        </button>
      </div>
    </div>`;

  if (conferenciaEmModoApp) {
    card.innerHTML = cabecalhoCard + `
      <div class="cv-items-app">
        ${itens.map((item, idx) => {
          const res = resultados[idx] || {};
          const rowCls     = res.status === 'ok' ? 'cv-row-ok' : res.status === 'divergencia' ? 'cv-row-div' : '';
          const estadoOrig = item.novo ? 'novo' : item.usado ? 'usado' : '';
          const qtdVal  = res.qtdReal    !== null && res.qtdReal    !== undefined ? res.qtdReal    : (item.quantidade || '');
          const modVal  = res.modeloReal !== null && res.modeloReal !== undefined ? res.modeloReal : (item.modelo    || '');
          const estVal  = res.estadoReal !== null && res.estadoReal !== undefined ? res.estadoReal : estadoOrig;
          const obsVal  = res.obsReal    !== null && res.obsReal    !== undefined ? res.obsReal    : (item.obs       || '');
          return `
            <div class="cv-app-item ${rowCls}" data-cv-item-idx="${idx}">
              <div class="cv-app-item-top">
                <div class="cv-app-item-equip">
                  <span class="cv-app-qtd-orig">${escapeHtml(String(item.quantidade || ''))}</span>
                  <span class="cv-app-item-nome">${escapeHtml(item.item_nome || item.equipamento || '-')}</span>
                  <span class="cv-app-item-status ${res.status === 'ok' ? 'cv-status-ok' : res.status === 'divergencia' ? 'cv-status-div' : ''}">
                    ${res.status === 'ok' ? '✓ OK' : res.status === 'divergencia' ? '⚠ Div.' : ''}
                  </span>
                </div>
                <div class="cv-status-btns">
                  <button type="button" class="btn-cv-ok${res.status === 'ok' ? ' ativo' : ''}" data-cv-ok="${idx}"><i class="fas fa-check"></i> OK</button>
                  <button type="button" class="btn-cv-div${res.status === 'divergencia' ? ' ativo' : ''}" data-cv-div="${idx}"><i class="fas fa-exclamation-triangle"></i> Div.</button>
                </div>
              </div>
              <div class="cv-app-item-fields">
                <div class="cv-app-field cv-app-field-qtd">
                  <label>Qtd</label>
                  <input type="number" class="glass-input" value="${escapeHtml(String(qtdVal))}" min="0" data-cv-edit="qtdReal" data-cv-item="${idx}">
                </div>
                <div class="cv-app-field cv-app-field-modelo">
                  <label>Modelo</label>
                  <input type="text" class="glass-input" value="${escapeHtml(modVal)}" data-cv-edit="modeloReal" data-cv-item="${idx}">
                </div>
                <div class="cv-app-field cv-app-field-estado">
                  <label>Estado</label>
                  <select class="glass-input" data-cv-edit="estadoReal" data-cv-item="${idx}">
                    <option value=""    ${estVal === ''     ? 'selected' : ''}>-</option>
                    <option value="novo"  ${estVal === 'novo'  ? 'selected' : ''}>NOVO</option>
                    <option value="usado" ${estVal === 'usado' ? 'selected' : ''}>USADO</option>
                  </select>
                </div>
                <div class="cv-app-field cv-app-field-obs">
                  <label>OBS</label>
                  <input type="text" class="glass-input" value="${escapeHtml(obsVal)}" placeholder="OBS do item" data-cv-edit="obsReal" data-cv-item="${idx}">
                </div>
              </div>
              ${res.status === 'divergencia' ? `
                <div class="cv-app-div-detail">
                  ${res.autoObs ? `<div class="cv-auto-obs-info"><i class="fas fa-sync-alt"></i> Modificado: ${escapeHtml(res.autoObs)}</div>` : ''}
                  <input type="text" class="glass-input cv-obs-input"
                    placeholder="Descreva o motivo da divergência..."
                    value="${escapeHtml(res.obs || '')}" data-cv-obs="${idx}">
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>`;

    card.querySelectorAll('[data-cv-edit]').forEach(input => {
      input.addEventListener('change', () => {
        const idx   = Number(input.dataset.cvItem);
        const campo = input.dataset.cvEdit;
        onCampoEditadoConferencia(req.id, idx, campo, input.value, itens[idx]);
      });
    });

  } else {
    card.innerHTML = cabecalhoCard + `
      <div class="table-responsive">
        <table class="glass-table cv-table-conferencia">
          <thead><tr>
            <th class="cv-th-qtd">Qtd</th>
            <th>Equipamento</th>
            <th>Modelo</th>
            <th class="cv-th-estado">Estado</th>
            <th class="cv-th-obs-req">OBS</th>
            <th class="cv-th-status">Conferência</th>
          </tr></thead>
          <tbody>
            ${itens.map((item, idx) => {
              const res = resultados[idx] || { status: null, obs: '' };
              const estado   = item.novo ? 'NOVO' : item.usado ? 'USADO' : '';
              const estadoCls = item.novo ? 'estado-badge estado-badge-novo' : item.usado ? 'estado-badge estado-badge-usado' : '';
              const rowCls    = res.status === 'ok' ? 'cv-row-ok' : res.status === 'divergencia' ? 'cv-row-div' : '';
              return `
                <tr class="${rowCls}" data-cv-item-idx="${idx}">
                  <td class="cv-th-qtd"><strong>${escapeHtml(String(item.quantidade || ''))}</strong></td>
                  <td>${escapeHtml(item.item_nome || item.equipamento || '-')}</td>
                  <td>${escapeHtml(item.modelo || '-')}</td>
                  <td>${estado ? `<span class="${estadoCls}">${estado}</span>` : '-'}</td>
                  <td>${item.obs ? `<span class="obs-badge${item.obs === 'AUMENTO' ? ' obs-badge-aumento' : ''}">${escapeHtml(item.obs)}</span>` : '-'}</td>
                  <td class="cv-td-status">
                    <div class="cv-status-btns">
                      <button type="button" class="btn-cv-ok${res.status === 'ok' ? ' ativo' : ''}" data-cv-ok="${idx}"><i class="fas fa-check"></i><span class="cv-btn-label"> OK</span></button>
                      <button type="button" class="btn-cv-div${res.status === 'divergencia' ? ' ativo' : ''}" data-cv-div="${idx}"><i class="fas fa-exclamation-triangle"></i><span class="cv-btn-label"> Div.</span></button>
                    </div>
                    ${res.status === 'divergencia' ? `
                      <input type="text" class="glass-input cv-obs-input"
                        placeholder="Descreva a divergência..."
                        value="${escapeHtml(res.obs || '')}" data-cv-obs="${idx}">` : ''}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  card.querySelector('[data-cv-todos-ok]')?.addEventListener('click', () => marcarTodosOkConferencia(req.id, itens.length));
  card.querySelectorAll('[data-cv-ok]').forEach(btn  => btn.addEventListener('click', () => marcarItemConferencia(req.id, Number(btn.dataset.cvOk),  'ok')));
  card.querySelectorAll('[data-cv-div]').forEach(btn => btn.addEventListener('click', () => marcarItemConferencia(req.id, Number(btn.dataset.cvDiv), 'divergencia')));
  card.querySelectorAll('[data-cv-obs]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.cvObs);
      if (conferenciaResultados[req.id]?.[idx]) conferenciaResultados[req.id][idx].obs = input.value;
    });
  });
}

function marcarItemConferencia(reqId, itemIdx, status) {
  if (!conferenciaResultados[reqId]) conferenciaResultados[reqId] = [];
  if (!conferenciaResultados[reqId][itemIdx]) {
    conferenciaResultados[reqId][itemIdx] = {
      status: null, obs: '', wasAutoSet: false,
      qtdReal: null, modeloReal: null, estadoReal: null, obsReal: null, autoObs: ''
    };
  }
  const cur = conferenciaResultados[reqId][itemIdx];
  cur.wasAutoSet = false;
  if (cur.status === status) { cur.status = null; cur.obs = ''; }
  else { cur.status = status; if (status === 'ok') cur.obs = ''; }
  renderizarConferenciaAtual();
}

function marcarTodosOkConferencia(reqId, count) {
  if (!conferenciaResultados[reqId]) conferenciaResultados[reqId] = [];
  for (let i = 0; i < count; i++) conferenciaResultados[reqId][i] = { status: 'ok', obs: '' };
  renderizarConferenciaAtual();
}

function navegarConferencia(delta) {
  if (!conferenciaAtiva) return;
  const reqs = conferenciaAtiva.requisicoes;
  if (delta > 0 && conferenciaIndex >= reqs.length - 1) { mostrarResumoConferencia(); return; }
  conferenciaIndex = Math.max(0, Math.min(reqs.length - 1, conferenciaIndex + delta));
  renderizarConferenciaAtual();
}

// ── Totalizador ───────────────────────────────────────────────────────────────
function calcularTotalizador() {
  if (!conferenciaAtiva) return [];
  const mapa = {};
  for (const req of conferenciaAtiva.requisicoes) {
    const resultados    = conferenciaResultados[req.id] || [];
    const motivo        = req.motivo || '';
    const ehRetirada    = /retirada/i.test(motivo);
    const ehTroca       = /troca/i.test(motivo);
    const ehEntregaPura = !ehRetirada && !ehTroca;
    for (const [idx, item] of (req.itens || []).entries()) {
      const res = resultados[idx] || {};
      const qtd = (res.qtdReal !== null && res.qtdReal !== undefined)
        ? Number(res.qtdReal) : Number(item.quantidade || 0);
      if (qtd <= 0) continue;
      let estadoEfetivo;
      if (res.estadoReal !== null && res.estadoReal !== undefined && res.estadoReal !== '') {
        estadoEfetivo = res.estadoReal;
      } else {
        estadoEfetivo = item.novo ? 'novo' : item.usado ? 'usado' : null;
      }
      const isNovo  = estadoEfetivo === 'novo';
      const isUsado = estadoEfetivo === 'usado';
      const key = item.item_nome || item.equipamento || '-';
      if (!mapa[key]) mapa[key] = { entrega: 0, entregaNovo: 0, entregaUsado: 0, retirada: 0, retiradaUsado: 0 };
      const somarEntrega  = () => { mapa[key].entrega += qtd; mapa[key].entregaNovo += isNovo ? qtd : 0; mapa[key].entregaUsado += isUsado ? qtd : 0; };
      const somarRetirada = () => { mapa[key].retirada += qtd; mapa[key].retiradaUsado += qtd; };
      if (ehRetirada) { somarRetirada(); }
      else if (ehEntregaPura) { somarEntrega(); }
      else { if (item.obs === 'AUMENTO') somarEntrega(); else { somarEntrega(); somarRetirada(); } }
    }
  }
  return Object.entries(mapa).sort(([a],[b]) => a.localeCompare(b,'pt-BR')).map(([nome,v]) => ({ nome, ...v }));
}

// ── Resumo ────────────────────────────────────────────────────────────────────
async function mostrarResumoConferencia() {
  if (!conferenciaAtiva) return;
  document.getElementById('cvRequisicaoCard')?.classList.add('hidden');
  document.getElementById('cvResumo')?.classList.remove('hidden');

  // Salva no banco
  try {
    const ids = (conferenciaAtiva.requisicoes || []).map(r => r.id).filter(Boolean);
    if (ids.length) {
      await supabaseClient.from(REQUISICOES_TABLE).update({ status: 'CARREGADO' }).in('id', ids);
    }
    const reqs = conferenciaAtiva.requisicoes;
    let totalOk = 0, totalDiv = 0, totalNao = 0;
    reqs.forEach(req => {
      (req.itens || []).forEach((_, idx) => {
        const r = (conferenciaResultados[req.id] || [])[idx];
        if      (r?.status === 'ok')          totalOk++;
        else if (r?.status === 'divergencia') totalDiv++;
        else                                  totalNao++;
      });
    });
    const carId = reqs[0]?.carregamento_id || null;
    await supabaseClient.from(CONFERENCIAS_TABLE).insert([{
      carregamento_id:      carId,
      placa:                conferenciaAtiva.placa,
      motorista:            conferenciaAtiva.motorista,
      data_saida:           conferenciaAtiva.dataSaida || null,
      finalizado_por:       obterUsuarioAtualNome(),
      total_ok:             totalOk,
      total_divergencias:   totalDiv,
      total_nao_conferidos: totalNao,
      resultados:           conferenciaResultados,
      totalizador:          calcularTotalizador()
    }]);
  } catch (e) { console.error('Erro ao salvar conferência:', e); }

  const reqs = conferenciaAtiva.requisicoes;
  let totalOk = 0, totalDiv = 0, totalNao = 0;
  const linhas = reqs.map(req => {
    const resultados = conferenciaResultados[req.id] || [];
    let ok = 0, div = 0, nao = 0;
    (req.itens || []).forEach((_, idx) => {
      const r = resultados[idx];
      if      (r?.status === 'ok')          ok++;
      else if (r?.status === 'divergencia') div++;
      else                                  nao++;
    });
    totalOk += ok; totalDiv += div; totalNao += nao;
    const divStyle = div > 0 ? ' style="background:rgba(220,53,69,0.12);font-weight:700;color:#b02a37"' : '';
    return `<tr${divStyle}>
      <td>${escapeHtml(req.cliente_nome || '-')}</td>
      <td>${escapeHtml(req.motivo || '-')}</td>
      <td class="text-center"><span class="cv-badge-ok">${ok}</span></td>
      <td class="text-center">${div > 0 ? `<span class="cv-badge-div">${div}</span>` : '<span class="cv-badge-nao">0</span>'}</td>
      <td class="text-center">${nao > 0 ? `<span class="cv-badge-nao">${nao}</span>` : '-'}</td>
    </tr>`;
  }).join('');

  const totalizador    = calcularTotalizador();
  const totalEntregas  = totalizador.reduce((s,r) => s + r.entrega,  0);
  const totalRetiradas = totalizador.reduce((s,r) => s + r.retirada, 0);

  document.getElementById('cvResumoConteudo').innerHTML = `
    <div class="cv-resumo-totais">
      <div class="cv-total-card cv-total-ok"><strong>${totalOk}</strong><span>Confirmados OK</span></div>
      <div class="cv-total-card cv-total-div"><strong>${totalDiv}</strong><span>Divergências</span></div>
      <div class="cv-total-card cv-total-nao"><strong>${totalNao}</strong><span>Não conferidos</span></div>
    </div>
    <div class="table-responsive" style="margin-top:16px">
      <table class="glass-table">
        <thead><tr><th>Cliente</th><th>Motivo</th><th class="text-center">OK</th><th class="text-center">Div.</th><th class="text-center">N/C</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div class="cv-totalizador">
      <div class="cv-totalizador-header">
        <i class="fas fa-boxes"></i> Totalizador Geral de Equipamentos
        <div class="cv-tot-resumo-chips">
          <span class="cv-tot-chip cv-tot-chip-entrega"><i class="fas fa-arrow-up"></i> ${totalEntregas} Entrega${totalEntregas !== 1 ? 's' : ''}</span>
          <span class="cv-tot-chip cv-tot-chip-retirada"><i class="fas fa-arrow-down"></i> ${totalRetiradas} Retirada${totalRetiradas !== 1 ? 's' : ''}</span>
        </div>
      </div>
      ${renderTotalizadorHTML(totalizador)}
    </div>`;
}

function renderTotalizadorHTML(totalizador) {
  const regular   = totalizador.filter(r => !isItemEspecial(r.nome));
  const especiais = totalizador.filter(r =>  isItemEspecial(r.nome));
  const thead = `
    <thead>
      <tr>
        <th rowspan="2" class="cv-th-equip-nome">Equipamento</th>
        <th colspan="3" class="text-center cv-th-entrega cv-th-grupo">Entrega ao Cliente</th>
        <th colspan="2" class="text-center cv-th-retirada cv-th-grupo">Retirada do Cliente</th>
      </tr>
      <tr>
        <th class="text-center cv-th-entrega cv-th-sub">Total</th>
        <th class="text-center cv-th-entrega cv-th-sub">Novo</th>
        <th class="text-center cv-th-entrega cv-th-sub">Usado</th>
        <th class="text-center cv-th-retirada cv-th-sub">Total</th>
        <th class="text-center cv-th-retirada cv-th-sub">Usado</th>
      </tr>
    </thead>`;
  const cel = (val, cls) => val > 0
    ? `<td class="text-center ${cls}"><strong>${val}</strong></td>`
    : `<td class="text-center cv-cell-zero">—</td>`;
  const renderLinhas = lista => lista.map(row => `<tr>
    <td>${escapeHtml(row.nome)}</td>
    ${cel(row.entrega,       row.entrega  > 0 ? 'cv-cell-entrega' : '')}
    ${cel(row.entregaNovo,   row.entrega  > 0 ? 'cv-cell-entrega' : '')}
    ${cel(row.entregaUsado,  row.entrega  > 0 ? 'cv-cell-entrega' : '')}
    ${cel(row.retirada,      row.retirada > 0 ? 'cv-cell-retirada' : '')}
    ${cel(row.retiradaUsado, row.retirada > 0 ? 'cv-cell-retirada' : '')}
  </tr>`).join('');
  const renderSubtotal = lista => `
    <tr class="cv-tot-total-row">
      <td><strong>SUBTOTAL</strong></td>
      <td class="text-center"><strong>${lista.reduce((s,r)=>s+r.entrega,0)}</strong></td>
      <td class="text-center"><strong>${lista.reduce((s,r)=>s+r.entregaNovo,0)}</strong></td>
      <td class="text-center"><strong>${lista.reduce((s,r)=>s+r.entregaUsado,0)}</strong></td>
      <td class="text-center"><strong>${lista.reduce((s,r)=>s+r.retirada,0)}</strong></td>
      <td class="text-center"><strong>${lista.reduce((s,r)=>s+r.retiradaUsado,0)}</strong></td>
    </tr>`;
  const renderTabela = (lista, titulo) => `
    ${titulo ? `<div class="cv-tot-separador"><i class="fas fa-exchange-alt"></i> ${titulo}</div>` : ''}
    <div class="table-responsive">
      <table class="glass-table cv-table-totalizador">${thead}<tbody>${renderLinhas(lista)}</tbody><tfoot>${renderSubtotal(lista)}</tfoot></table>
    </div>`;
  let html = regular.length ? renderTabela(regular, '') : '';
  if (especiais.length) html += renderTabela(especiais, 'Esteiras &amp; Formas');
  return html;
}

// ── Relatório PDF ─────────────────────────────────────────────────────────────
async function gerarRelatorioConferencia() {
  if (!conferenciaAtiva) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('Biblioteca PDF não carregada.'); return; }

  const logoBase64 = await new Promise(resolve => {
    const img = new Image();
    img.src = 'logo.png';
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = () => resolve(null);
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 8, 40, 12);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(0, 105, 55);
  doc.text('MARQUESPAN', 195, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text('CONFERÊNCIA DE CARREGAMENTO', 195, 20, { align: 'right' });
  doc.setLineWidth(0.5); doc.setDrawColor(0, 105, 55); doc.line(14, 24, 196, 24);

  let y = 33;
  const { okCount, divCount, totalItens } = calcularTotaisConferencia();
  const naoConf = totalItens - okCount - divCount;
  const campos = [
    ['PLACA',       conferenciaAtiva.placa    || '-'],
    ['MOTORISTA',   conferenciaAtiva.motorista || '-'],
    ['DATA SAÍDA',  conferenciaAtiva.dataSaida ? conferenciaAtiva.dataSaida.split('-').reverse().join('/') : '-'],
    ['TOTAL ITENS', `${totalItens} itens  |  OK: ${okCount}  |  Divergencias: ${divCount}  |  Nao conferidos: ${naoConf}`]
  ];
  for (let i = 0; i < campos.length; i += 2) {
    const [l1, v1] = campos[i];
    const [l2, v2] = campos[i + 1] || [];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0, 105, 55);
    doc.text(l1 + ':', 14, y);
    if (l2) doc.text(l2 + ':', 108, y);
    y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30, 30, 30);
    doc.text(String(v1), 14, y);
    if (v2) doc.text(String(v2), 108, y);
    y += 8;
  }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  |  Usuario: ${obterUsuarioAtualNome()}`, 14, y);
  y += 8;

  for (const req of conferenciaAtiva.requisicoes) {
    if (y > 255) { doc.addPage(); y = 18; }
    doc.setFillColor(0, 105, 55); doc.rect(14, y, 182, 6.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    const labelReq = [req.cliente_nome, req.motivo, req.supervisor ? `Sup.: ${req.supervisor}` : null].filter(Boolean).join('  |  ');
    doc.text(labelReq, 16, y + 4.3);
    doc.setTextColor(30, 30, 30);
    y += 8;
    const resultados = conferenciaResultados[req.id] || [];
    doc.autoTable({
      startY: y,
      head: [['Qtd', 'Equipamento', 'Modelo', 'Est.', 'OBS Req', 'Status', 'Modificacoes / Motivo']],
      body: (req.itens || []).map((item, idx) => {
        const res    = resultados[idx] || {};
        const estado = item.novo ? 'NOVO' : item.usado ? 'USADO' : '-';
        const status = res.status === 'ok' ? 'OK' : res.status === 'divergencia' ? 'DIV.' : '-';
        const notas  = [res.autoObs, res.obs].filter(Boolean).join(' | ') || '';
        return [item.quantidade, item.item_nome || '-', item.modelo || '-', estado, item.obs || '-', status, notas];
      }),
      styles: { fontSize: 8, cellPadding: 2.2, textColor: [30, 30, 30] },
      headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 250, 246] },
      tableLineColor: [200, 220, 200], tableLineWidth: 0.1,
      columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 3: { halign: 'center', cellWidth: 16 }, 5: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 6: { cellWidth: 50 } },
      didParseCell(data) {
        if (data.column.index === 5 && data.section === 'body') {
          if (data.cell.raw === 'OK')   data.cell.styles.textColor = [0, 130, 60];
          if (data.cell.raw === 'DIV.') data.cell.styles.textColor = [190, 30, 30];
        }
      },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const totalizador = calcularTotalizador();
  if (totalizador.length > 0) {
    if (y > 220) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 105, 55);
    doc.text('TOTALIZADOR GERAL DE EQUIPAMENTOS', 14, y);
    y += 2; doc.setLineWidth(0.3); doc.setDrawColor(0, 105, 55); doc.line(14, y, 196, y); y += 5;
    const regular   = totalizador.filter(r => !isItemEspecial(r.nome));
    const especiais = totalizador.filter(r =>  isItemEspecial(r.nome));
    const headTot = [
      [{ content: 'Equipamento', rowSpan: 2, styles: { valign: 'middle' } },
       { content: 'Entrega ao Cliente',  colSpan: 3, styles: { halign: 'center', fillColor: [0, 130, 60] } },
       { content: 'Retirada do Cliente', colSpan: 2, styles: { halign: 'center', fillColor: [160, 30, 30] } }],
      [{ content: 'Total', styles: { halign: 'center', fillColor: [0, 130, 60] } },
       { content: 'Novo',  styles: { halign: 'center', fillColor: [0, 130, 60] } },
       { content: 'Usado', styles: { halign: 'center', fillColor: [0, 130, 60] } },
       { content: 'Total', styles: { halign: 'center', fillColor: [160, 30, 30] } },
       { content: 'Usado', styles: { halign: 'center', fillColor: [160, 30, 30] } }]
    ];
    const colStyles = { 0:{cellWidth:80}, 1:{halign:'center',cellWidth:20}, 2:{halign:'center',cellWidth:20}, 3:{halign:'center',cellWidth:20}, 4:{halign:'center',cellWidth:20}, 5:{halign:'center',cellWidth:20} };
    const buildBody = lista => [
      ...lista.map(r => [r.nome, r.entrega||'-', r.entregaNovo||'-', r.entregaUsado||'-', r.retirada||'-', r.retiradaUsado||'-']),
      [{ content:'SUBTOTAL', styles:{fontStyle:'bold'} },
       ...(['entrega','entregaNovo','entregaUsado','retirada','retiradaUsado'].map(k => ({ content: lista.reduce((s,r)=>s+r[k],0)||'-', styles:{fontStyle:'bold',halign:'center'} })))]
    ];
    const didParseCell = lista => data => {
      if (data.section !== 'body') return;
      const isSub = data.row.index === lista.length;
      if (isSub) { data.cell.styles.fillColor = [230, 245, 235]; data.cell.styles.lineWidth = 0.3; data.cell.styles.lineColor = [0, 105, 55]; }
      if (!isSub) {
        if ([1,2,3].includes(data.column.index) && data.cell.raw !== '-') data.cell.styles.textColor = [0, 130, 60];
        if ([4,5].includes(data.column.index)   && data.cell.raw !== '-') data.cell.styles.textColor = [190, 30, 30];
      }
    };
    const autoTabTot = lista => {
      doc.autoTable({ startY: y, head: headTot, body: buildBody(lista), styles:{fontSize:8,cellPadding:2,textColor:[30,30,30]}, headStyles:{fillColor:[0,105,55],textColor:255,fontStyle:'bold',fontSize:8}, alternateRowStyles:{fillColor:[245,250,246]}, tableLineColor:[200,220,200], tableLineWidth:0.1, columnStyles:colStyles, didParseCell:didParseCell(lista), margin:{left:14,right:14} });
      y = doc.lastAutoTable.finalY + 6;
    };
    if (regular.length) autoTabTot(regular);
    if (especiais.length) {
      if (y > 240) { doc.addPage(); y = 18; }
      doc.setFillColor(240,240,240); doc.rect(14, y, 182, 6, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(80,80,80);
      doc.text('Esteiras & Formas', 17, y + 4.2); y += 8;
      autoTabTot(especiais);
    }
  }

  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p); doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(160,160,160);
    doc.text(`Página ${p} de ${totalPags}`, 195, 290, { align: 'right' });
    doc.text('Marquespan — Conferência de Carregamento', 15, 290);
  }
  doc.save(`Conferencia_Carregamento_${conferenciaAtiva.placa || 'carg'}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Fila e histórico ──────────────────────────────────────────────────────────
function popularFilaConferencia() {
  const select = document.getElementById('cvSeletorCarregamento');
  if (!select) return;
  const idsNaFila = new Set(
    (requisicoesSalvas || [])
      .filter(r => r.status === 'AGUARDANDO CONFERENCIA' && r.carregamento_id)
      .map(r => r.carregamento_id)
  );
  select.innerHTML = '<option value="">Selecione um carregamento...</option>';
  (carregamentosSalvos || []).filter(c => idsNaFila.has(c.id)).forEach(car => {
    const op = document.createElement('option');
    op.value = car.id;
    const data = car.data_saida ? car.data_saida.split('-').reverse().join('/') : '-';
    op.textContent = `${data} · ${car.placa || '-'} · ${car.motorista || '-'}`;
    select.appendChild(op);
  });
  const aviso = document.getElementById('cvFilaVazia');
  if (aviso) aviso.classList.toggle('hidden', idsNaFila.size > 0);
  popularHistoricoConferencias();
}

async function popularHistoricoConferencias() {
  const tbody = document.getElementById('cvHistoricoConferenciasTbody');
  if (!tbody) return;
  const { data, error } = await supabaseClient
    .from(CONFERENCIAS_TABLE)
    .select('id, placa, motorista, data_saida, finalizado_em, finalizado_por, total_ok, total_divergencias, total_nao_conferidos')
    .order('finalizado_em', { ascending: false })
    .limit(30);
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhuma conferência finalizada.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(c => {
    const dataSaida = c.data_saida ? c.data_saida.split('-').reverse().join('/') : '-';
    const finEm     = c.finalizado_em ? new Date(c.finalizado_em).toLocaleString('pt-BR') : '-';
    return `<tr>
      <td>${dataSaida}</td>
      <td>${escapeHtml(c.placa || '-')}</td>
      <td>${escapeHtml(c.motorista || '-')}</td>
      <td>${finEm}</td>
      <td class="text-center"><span class="cv-badge-ok">${c.total_ok}</span></td>
      <td class="text-center">${c.total_divergencias > 0 ? `<span class="cv-badge-div">${c.total_divergencias}</span>` : '<span class="cv-badge-ok">0</span>'}</td>
      <td class="text-center" style="white-space:nowrap">
        <button type="button" class="btn-icon view"   data-carregar-conferencia="${escapeHtml(c.id)}" title="Reabrir conferência"><i class="fas fa-eye"></i></button>
        <button type="button" class="btn-icon delete" data-excluir-conferencia="${escapeHtml(c.id)}"  data-conf-placa="${escapeHtml(c.placa || '-')}" data-conf-data="${dataSaida}" title="Excluir conferência"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-carregar-conferencia]').forEach(btn => {
    btn.addEventListener('click', () => recarregarConferenciaSalva(btn.dataset.carregarConferencia));
  });
  tbody.querySelectorAll('[data-excluir-conferencia]').forEach(btn => {
    btn.addEventListener('click', () => excluirConferencia(
      btn.dataset.excluirConferencia,
      btn.dataset.confPlaca,
      btn.dataset.confData
    ));
  });
}

async function excluirConferencia(confId, placa, dataSaida) {
  const confirmar = confirm(
    `Excluir a conferência da placa ${placa} (${dataSaida})?\n\n` +
    `As requisições voltarão para "AGUARDANDO CONFERENCIA" e poderão ser reconferidas.`
  );
  if (!confirmar) return;

  // Busca o carregamento_id para reverter as requisições
  const { data: conf, error: errConf } = await supabaseClient
    .from(CONFERENCIAS_TABLE)
    .select('carregamento_id')
    .eq('id', confId)
    .single();

  if (errConf || !conf) { alert('Erro ao localizar conferência.'); return; }

  const { error: errReqs } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .update({ status: 'AGUARDANDO CONFERENCIA' })
    .eq('carregamento_id', conf.carregamento_id);

  if (errReqs) { alert('Erro ao reverter status das requisições.'); return; }

  const { error: errDel } = await supabaseClient
    .from(CONFERENCIAS_TABLE)
    .delete()
    .eq('id', confId);

  if (errDel) { alert('Erro ao excluir conferência.'); return; }

  // Atualiza fila e histórico
  await carregarDados();
  popularFilaConferencia();
}

async function carregarConferenciaDoHistorico() {
  const id = document.getElementById('cvSeletorCarregamento')?.value;
  if (!id) { alert('Selecione um carregamento.'); return; }
  const [{ data: car, error: errCar }, { data: reqs, error: errReqs }] = await Promise.all([
    supabaseClient.from(CARREGAMENTOS_TABLE).select('*').eq('id', id).single(),
    supabaseClient.from(REQUISICOES_TABLE).select('*').eq('carregamento_id', id).order('ordem')
  ]);
  if (errCar || errReqs) { alert('Erro ao carregar carregamento.'); return; }
  conferenciaAtiva = { requisicoes: reqs || [], placa: car.placa || '', motorista: car.motorista || '', dataSaida: car.data_saida || '' };
  conferenciaIndex = 0;
  inicializarResultadosConferencia(conferenciaAtiva.requisicoes);
  renderizarConferenciaUI();
}

async function recarregarConferenciaSalva(confId) {
  const { data: conf, error } = await supabaseClient.from(CONFERENCIAS_TABLE).select('*').eq('id', confId).single();
  if (error || !conf) { alert('Erro ao carregar conferência.'); return; }
  const [{ data: reqs }] = await Promise.all([
    supabaseClient.from(REQUISICOES_TABLE).select('*').eq('carregamento_id', conf.carregamento_id).order('ordem')
  ]);
  conferenciaAtiva = { requisicoes: reqs || [], placa: conf.placa || '', motorista: conf.motorista || '', dataSaida: conf.data_saida || '' };
  conferenciaIndex = 0;
  inicializarResultadosConferencia(conferenciaAtiva.requisicoes);
  if (conf.resultados) Object.assign(conferenciaResultados, conf.resultados);
  renderizarConferenciaUI();
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function renderizarConferenciaUI() {
  document.getElementById('cvSemCarregamento')?.classList.add('hidden');
  document.getElementById('cvConferencia')?.classList.remove('hidden');
  document.getElementById('cvResumo')?.classList.add('hidden');
  document.getElementById('cvRequisicaoCard')?.classList.remove('hidden');
  renderizarConferenciaAtual();
}

function toggleModoApp() {
  conferenciaEmModoApp = !conferenciaEmModoApp;
  const section = document.getElementById('cvConferenciaPagina');
  const btn     = document.getElementById('btnModoApp');
  if (conferenciaEmModoApp) {
    section?.classList.add('modo-app-ativo');
    document.body.classList.add('cv-modo-app-body');
  } else {
    section?.classList.remove('modo-app-ativo');
    document.body.classList.remove('cv-modo-app-body');
  }
  if (btn) {
    btn.innerHTML = conferenciaEmModoApp ? '<i class="fas fa-times"></i> Sair do Modo APP' : '<i class="fas fa-mobile-alt"></i> Modo APP';
    btn.className = `btn-glass ${conferenciaEmModoApp ? 'btn-red' : 'btn-blue'}`;
  }
  if (conferenciaAtiva) renderizarConferenciaAtual();
}

// ── Inicialização da página ───────────────────────────────────────────────────
export async function inicializarConferenciaPage() {
  await carregarDados();
  popularFilaConferencia();

  document.getElementById('btnModoApp')?.addEventListener('click', toggleModoApp);
  document.getElementById('btnCvAnterior')?.addEventListener('click', () => navegarConferencia(-1));
  document.getElementById('btnCvProxima')?.addEventListener('click',  () => navegarConferencia(1));
  document.getElementById('btnIniciarConferenciaHistorico')?.addEventListener('click', carregarConferenciaDoHistorico);
  document.getElementById('btnCvGerarRelatorio')?.addEventListener('click', gerarRelatorioConferencia);
  document.getElementById('btnCvReiniciar')?.addEventListener('click', () => {
    conferenciaAtiva = null; conferenciaResultados = {}; conferenciaIndex = 0;
    document.getElementById('cvRequisicaoCard')?.classList.remove('hidden');
    document.getElementById('cvResumo')?.classList.add('hidden');
    document.getElementById('cvSemCarregamento')?.classList.remove('hidden');
    document.getElementById('cvConferencia')?.classList.add('hidden');
    carregarDados().then(popularFilaConferencia);
  });
  document.getElementById('btnAtualizarFila')?.addEventListener('click', () => carregarDados().then(popularFilaConferencia));
}
