import { supabaseClient } from './supabase.js';

const CARREGAMENTOS_TABLE = 'saidas_carregamento';
const REQUISICOES_TABLE = 'requisicoes_carregamento';
const MOTIVOS_SO_RETORNO = ['Retirada Total', 'Retirada Parcial', 'Retirada de Emprestimo'];
const MOTIVOS_SO_ENTREGA = ['Aumento', 'Cliente Novo'];
const ITENS_ESPECIAIS_NOMES = ['ESTEIRA', 'FORMA'];

let carregamentos = [];
let requisicoesPorCarregamento = new Map();

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnBuscar')?.addEventListener('click', carregarCarregamentos);
  document.getElementById('btnLimpar')?.addEventListener('click', limparFiltros);
  document.getElementById('termoBusca')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') carregarCarregamentos();
  });
  document.getElementById('btnFecharResumo')?.addEventListener('click', fecharModalResumo);
  document.getElementById('modalResumoCarregamento')?.addEventListener('click', event => {
    if (event.target.id === 'modalResumoCarregamento') fecharModalResumo();
  });
  document.getElementById('btnImprimirResumo')?.addEventListener('click', imprimirResumo);

  carregarCarregamentos();
});

async function carregarCarregamentos() {
  const tbody = document.getElementById('corpoTabelaCarregamentos');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">Carregando...</td></tr>';

  const dataInicial = document.getElementById('dataInicial')?.value;
  const dataFinal = document.getElementById('dataFinal')?.value;

  let query = supabaseClient
    .from(CARREGAMENTOS_TABLE)
    .select('*')
    .order('data_saida', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (dataInicial) query = query.gte('data_saida', dataInicial);
  if (dataFinal) query = query.lte('data_saida', dataFinal);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao buscar carregamentos:', error);
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">Erro ao carregar os carregamentos.</td></tr>';
    return;
  }

  const lista = data || [];
  requisicoesPorCarregamento = await buscarRequisicoesDosCarregamentos(lista.map(item => item.id));

  const termo = normalizarTexto(document.getElementById('termoBusca')?.value);
  carregamentos = lista.filter(item => !termo || montarTextoBusca(item).includes(termo));
  renderizarCarregamentos();
}

async function buscarRequisicoesDosCarregamentos(ids) {
  const mapa = new Map();
  ids.forEach(id => mapa.set(String(id), []));
  if (!ids.length) return mapa;

  const { data, error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .select('carregamento_id, arquivo, cliente_nome, motivo, supervisor, ordem, data_requisicao, itens, observacao')
    .in('carregamento_id', ids)
    .order('supervisor');

  if (error) {
    console.error('Erro ao buscar requisicoes dos carregamentos:', error);
    return mapa;
  }

  (data || []).forEach(req => {
    const key = String(req.carregamento_id);
    if (!mapa.has(key)) mapa.set(key, []);
    mapa.get(key).push(req);
  });
  return mapa;
}

function renderizarCarregamentos() {
  const tbody = document.getElementById('corpoTabelaCarregamentos');
  const total = document.getElementById('totalResultados');
  total.textContent = `${carregamentos.length} ${carregamentos.length === 1 ? 'registro' : 'registros'}`;

  if (!carregamentos.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">Nenhum carregamento encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = carregamentos.map(item => {
    const idEsc = escapeHtml(String(item.id));
    const criadoEm = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-';

    return `
      <tr>
        <td><strong>${escapeHtml(formatarData(item.data_saida))}</strong><br><small class="muted-text">${escapeHtml(criadoEm)}</small></td>
        <td><span class="hist-placa">${escapeHtml(item.placa || '-')}</span></td>
        <td>${escapeHtml(item.modelo_veiculo || '-')}</td>
        <td>${escapeHtml(item.motorista || '-')}</td>
        <td class="col-num"><span class="badge-req">${escapeHtml(item.total_requisicoes || 0)}</span></td>
        <td class="col-num col-entrega"><strong>${escapeHtml(item.total_entrega || 0)}</strong></td>
        <td class="col-num col-retorno"><strong>${escapeHtml(item.total_retorno || 0)}</strong></td>
        <td><small class="muted-text">${escapeHtml(item.usuario || '-')}</small></td>
        <td>
          <button type="button" class="hist-btn-resumo" data-resumo-carregamento="${idEsc}" title="Gerar relatorio deste carregamento">
            <i class="fas fa-file-alt"></i> Relatorio
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-resumo-carregamento]').forEach(button => {
    button.addEventListener('click', () => gerarResumoCarregamento(button.dataset.resumoCarregamento));
  });
}

async function gerarResumoCarregamento(id) {
  const modal = document.getElementById('modalResumoCarregamento');
  const conteudo = document.getElementById('conteudoResumoCarregamento');
  if (!modal || !conteudo) return;

  conteudo.innerHTML = '<div class="resumo-loading"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const car = carregamentos.find(item => String(item.id) === String(id)) || await buscarCarregamentoPorId(id);
    const reqs = requisicoesPorCarregamento.get(String(id)) || await buscarRequisicoesPorCarregamento(id);
    const mapaItens = calcularMapaItens(reqs);
    conteudo.innerHTML = renderResumoHTML(car, reqs, mapaItens);
  } catch (err) {
    console.error('Erro ao gerar relatorio:', err);
    conteudo.innerHTML = `<p class="resumo-error">Erro ao carregar dados: ${escapeHtml(err.message || 'tente novamente.')}</p>`;
  }
}

async function buscarCarregamentoPorId(id) {
  const { data, error } = await supabaseClient
    .from(CARREGAMENTOS_TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function buscarRequisicoesPorCarregamento(id) {
  const { data, error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .select('carregamento_id, arquivo, cliente_nome, motivo, supervisor, ordem, data_requisicao, itens, observacao')
    .eq('carregamento_id', id)
    .order('supervisor');
  if (error) throw error;
  return data || [];
}

function calcularMapaItens(reqs) {
  const mapaItens = new Map();
  (reqs || []).forEach(req => {
    const itens = Array.isArray(req.itens) ? req.itens : [];
    const temRetornoObs = itens.some(item => item.de_observacao);
    itens.forEach(item => {
      const qtd = Number(item.quantidade) || 0;
      if (qtd <= 0) return;

      const key = item.item_nome || item.equipamento || '?';
      if (!mapaItens.has(key)) mapaItens.set(key, { nome: key, entrega: 0, retorno: 0 });

      const total = mapaItens.get(key);
      const direcao = direcionarItemCarregamento(item, req.motivo, temRetornoObs);
      if (direcao === 'troca') {
        total.entrega += qtd;
        total.retorno += qtd;
      } else if (direcao === 'entrega') {
        total.entrega += qtd;
      } else {
        total.retorno += qtd;
      }
    });
  });
  return mapaItens;
}

function direcionarItemCarregamento(item, motivoRequisicao = '', temRetornoObservacao = false) {
  if (item.de_observacao) return 'retorno';

  const motivo = normalizarTexto(motivoRequisicao);
  if (MOTIVOS_SO_RETORNO.some(value => normalizarTexto(value) === motivo)) return 'retorno';
  if (MOTIVOS_SO_ENTREGA.some(value => normalizarTexto(value) === motivo)) return 'entrega';

  const modelo = normalizarTexto(item.modelo || '');
  if (modelo === 'TROCA') return 'troca';
  if (modelo === 'AUMENTO') return 'entrega';
  if (motivo === 'TROCA' && temRetornoObservacao) return 'entrega';
  if (!modelo && motivo === 'TROCA') return 'troca';
  if (item.novo) return 'entrega';
  if (item.usado) return 'retorno';
  return 'entrega';
}

function renderResumoHTML(car, reqs, mapaItens) {
  const agora = new Date().toLocaleString('pt-BR');
  const reqsOrdenadas = (reqs || [])
    .map((req, index) => ({ req, index, ordem: obterOrdemCarregamento(req, index) }))
    .sort((a, b) => (a.ordem - b.ordem) || (a.index - b.index))
    .map(item => item.req);

  const reqRows = reqsOrdenadas.map((req, index) => `<tr>
    <td class="resumo-num-cel">${escapeHtml(obterOrdemCarregamento(req, index))}</td>
    <td>${escapeHtml(req.cliente_nome || '-')}</td>
    <td>${escapeHtml(req.motivo || '-')}</td>
    <td>${escapeHtml(req.supervisor || '-')}</td>
    <td>${escapeHtml(formatarData(req.data_requisicao))}</td>
    <td>${escapeHtml(req.arquivo || '-')}</td>
  </tr>`).join('');

  const regular = [...mapaItens.values()].filter(item => !isItemEspecial(item.nome));
  const especiais = [...mapaItens.values()].filter(item => isItemEspecial(item.nome));
  let teReg = 0;
  let trReg = 0;
  let teEsp = 0;
  let trEsp = 0;
  regular.forEach(item => { teReg += item.entrega; trReg += item.retorno; });
  especiais.forEach(item => { teEsp += item.entrega; trEsp += item.retorno; });

  const linhasItem = lista => lista.map(item => `<tr>
    <td>${escapeHtml(item.nome)}</td>
    <td class="resumo-num-cel col-entrega">${item.entrega || '-'}</td>
    <td class="resumo-num-cel col-retorno">${item.retorno || '-'}</td>
  </tr>`).join('');

  const blocoEspeciais = especiais.length ? `
    <tr class="resumo-sep-row"><td colspan="3"><i class="fas fa-exchange-alt"></i> Esteiras &amp; Formas</td></tr>
    ${linhasItem(especiais)}
    <tr class="resumo-subtotal-row">
      <td>Subtotal Esteiras &amp; Formas</td>
      <td class="resumo-num-cel col-entrega">${teEsp || '-'}</td>
      <td class="resumo-num-cel col-retorno">${trEsp || '-'}</td>
    </tr>` : '';

  return `<div class="resumo-print-area">
    <div class="resumo-topo">
      <div class="resumo-logo-wrap">
        <img src="logo.png" alt="Marquespan" class="resumo-logo" onerror="this.style.display='none'">
      </div>
      <div class="resumo-titulo-wrap">
        <h2 class="resumo-titulo">Resumo de Carregamento</h2>
        <p class="resumo-subtitulo">Gerado em ${escapeHtml(agora)}</p>
      </div>
    </div>

    <div class="resumo-info-grid">
      <div class="resumo-info-item">
        <span class="resumo-label">Data de Saida</span>
        <strong class="resumo-valor">${escapeHtml(formatarData(car.data_saida))}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Placa</span>
        <strong class="resumo-valor resumo-placa-tag">${escapeHtml(car.placa || '-')}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Modelo / Tipo</span>
        <strong class="resumo-valor">${escapeHtml(car.modelo_veiculo || '-')}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Motorista</span>
        <strong class="resumo-valor">${escapeHtml(car.motorista || '-')}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Salvo por</span>
        <strong class="resumo-valor">${escapeHtml(car.usuario || '-')}</strong>
      </div>
    </div>

    <div class="resumo-strip">
      <div class="resumo-strip-item">
        <span class="resumo-strip-num">${escapeHtml(car.total_requisicoes || 0)}</span>
        <span class="resumo-strip-label">Requisicoes</span>
      </div>
      <div class="resumo-strip-item resumo-strip-carregar">
        <span class="resumo-strip-num">${escapeHtml(car.total_entrega || 0)}</span>
        <span class="resumo-strip-label">Total a Carregar</span>
      </div>
      <div class="resumo-strip-item resumo-strip-retirar">
        <span class="resumo-strip-num">${escapeHtml(car.total_retorno || 0)}</span>
        <span class="resumo-strip-label">Total a Retirar</span>
      </div>
    </div>

    <h4 class="resumo-section-h"><i class="fas fa-list-ul"></i> Requisicoes Incluidas</h4>
    <table class="resumo-table resumo-table-req">
      <thead><tr>
        <th class="resumo-num-cel">Ordem</th><th>Cliente</th><th>Motivo</th><th>Supervisor</th><th>Data Req.</th><th>Arquivo</th>
      </tr></thead>
      <tbody>${reqRows || '<tr><td colspan="6" class="resumo-empty">Sem requisicoes</td></tr>'}</tbody>
    </table>

    <h4 class="resumo-section-h"><i class="fas fa-boxes"></i> Totalizador de Equipamentos</h4>
    <table class="resumo-table">
      <thead><tr>
        <th>Equipamento</th>
        <th class="resumo-num-cel">Carregar</th>
        <th class="resumo-num-cel">Retirar</th>
      </tr></thead>
      <tbody>
        ${linhasItem(regular)}
        <tr class="resumo-subtotal-row">
          <td>Subtotal Equipamentos</td>
          <td class="resumo-num-cel col-entrega">${teReg || '-'}</td>
          <td class="resumo-num-cel col-retorno">${trReg || '-'}</td>
        </tr>
        ${blocoEspeciais}
      </tbody>
      <tfoot>
        <tr class="resumo-total-final">
          <td><strong>TOTAL GERAL</strong></td>
          <td class="resumo-num-cel col-entrega"><strong>${(teReg + teEsp) || '-'}</strong></td>
          <td class="resumo-num-cel col-retorno"><strong>${(trReg + trEsp) || '-'}</strong></td>
        </tr>
      </tfoot>
    </table>

    <div class="resumo-assinatura">
      <div class="resumo-assinatura-linha">
        <div class="resumo-assinatura-item">
          <div class="resumo-assinatura-espaco"></div>
          <span>Assinatura do Conferente</span>
        </div>
        <div class="resumo-assinatura-item">
          <div class="resumo-assinatura-espaco"></div>
          <span>Assinatura do Motorista</span>
        </div>
      </div>
    </div>

    <div class="resumo-rodape">
      Marquespan Alimentos &bull; Documento gerado automaticamente &bull; ${escapeHtml(agora)}
    </div>
  </div>`;
}

function montarTextoBusca(item) {
  const reqs = requisicoesPorCarregamento.get(String(item.id)) || [];
  return normalizarTexto([
    item.placa,
    item.modelo_veiculo,
    item.motorista,
    item.usuario,
    item.data_saida,
    ...(reqs || []).flatMap(req => [
      req.arquivo,
      req.cliente_nome,
      req.motivo,
      req.supervisor,
      req.data_requisicao
    ])
  ].join(' '));
}

function limparFiltros() {
  document.getElementById('termoBusca').value = '';
  document.getElementById('dataInicial').value = '';
  document.getElementById('dataFinal').value = '';
  carregarCarregamentos();
}

function fecharModalResumo() {
  document.getElementById('modalResumoCarregamento')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function imprimirResumo() {
  const conteudo = document.getElementById('conteudoResumoCarregamento');
  if (!conteudo) return;

  const base = window.location.origin
    + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  const cssLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(link => link.href.includes('buscar-carregamento.css'));
  const cssHref = cssLink ? cssLink.href : `${base}css/buscar-carregamento.css`;

  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.write(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Resumo de Carregamento - Marquespan</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="${cssHref}">
  <base href="${base}">
  <style>
    body { margin: 6mm 10mm; background: #fff; }
    @page { margin: 6mm 10mm; size: A4 portrait; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style>
</head>
<body>
  ${conteudo.innerHTML}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); window.close(); }, 600);
    });
  <\/script>
</body>
</html>`);
  win.document.close();
}

function formatarData(value) {
  if (!value) return '-';
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function obterOrdemCarregamento(req, fallbackIndex = 0) {
  const numero = Number(String(req?.ordem ?? fallbackIndex + 1).replace(/\D/g, ''));
  return Number.isFinite(numero) && numero > 0 ? numero : fallbackIndex + 1;
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

function isItemEspecial(nomeItem) {
  const texto = normalizarTexto(nomeItem || '');
  return ITENS_ESPECIAIS_NOMES.some(nome => texto.includes(nome));
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
