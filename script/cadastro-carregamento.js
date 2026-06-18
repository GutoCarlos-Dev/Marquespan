import { supabaseClient } from './supabase.js';

const MOTIVOS_QUE_ADICIONAM = ['Aumento', 'Aumento+Troca', 'Cliente Novo'];
const REQUISICOES_TABLE = 'requisicoes_carregamento';
const REQUISICOES_BUCKET = 'requisicoes-carregamento';

let clientesCarregamento = [];
let itensCarregamento = [];
let requisicoesImportadas = [];
let requisicoesSalvas = [];
let filtrosRequisicaoAplicados = {
  supervisor: '',
  data: '',
  motivo: '',
  status: ''
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function normalizarBusca(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function cleanCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeCodigo(value) {
  const texto = cleanCell(value);
  const digitos = texto.replace(/\D/g, '');
  return digitos || texto;
}

function normalizarRota(value) {
  const texto = cleanCell(value);
  const numero = texto.match(/\d+/)?.[0];
  if (!numero) return texto;
  return numero.replace(/^0+(?=\d)/, '');
}

function clienteEstaAtivo(cliente) {
  const ativo = String(cliente?.ativo ?? 'A').trim().toUpperCase();
  return ['A', 'ATIVO', 'S', 'SIM', 'TRUE', '1'].includes(ativo);
}

function obterUsuarioAtualNome() {
  try {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    return usuario?.nome || usuario?.nome_completo || usuario?.email || 'Sistema';
  } catch {
    return 'Sistema';
  }
}

function formatarDataHora(value) {
  if (!value) return '-';
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatarData(value) {
  if (!value) return '-';
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function converterDataExcelParaIso(cell, workbook) {
  const valor = cell?.v;
  if (valor === undefined || valor === null || valor === '') return null;

  if (typeof valor === 'number' && window.XLSX?.SSF?.parse_date_code) {
    const parsed = window.XLSX.SSF.parse_date_code(valor, { date1904: Boolean(workbook?.Workbook?.WBProps?.date1904) });
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const texto = String(valor).trim();
  const br = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }

  const data = new Date(texto);
  if (!Number.isNaN(data.getTime())) return data.toISOString().slice(0, 10);
  return null;
}

function atualizarStatusRequisicao(message, error = false) {
  const status = document.getElementById('requisicaoImportStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', error);
  status.classList.toggle('hidden', !message);
}

function formatarCliente(cliente) {
  return cliente ? `${cliente.codigo} - ${cliente.nome}` : '';
}

function atualizarDatalistRequisicaoClientes() {
  const datalist = document.getElementById('requisicaoClientesList');
  if (!datalist) return;
  datalist.innerHTML = '';
  clientesCarregamento.forEach(cliente => {
    const option = document.createElement('option');
    option.value = formatarCliente(cliente);
    datalist.appendChild(option);
  });
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizarBuscaImportacao(value) {
  return normalizarTexto(value)
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEquipment(equip) {
  return String(equip || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function extrairClienteCelula(value) {
  const texto = String(value || '').replace(/\s+/g, ' ').trim();
  if (!texto) return { codigo: '', nome: '', texto: '' };

  const match = texto.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!match) return { codigo: '', nome: texto, texto };

  return {
    nome: match[1].trim(),
    codigo: match[2].trim(),
    texto
  };
}

function encontrarClientePorDados(dadosCliente) {
  const codigo = normalizarBuscaImportacao(dadosCliente?.codigo);
  const nome = normalizarBuscaImportacao(dadosCliente?.nome);

  if (codigo) {
    const porCodigo = clientesCarregamento.find(cliente => normalizarBuscaImportacao(cliente.codigo) === codigo);
    if (porCodigo) return porCodigo;
  }

  if (nome) {
    return clientesCarregamento.find(cliente => normalizarBuscaImportacao(cliente.nome) === nome) || null;
  }

  return null;
}

function encontrarCliente(value) {
  const normalizado = normalizarBuscaImportacao(value);
  return clientesCarregamento.find(cliente =>
    normalizarBuscaImportacao(`${cliente.codigo} - ${cliente.nome}`) === normalizado ||
    normalizarBuscaImportacao(cliente.codigo) === normalizado ||
    normalizarBuscaImportacao(cliente.nome) === normalizado
  );
}

function obterNomeClienteDoArquivo(fileName) {
  return normalizarBuscaImportacao(
    String(fileName || '')
      .replace(/\.(xlsx?|xls)$/i, '')
      .replace(/\s*\([^)]*\)\s*$/g, '')
  );
}

function encontrarClientePorArquivo(fileName) {
  const nomeArquivo = obterNomeClienteDoArquivo(fileName);
  if (!nomeArquivo) return null;

  const exato = clientesCarregamento.find(cliente => normalizarBuscaImportacao(cliente.nome) === nomeArquivo);
  if (exato) return exato;

  const candidatos = clientesCarregamento.filter(cliente => {
    const nomeCliente = normalizarBuscaImportacao(cliente.nome);
    return nomeCliente.includes(nomeArquivo) || nomeArquivo.includes(nomeCliente);
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

function obterMotivoArquivo(fileName, motivoPlanilha) {
  const name = normalizarTexto(fileName);
  if (name.includes('(NOVO)')) return 'Cliente Novo';
  if (name.includes('(AMT+TROCA)')) return 'Aumento+Troca';
  if (name.includes('(AMT)')) return 'Aumento+Troca';
  if (name.includes('(AM)')) return 'Aumento';
  if (name.includes('(RE)')) return 'Retirada de Empréstimo';
  if (name.includes('(RP)')) return 'Retirada Parcial';
  if (name.includes('(RT)')) return 'Retirada Total';
  if (name.includes('(TROCA)')) return 'Troca';

  const motivo = normalizarTexto(motivoPlanilha);
  if (motivo.includes('CLIENTE NOVO')) return 'Cliente Novo';
  if (motivo.includes('AUMENTO') && motivo.includes('TROCA')) return 'Aumento+Troca';
  if (motivo.includes('AUMENTO')) return 'Aumento';
  if (motivo.includes('EMPREST')) return 'Retirada de Empréstimo';
  if (motivo.includes('PARCIAL')) return 'Retirada Parcial';
  if (motivo.includes('TOTAL')) return 'Retirada Total';
  return 'Troca';
}
// === FUNÇÕES AUXILIARES ===

/**
 * Busca o último código da tabela de itens e retorna o próximo número.
 * @returns {Promise<string>} O próximo código como string.
 */
async function obterProximoCodigoItem() {
  const { data, error } = await supabaseClient
    .from('itens')
    .select('codigo')
    .limit(1000);

  if (error) {
    console.error('Erro ao obter o próximo código:', error);
    return null;
  }

  if (!data?.length) {
    return '1'; // Se não houver itens, começa com 1
  }

  const maiorCodigo = data.reduce((maior, item) => {
    const codigo = parseInt(item.codigo, 10);
    return Number.isFinite(codigo) ? Math.max(maior, codigo) : maior;
  }, 0);
  return String(maiorCodigo + 1);
}

// === ITENS ===

export async function carregarItens() {
  const corpoTabela = document.getElementById('corpoTabelaItens');
  corpoTabela.innerHTML = '';

  const { data, error } = await supabaseClient
    .from('itens')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    corpoTabela.innerHTML = '<tr><td colspan="4">Erro ao carregar itens.</td></tr>';
    console.error(error);
    return;
  }

  if (data.length === 0) {
    corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum item encontrado.</td></tr>';
    return;
  }

  itensCarregamento = data || [];

  data.forEach(item => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${item.codigo}</td>
      <td>${item.nome}</td>
      <td>${item.tipo}</td>
      <td>
        <button class="btn-icon edit" onclick="editarItem('${item.id}')" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="btn-icon delete" onclick="excluirItem('${item.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    corpoTabela.appendChild(linha);
  });
}

export async function salvarItem(event) {
  event.preventDefault();

  const id = document.getElementById('formItem').dataset.itemId;
  const nome = document.getElementById('nomeItem').value.trim();
  const tipo = document.getElementById('tipoItem').value;

  if (!nome || !tipo) {
    alert('⚠️ Preencha todos os campos.');
    return;
  }

  let codigo = document.getElementById('codigoItem').value.trim();

  if (id === '' && !codigo) { // Apenas gera código para novos itens
    codigo = await obterProximoCodigoItem();
    if (codigo === null) {
      alert('❌ Erro ao obter o próximo código.');
      return;
    }
  }
  let result;
  if (id) {
    // Update
    result = await supabaseClient
      .from('itens')
      .update({ nome, tipo })
      .eq('id', id);
  } else {
    // Insert
    result = await supabaseClient
      .from('itens')
      .insert([{ codigo, nome, tipo }]);
  }

  if (result.error) {
    alert('❌ Erro ao salvar item.');
    console.error(result.error);
    return;
  }

  alert('✅ Item salvo com sucesso!');
  document.getElementById('formItem').reset();
  document.getElementById('formItem').dataset.itemId = '';
  // Desabilitar campos após salvar
  document.getElementById('codigoItem').disabled = true;
  document.getElementById('nomeItem').disabled = true;
  document.getElementById('tipoItem').disabled = true;
  document.getElementById('btnSalvarItem').disabled = true;
  carregarItens();
}

export async function editarItem(id) {
  const { data, error } = await supabaseClient
    .from('itens')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    alert('❌ Erro ao carregar item.');
    return;
  }

  document.getElementById('codigoItem').value = data.codigo;
  document.getElementById('nomeItem').value = data.nome;
  document.getElementById('tipoItem').value = data.tipo;
  document.getElementById('formItem').dataset.itemId = data.id;

  // Habilitar campos para edição
  document.getElementById('codigoItem').disabled = false; // Código sempre desabilitado
  document.getElementById('nomeItem').disabled = false;
  document.getElementById('tipoItem').disabled = false;
  document.getElementById('btnSalvarItem').disabled = false;
}

export async function incluirItem() {
  // Limpar e preparar o formulário para um novo item
  document.getElementById('formItem').reset();
  document.getElementById('formItem').dataset.itemId = '';

  // Deixar o campo código em branco e habilitar para edição
  document.getElementById('codigoItem').value = '';
  document.getElementById('codigoItem').disabled = false; // Código editável conforme pedido
  document.getElementById('nomeItem').disabled = false;
  document.getElementById('tipoItem').disabled = false;
  document.getElementById('btnSalvarItem').disabled = false;
}

export async function excluirItem(id) {
  const confirmar = confirm('Tem certeza que deseja excluir este item?');

  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('itens')
    .delete()
    .eq('id', id);

  if (error) {
    alert('❌ Erro ao excluir item.');
    console.error(error);
    return;
  }

  alert('✅ Item excluído com sucesso!');
  carregarItens();
}

function encontrarItemRequisicao(nomeEquipamento, tipoEsperado = '') {
  const equipamento = normalizarBuscaImportacao(nomeEquipamento);
  if (!equipamento) return null;

  const candidatos = itensCarregamento
    .map(item => {
      const nome = normalizarBuscaImportacao(item.nome).replace(/\b(?:NOVO|USADO)\b/g, ' ').replace(/\s+/g, ' ').trim();
      const codigo = normalizarBuscaImportacao(item.codigo);
      let pontuacao = 0;
      if (nome === equipamento || codigo === equipamento) pontuacao = 100;
      if (nome.includes(equipamento) || equipamento.includes(nome)) pontuacao = Math.max(pontuacao, 70);
      if (tipoEsperado && normalizarTexto(item.tipo) === tipoEsperado) pontuacao += 20;
      return { item, pontuacao };
    })
    .filter(resultado => resultado.pontuacao >= 70)
    .sort((a, b) => b.pontuacao - a.pontuacao);

  return candidatos[0]?.item || null;
}

function obterTipoItemDaLinha(row) {
  const novo = normalizarTexto(row[3]) === 'X';
  const usado = normalizarTexto(row[4]) === 'X';
  if (novo && !usado) return 'NOVO';
  if (usado && !novo) return 'USADO';
  return '';
}

function renderizarTabelaStatusRequisicoesLegado() {
  const tbody = document.getElementById('corpoTabelaRequisicoes');
  if (!tbody) return;

  const filtroSupervisor = normalizarBusca(document.getElementById('filtroSupervisorRequisicao')?.value);
  const dados = requisicoesSalvas.filter(req => !filtroSupervisor || normalizarBusca(req.supervisor).includes(filtroSupervisor));

  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhuma requisição salva.</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(req => `
    <tr>
      <td>${escapeHtml(req.arquivo)}</td>
      <td>${escapeHtml(req.supervisor || '-')}</td>
      <td>${escapeHtml(req.cliente_nome || '-')}</td>
      <td>${escapeHtml(req.motivo)}</td>
      <td><span class="status-badge ${req.status === 'CARREGADO' ? 'carregado' : 'pendente'}">${escapeHtml(req.status || 'PENDENTE')}</span></td>
      <td>
        ${req.status === 'CARREGADO'
          ? '<span class="text-muted">Carregado</span>'
          : `<button type="button" class="btn-icon edit" data-carregar-requisicao="${escapeHtml(req.id)}" title="Carregar"><i class="fas fa-truck-loading"></i></button>`}
      </td>
    </tr>
  `).join('');
}

function renderizarTabelaStatusRequisicoes() {
  const tbody = document.getElementById('corpoTabelaRequisicoes');
  if (!tbody) return;

  const dados = requisicoesSalvas.filter(req => {
    const supervisorOk = !filtrosRequisicaoAplicados.supervisor || normalizarBusca(req.supervisor).includes(filtrosRequisicaoAplicados.supervisor);
    const dataOk = !filtrosRequisicaoAplicados.data || String(req.data_requisicao || '').slice(0, 10) === filtrosRequisicaoAplicados.data;
    const motivoOk = !filtrosRequisicaoAplicados.motivo || normalizarBusca(req.motivo).includes(filtrosRequisicaoAplicados.motivo);
    const statusOk = !filtrosRequisicaoAplicados.status || String(req.status || '').toUpperCase() === filtrosRequisicaoAplicados.status;
    return supervisorOk && dataOk && motivoOk && statusOk;
  });

  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="9">Nenhuma requisição salva.</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(req => `
    <tr>
      <td title="${escapeHtml(req.arquivo)}">${escapeHtml(req.arquivo)}</td>
      <td>${escapeHtml(formatarDataHora(req.created_at))}</td>
      <td title="${escapeHtml(req.usuario || '-')}">${escapeHtml(req.usuario || '-')}</td>
      <td>${escapeHtml(formatarData(req.data_requisicao))}</td>
      <td title="${escapeHtml(req.supervisor || '-')}">${escapeHtml(req.supervisor || '-')}</td>
      <td title="${escapeHtml(req.cliente_nome || '-')}">${escapeHtml(req.cliente_nome || '-')}</td>
      <td title="${escapeHtml(req.motivo)}">${escapeHtml(req.motivo)}</td>
      <td><span class="status-badge ${req.status === 'CARREGADO' ? 'carregado' : 'pendente'}">${escapeHtml(req.status || 'PENDENTE')}</span></td>
      <td class="actions-cell">
        <button type="button" class="btn-icon view" data-visualizar-requisicao="${escapeHtml(req.id)}" title="Visualizar"><i class="fas fa-eye"></i></button>
        <button type="button" class="btn-icon edit" data-editar-requisicao="${escapeHtml(req.id)}" title="Editar"><i class="fas fa-pen"></i></button>
        <button type="button" class="btn-icon delete" data-excluir-requisicao="${escapeHtml(req.id)}" title="Excluir"><i class="fas fa-trash"></i></button>
        ${req.status === 'CARREGADO' ? '' : `<button type="button" class="btn-icon edit" data-carregar-requisicao="${escapeHtml(req.id)}" title="Carregar"><i class="fas fa-truck-loading"></i></button>`}
      </td>
    </tr>
  `).join('');
}

function aplicarFiltrosRequisicao() {
  filtrosRequisicaoAplicados = {
    supervisor: normalizarBusca(document.getElementById('filtroSupervisorRequisicao')?.value),
    data: document.getElementById('filtroDataRequisicao')?.value || '',
    motivo: normalizarBusca(document.getElementById('filtroMotivoRequisicao')?.value),
    status: String(document.getElementById('filtroStatusRequisicao')?.value || '').trim().toUpperCase()
  };
  renderizarTabelaStatusRequisicoes();
}

function recalcularTotaisRequisicao() {
  const resumoDiv = document.getElementById('requisicaoResumo');
  if (!resumoDiv) return;

  const totais = requisicoesImportadas.reduce((acc, req) => {
    acc.requisicoes += 1;
    req.rows.forEach(row => {
      const qtd = Number(row[0]) || 0;
      if (MOTIVOS_QUE_ADICIONAM.includes(req.motivo)) acc.entrega += qtd;
      else acc.retorno += qtd;
    });
    return acc;
  }, { requisicoes: 0, entrega: 0, retorno: 0 });

  if (!totais.requisicoes) {
    resumoDiv.innerHTML = '';
    return;
  }

  resumoDiv.innerHTML = `
    <div class="resumo-section">
      <div class="resumo-card">
        <h3>Resumo</h3>
        <p><b>Requisições:</b> <span class="total">${totais.requisicoes}</span></p>
        <p><b>Entrega:</b> <span class="total">${totais.entrega}</span></p>
        <p><b>Retorno:</b> <span class="total">${totais.retorno}</span></p>
      </div>
    </div>
  `;
}

function renderizarCardsRequisicao() {
  const container = document.getElementById('requisicaoTables');
  if (!container) return;
  container.innerHTML = '';

  requisicoesImportadas.forEach((grid, gridIndex) => {
    let html = `<article class="arquivo-card"><h4><i class="fas fa-file-excel"></i> ${escapeHtml(grid.arquivo)}</h4>`;
    html += `<div class="arquivo-meta"><div class="motivo-box"><strong>Motivo:</strong> ${escapeHtml(grid.motivo)}</div>`;
    html += `<label class="cliente-box"><strong>Cliente:</strong> <input type="text" class="cliente-importacao-requisicao" data-grid="${gridIndex}" list="requisicaoClientesList" value="${escapeHtml(grid.cliente)}" placeholder="Código - Cliente" required>`;
    if (!encontrarCliente(grid.cliente)) {
      html += `<button type="button" class="btn-glass btn-green btn-cadastrar-cliente-requisicao" data-grid="${gridIndex}"><i class="fas fa-user-plus"></i> Cadastrar</button>`;
    }
    html += `<small class="cliente-origem">Status: ${escapeHtml(grid.status || 'PENDENTE')}</small></label>`;
    html += `<label class="ordem-box"><strong>Ordem:</strong> <input type="text" class="ordem-importacao-requisicao" data-grid="${gridIndex}" placeholder="0000" maxlength="4" value="${escapeHtml(grid.ordem || '')}"></label></div>`;
    html += `<div class="data-table"><table data-index="${gridIndex}"><thead><tr><th>QTD</th><th>EQUIP</th><th>MOD.</th><th>N</th><th>U</th></tr></thead><tbody>`;
    grid.rows.forEach((row, rowIndex) => {
      html += `<tr data-row="${rowIndex}">`;
      row.forEach((cell, cellIndex) => {
        const editable = cellIndex === 3 || cellIndex === 4;
        html += `<td contenteditable="${editable ? 'true' : 'false'}">${escapeHtml(cell)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div></article>';
    container.insertAdjacentHTML('beforeend', html);
  });

  renderizarTabelaStatusRequisicoes();
  recalcularTotaisRequisicao();
}

async function carregarRequisicoesBanco() {
  const { data, error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar requisições:', error);
    atualizarStatusRequisicao(`Erro ao carregar requisições salvas: ${error.message}`, true);
    return;
  }

  requisicoesSalvas = data || [];
  renderizarTabelaStatusRequisicoes();
}

async function carregarSupervisoresRequisicao() {
  const datalist = document.getElementById('supervisores-requisicao-list');
  if (!datalist) return;

  const { data, error } = await supabaseClient
    .from('supervisores')
    .select('nome, nome_completo, status')
    .eq('status', 'ATIVO')
    .order('nome');

  if (error) {
    console.error('Erro ao carregar supervisores da requisição:', error);
    return;
  }

  datalist.innerHTML = '';
  (data || []).forEach(supervisor => {
    const option = document.createElement('option');
    option.value = supervisor.nome || '';
    option.label = supervisor.nome_completo || '';
    datalist.appendChild(option);
  });
}

async function anexarArquivoRequisicao(file) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const nomeSeguro = String(file.name || 'requisicao.xlsx')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_');
  const path = `${timestamp}_${nomeSeguro}`;

  const { error } = await supabaseClient.storage
    .from(REQUISICOES_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false
    });

  if (error) throw error;

  return {
    arquivo_path: path,
    arquivo_tipo: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arquivo_tamanho: file.size || null
  };
}

async function abrirAnexoRequisicao(req) {
  if (!req?.arquivo_path) {
    alert('Esta requisição não possui arquivo anexado.');
    return;
  }

  const { data, error } = await supabaseClient.storage
    .from(REQUISICOES_BUCKET)
    .createSignedUrl(req.arquivo_path, 60);

  if (error) {
    console.error('Erro ao abrir anexo da requisição:', error);
    alert(`Não foi possível abrir o anexo: ${error.message}`);
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');
}

function encontrarRequisicaoSalva(id) {
  return requisicoesSalvas.find(req => String(req.id) === String(id));
}

function renderizarItensRequisicaoDetalhes(req) {
  const container = document.getElementById('requisicaoDetalhesItens');
  if (!container) return;

  const itens = Array.isArray(req?.itens) ? req.itens : [];
  if (!itens.length) {
    container.innerHTML = '<p class="text-muted">Nenhum item salvo para esta requisição.</p>';
    return;
  }

  container.innerHTML = `
    <table class="glass-table data-grid">
      <thead>
        <tr>
          <th>Qtd</th>
          <th>Equipamento</th>
          <th>Modelo</th>
          <th>Tipo</th>
        </tr>
      </thead>
      <tbody>
        ${itens.map(item => `
          <tr>
            <td>${escapeHtml(item.quantidade || '')}</td>
            <td>${escapeHtml(item.item_nome || item.equipamento || '')}</td>
            <td>${escapeHtml(item.modelo || '')}</td>
            <td>${escapeHtml(item.tipo || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function abrirModalRequisicaoDetalhes(id, modo = 'visualizar') {
  const req = encontrarRequisicaoSalva(id);
  if (!req) return;

  document.getElementById('requisicaoDetalhesId').value = req.id;
  document.getElementById('requisicaoDetalhesArquivo').value = req.arquivo || '';
  document.getElementById('requisicaoDetalhesStatus').value = req.status || 'PENDENTE';
  document.getElementById('requisicaoDetalhesData').value = req.data_requisicao || '';
  document.getElementById('requisicaoDetalhesSupervisor').value = req.supervisor || '';
  document.getElementById('requisicaoDetalhesCliente').value = req.cliente_nome || '';
  document.getElementById('requisicaoDetalhesMotivo').value = req.motivo || '';

  document.getElementById('tituloRequisicaoDetalhes').innerHTML = modo === 'editar'
    ? '<i class="fas fa-pen"></i> Editar Requisição'
    : '<i class="fas fa-eye"></i> Visualizar Requisição';

  document.getElementById('requisicaoDetalhesMeta').innerHTML = `
    <p><strong>Data/Hora:</strong> ${escapeHtml(formatarDataHora(req.created_at))}</p>
    <p><strong>Usuário:</strong> ${escapeHtml(req.usuario || '-')}</p>
    <p><strong>Anexo:</strong> ${escapeHtml(req.arquivo_path ? req.arquivo : 'Sem anexo')}</p>
  `;
  renderizarItensRequisicaoDetalhes(req);

  const editando = modo === 'editar';
  ['requisicaoDetalhesStatus', 'requisicaoDetalhesData', 'requisicaoDetalhesSupervisor', 'requisicaoDetalhesCliente', 'requisicaoDetalhesMotivo']
    .forEach(idCampo => {
      document.getElementById(idCampo).disabled = !editando;
    });
  document.getElementById('btnSalvarRequisicaoDetalhes').classList.toggle('hidden', !editando);
  document.getElementById('btnAbrirAnexoRequisicao').classList.toggle('hidden', !req.arquivo_path);
  document.getElementById('modalRequisicaoDetalhes')?.classList.remove('hidden');
}

function fecharModalRequisicaoDetalhes() {
  document.getElementById('modalRequisicaoDetalhes')?.classList.add('hidden');
}

async function salvarDetalhesRequisicao(event) {
  event.preventDefault();
  const id = document.getElementById('requisicaoDetalhesId').value;
  const payload = {
    status: document.getElementById('requisicaoDetalhesStatus').value,
    data_requisicao: document.getElementById('requisicaoDetalhesData').value || null,
    supervisor: document.getElementById('requisicaoDetalhesSupervisor').value.trim(),
    cliente_nome: document.getElementById('requisicaoDetalhesCliente').value.trim(),
    motivo: document.getElementById('requisicaoDetalhesMotivo').value.trim()
  };

  const { error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Erro ao editar requisição:', error);
    alert(`Não foi possível editar a requisição: ${error.message}`);
    return;
  }

  fecharModalRequisicaoDetalhes();
  await carregarRequisicoesBanco();
  atualizarStatusRequisicao('Requisição atualizada.');
}

async function excluirRequisicao(id) {
  const req = encontrarRequisicaoSalva(id);
  if (!req || !confirm(`Deseja excluir a requisição ${req.arquivo}?`)) return;

  const { error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir requisição:', error);
    alert(`Não foi possível excluir a requisição: ${error.message}`);
    return;
  }

  if (req.arquivo_path) {
    const { error: storageError } = await supabaseClient.storage.from(REQUISICOES_BUCKET).remove([req.arquivo_path]);
    if (storageError) console.warn('Requisição excluída, mas o anexo não foi removido:', storageError);
  }

  await carregarRequisicoesBanco();
  atualizarStatusRequisicao('Requisição excluída.');
}

async function salvarRequisicaoBanco(requisicao) {
  const cliente = encontrarCliente(requisicao.cliente) || encontrarClientePorDados(requisicao.clientePlanilha);
  const itens = requisicao.rows
    .filter(row => (Number(row[0]) || 0) > 0 && normalizarTexto(row[1]))
    .map(row => {
      const tipoEsperado = obterTipoItemDaLinha(row);
      const item = encontrarItemRequisicao(row[1], tipoEsperado);
      return {
        item_id: item?.id || null,
        item_nome: item ? `${item.codigo} - ${item.nome}` : String(row[1] || ''),
        equipamento: String(row[1] || '').trim(),
        modelo: String(row[2] || '').trim(),
        tipo: item?.tipo || '',
        quantidade: Number(row[0]) || 0,
        novo: normalizarTexto(row[3]) === 'X',
        usado: normalizarTexto(row[4]) === 'X'
      };
    });

  const payload = {
    arquivo: requisicao.arquivo,
    supervisor: requisicao.supervisor || '',
    cliente_codigo: cliente?.codigo || requisicao.clientePlanilha?.codigo || null,
    cliente_nome: cliente ? formatarCliente(cliente) : requisicao.cliente,
    motivo: requisicao.motivo,
    ordem: requisicao.ordem || null,
    data_requisicao: requisicao.dataRequisicao || null,
    usuario: requisicao.usuario || obterUsuarioAtualNome(),
    arquivo_path: requisicao.arquivoPath || null,
    arquivo_tipo: requisicao.arquivoTipo || null,
    arquivo_tamanho: requisicao.arquivoTamanho || null,
    status: 'PENDENTE',
    itens,
    linhas: requisicao.rows,
    cliente_planilha: requisicao.clientePlanilha || {}
  };

  const { error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .insert([payload]);

  if (error) {
    console.error('Erro ao salvar requisição no banco:', error, payload);
    throw error;
  }
}

async function marcarRequisicaoComoCarregada(id) {
  const { error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .update({ status: 'CARREGADO', carregado_em: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Erro ao carregar requisição:', error);
    alert(`Não foi possível carregar a requisição: ${error.message}`);
    return;
  }

  await carregarRequisicoesBanco();
  atualizarStatusRequisicao('Requisição marcada como CARREGADO.');
}

function salvarRequisicoesNoLocalStorage() {
  localStorage.setItem(REQUISICOES_PENDENTES_KEY, JSON.stringify({
    atualizado_em: new Date().toISOString(),
    cabecalho: obterCabecalhoRequisicao(),
    requisicoes: requisicoesImportadas
  }));
}

function obterCabecalhoRequisicao() {
  return {};
}

function prepararRascunhoCarregamento() {
  const cabecalho = obterCabecalhoRequisicao();
  const requisicoes = requisicoesImportadas.map(grid => {
    const cliente = encontrarCliente(grid.cliente) || encontrarClientePorDados(grid.clientePlanilha);
    return {
      cliente_nome: cliente ? formatarCliente(cliente) : grid.cliente,
      motivo: grid.motivo,
      ordem: grid.ordem || '',
      arquivo: grid.arquivo,
      status: grid.status,
      itens: grid.rows
        .filter(row => (Number(row[0]) || 0) > 0 && normalizarTexto(row[1]))
        .map(row => {
          const tipoEsperado = obterTipoItemDaLinha(row);
          const item = encontrarItemRequisicao(row[1], tipoEsperado);
          return {
            item_id: item?.id || null,
            item_nome: item ? `${item.codigo} - ${item.nome}` : String(row[1] || ''),
            modelo: String(row[2] || '').trim(),
            tipo: item?.tipo || '',
            quantidade: Number(row[0]) || 0
          };
        })
    };
  });

  return { versao: 1, criado_em: new Date().toISOString(), cabecalho, requisicoes };
}

function processarArquivoRequisicao(file) {
  const reader = new FileReader();
  reader.onload = async event => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = window.XLSX.read(data, { type: 'array' });
      const name = file.name.toUpperCase();
      const isNovo = name.includes('(NOVO)');
      const cfg = isNovo
        ? { sheet: 'REQUERIMENTO', motivoCell: 'K9', clienteCell: 'D6', cidadeCell: 'D7', supervisorCell: 'D9', dataCell: 'K7', estadoSheet: 'CADASTRO NOVO', estadoCell: 'N21', startRow: 13, endRow: 23, startCol: 2, endCol: 6, filterQtd: true }
        : { sheet: 'REQUERIMENTO MANUAL', motivoCell: 'K8', clienteCell: 'C4', cidadeCell: 'C5', supervisorCell: 'C7', dataCell: 'K6', startRow: 11, endRow: 21, startCol: 1, endCol: 5, filterQtd: false };

      if (!workbook.SheetNames.includes(cfg.sheet)) {
        atualizarStatusRequisicao(`O arquivo ${file.name} não possui a aba "${cfg.sheet}".`, true);
        return;
      }

      const sheet = workbook.Sheets[cfg.sheet];
      const motivoPlanilha = String(sheet[cfg.motivoCell]?.v || sheet.I11?.v || '').trim();
      const supervisorPlanilha = String(sheet[cfg.supervisorCell]?.v || '').trim();
      const dataRequisicao = converterDataExcelParaIso(sheet[cfg.dataCell], workbook);
      const dadosClientePlanilha = extrairClienteCelula(sheet[cfg.clienteCell]?.v);
      const cidadePlanilha = String(sheet[cfg.cidadeCell]?.v || '').trim();
      const estadoSheet = cfg.estadoSheet ? workbook.Sheets[cfg.estadoSheet] : null;
      const estadoPlanilha = String(estadoSheet?.[cfg.estadoCell]?.v || '').trim().toUpperCase();
      const rows = [];

      for (let r = cfg.startRow; r <= cfg.endRow; r += 1) {
        const linha = [];
        for (let c = cfg.startCol; c <= cfg.endCol; c += 1) {
          const cell = sheet[window.XLSX.utils.encode_cell({ r: r - 1, c })];
          linha.push(cell ? cell.v : '');
        }
        const qtd = Number(linha[0]) || 0;
        if (cfg.filterQtd && qtd <= 0) continue;
        linha[1] = normalizeEquipment(linha[1]);
        if (linha.some(value => value !== '')) rows.push(linha);
      }

      const clienteSugerido = encontrarClientePorDados(dadosClientePlanilha) || encontrarClientePorArquivo(file.name);
      const clientePendente = dadosClientePlanilha.codigo && dadosClientePlanilha.nome
        ? `${dadosClientePlanilha.codigo} - ${dadosClientePlanilha.nome}`
        : dadosClientePlanilha.nome;

      const anexo = await anexarArquivoRequisicao(file);
      const requisicao = {
        arquivo: file.name,
        supervisor: supervisorPlanilha,
        motivo: obterMotivoArquivo(file.name, motivoPlanilha),
        cliente: formatarCliente(clienteSugerido) || clientePendente,
        clientePlanilha: { ...dadosClientePlanilha, cidade: cidadePlanilha, estado: estadoPlanilha },
        dataRequisicao,
        usuario: obterUsuarioAtualNome(),
        arquivoPath: anexo.arquivo_path,
        arquivoTipo: anexo.arquivo_tipo,
        arquivoTamanho: anexo.arquivo_tamanho,
        rows,
        ordem: '',
        status: 'PENDENTE'
      };

      requisicoesImportadas.push(requisicao);
      await salvarRequisicaoBanco(requisicao);
      await carregarRequisicoesBanco();
      atualizarStatusRequisicao(`${file.name} importado e salvo como PENDENTE.`);
    } catch (error) {
      console.error('Erro ao processar XLSX:', error);
      atualizarStatusRequisicao(`Erro ao processar o arquivo ${file.name}: ${error.message || error.details || 'verifique o console.'}`, true);
    }
  };
  reader.onerror = () => atualizarStatusRequisicao(`Erro ao ler o arquivo ${file.name}.`, true);
  reader.readAsArrayBuffer(file);
}

function handleRequisicaoFileUpload(event) {
  const files = Array.from(event.target.files || []);
  const selectionText = document.getElementById('requisicaoFileSelectionText');
  if (selectionText) {
    selectionText.textContent = files.length
      ? `${files.length} ${files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}`
      : 'Nenhum arquivo selecionado';
  }
  requisicoesImportadas = [];
  atualizarStatusRequisicao(files.length ? 'Processando arquivos...' : '');
  files.forEach(processarArquivoRequisicao);
  if (files.length) fecharModalImportarRequisicao();
  event.target.value = '';
}

function abrirModalImportarRequisicao() {
  const modal = document.getElementById('modalImportarRequisicao');
  const selectionText = document.getElementById('requisicaoFileSelectionText');
  if (selectionText) selectionText.textContent = 'Nenhum arquivo selecionado';
  modal?.classList.remove('hidden');
}

function fecharModalImportarRequisicao() {
  document.getElementById('modalImportarRequisicao')?.classList.add('hidden');
}

function salvarRequisicoesPendentes() {
  if (!requisicoesImportadas.length) {
    alert('Importe pelo menos uma requisição antes de salvar.');
    return;
  }
  requisicoesImportadas = requisicoesImportadas.map(req => ({ ...req, status: 'PENDENTE' }));
  salvarRequisicoesNoLocalStorage();
  renderizarCardsRequisicao();
  atualizarStatusRequisicao(`${requisicoesImportadas.length} requisição(ões) salva(s) como PENDENTE.`);
}

function carregarRequisicoesPendentes() {
  if (!requisicoesImportadas.length) {
    alert('Importe e salve pelo menos uma requisição antes de carregar.');
    return;
  }
  requisicoesImportadas = requisicoesImportadas.map(req => ({ ...req, status: 'CARREGADO' }));
  salvarRequisicoesNoLocalStorage();
  localStorage.setItem(IMPORTACAO_CARREGAMENTO_KEY, JSON.stringify(prepararRascunhoCarregamento()));
  renderizarCardsRequisicao();
  atualizarStatusRequisicao(`${requisicoesImportadas.length} requisição(ões) marcada(s) como CARREGADO.`);
}

function abrirCadastroClienteRequisicao(gridIndex) {
  const grid = requisicoesImportadas[gridIndex];
  if (!grid) return;

  document.getElementById('clienteRequisicaoGridIndex').value = String(gridIndex);
  document.getElementById('clienteCodigoRequisicao').value = grid.clientePlanilha?.codigo || '';
  document.getElementById('clienteNomeRequisicao').value = grid.clientePlanilha?.nome || '';
  document.getElementById('clienteCidadeRequisicao').value = grid.clientePlanilha?.cidade || '';
  document.getElementById('clienteEstadoRequisicao').value = grid.clientePlanilha?.estado || '';
  document.getElementById('modalCadastroClienteRequisicao').classList.remove('hidden');
}

function fecharCadastroClienteRequisicao() {
  document.getElementById('modalCadastroClienteRequisicao').classList.add('hidden');
  document.getElementById('formCadastroClienteRequisicao').reset();
  document.getElementById('clienteRequisicaoGridIndex').value = '';
}

async function salvarClienteRequisicao(event) {
  event.preventDefault();

  const gridIndex = Number(document.getElementById('clienteRequisicaoGridIndex').value);
  const codigo = document.getElementById('clienteCodigoRequisicao').value.trim();
  const nome = document.getElementById('clienteNomeRequisicao').value.trim();
  const municipio = document.getElementById('clienteCidadeRequisicao').value.trim();
  const uf = document.getElementById('clienteEstadoRequisicao').value.trim().toUpperCase();

  if (!codigo || !nome || !municipio || !uf) {
    alert('Preencha código, nome, cidade e estado.');
    return;
  }

  const existente = encontrarClientePorDados({ codigo, nome });
  if (existente) {
    requisicoesImportadas[gridIndex].cliente = formatarCliente(existente);
    fecharCadastroClienteRequisicao();
    salvarRequisicoesNoLocalStorage();
    renderizarCardsRequisicao();
    return;
  }

  const { data, error } = await supabaseClient
    .from('clientes')
    .insert([{ codigo, nome, municipio, uf, ativo: 'A' }])
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao cadastrar cliente da requisição:', error);
    alert(`Não foi possível cadastrar o cliente: ${error.message}`);
    return;
  }

  clientesCarregamento.push(data);
  clientesCarregamento.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  atualizarDatalistRequisicaoClientes();
  requisicoesImportadas[gridIndex].cliente = formatarCliente(data);
  fecharCadastroClienteRequisicao();
  salvarRequisicoesNoLocalStorage();
  renderizarCardsRequisicao();
}

async function preencherDatalistRequisicao(id, tabela, select, filtro = null) {
  const datalist = document.getElementById(id);
  if (!datalist) return;
  let query = supabaseClient.from(tabela).select(select).order(select.split(',')[0].trim());
  if (filtro) query = filtro(query);
  const { data, error } = await query;
  if (error) {
    console.error(`Erro ao carregar ${tabela}:`, error);
    return;
  }
  datalist.innerHTML = '';
  (data || []).forEach(item => {
    const option = document.createElement('option');
    option.value = item.placa || item.nome || '';
    option.label = item.modelo || item.nome_completo || '';
    datalist.appendChild(option);
  });
}

export async function inicializarRequisicao() {
  if (!document.getElementById('requisicaoFileUpload')) return;
  document.getElementById('btnImportarRequisicao')?.addEventListener('click', abrirModalImportarRequisicao);
  document.getElementById('btnFecharImportarRequisicao')?.addEventListener('click', fecharModalImportarRequisicao);
  document.getElementById('btnCancelarImportarRequisicao')?.addEventListener('click', fecharModalImportarRequisicao);
  document.getElementById('modalImportarRequisicao')?.addEventListener('click', event => {
    if (event.target.id === 'modalImportarRequisicao') fecharModalImportarRequisicao();
  });
  document.getElementById('requisicaoFileUpload')?.addEventListener('change', handleRequisicaoFileUpload);
  document.getElementById('btnBuscarRequisicoes')?.addEventListener('click', aplicarFiltrosRequisicao);
  ['filtroSupervisorRequisicao', 'filtroDataRequisicao', 'filtroMotivoRequisicao', 'filtroStatusRequisicao'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        aplicarFiltrosRequisicao();
      }
    });
  });
  document.getElementById('btnFecharRequisicaoDetalhes')?.addEventListener('click', fecharModalRequisicaoDetalhes);
  document.getElementById('btnCancelarRequisicaoDetalhes')?.addEventListener('click', fecharModalRequisicaoDetalhes);
  document.getElementById('formRequisicaoDetalhes')?.addEventListener('submit', salvarDetalhesRequisicao);
  document.getElementById('btnAbrirAnexoRequisicao')?.addEventListener('click', () => {
    const id = document.getElementById('requisicaoDetalhesId')?.value;
    abrirAnexoRequisicao(encontrarRequisicaoSalva(id));
  });
  document.getElementById('modalRequisicaoDetalhes')?.addEventListener('click', event => {
    if (event.target.id === 'modalRequisicaoDetalhes') fecharModalRequisicaoDetalhes();
  });
  document.getElementById('corpoTabelaRequisicoes')?.addEventListener('click', event => {
    const visualizar = event.target.closest('[data-visualizar-requisicao]');
    const editar = event.target.closest('[data-editar-requisicao]');
    const excluir = event.target.closest('[data-excluir-requisicao]');
    const carregar = event.target.closest('[data-carregar-requisicao]');

    if (visualizar) abrirModalRequisicaoDetalhes(visualizar.dataset.visualizarRequisicao, 'visualizar');
    if (editar) abrirModalRequisicaoDetalhes(editar.dataset.editarRequisicao, 'editar');
    if (excluir) excluirRequisicao(excluir.dataset.excluirRequisicao);
    if (carregar) marcarRequisicaoComoCarregada(carregar.dataset.carregarRequisicao);
  });

  await Promise.all([
    carregarSupervisoresRequisicao(),
    carregarRequisicoesBanco()
  ]);
}

// === CLIENTES ===

export async function carregarClientes() {
  const corpoTabela = document.getElementById('corpoTabelaClientes');
  corpoTabela.innerHTML = '';

  try {
    clientesCarregamento = await buscarTodosClientesCarregamento();
  } catch (error) {
    corpoTabela.innerHTML = '<tr><td colspan="7">Erro ao carregar clientes.</td></tr>';
    console.error(error);
    return;
  }

  atualizarContadorClientesAtivos();
  atualizarDatalistRequisicaoClientes();
  renderizarClientes(clientesCarregamento);
}

async function buscarTodosClientesCarregamento() {
  const todos = [];
  const tamanhoPagina = 1000;

  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await supabaseClient
      .from('clientes')
      .select('*')
      .order('codigo', { ascending: true })
      .range(inicio, inicio + tamanhoPagina - 1);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < tamanhoPagina) break;
  }

  return todos;
}

async function obterProximoCodigoCliente() {
  const maiorLocal = clientesCarregamento.reduce((maior, cliente) => {
    const numero = Number(String(cliente.codigo || '').replace(/\D/g, ''));
    return Number.isFinite(numero) ? Math.max(maior, numero) : maior;
  }, 0);

  let maiorBanco = maiorLocal;
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('codigo')
    .order('codigo', { ascending: false })
    .limit(200);
  if (error) throw error;

  (data || []).forEach(cliente => {
    const numero = Number(String(cliente.codigo || '').replace(/\D/g, ''));
    if (Number.isFinite(numero)) maiorBanco = Math.max(maiorBanco, numero);
  });

  return String(maiorBanco + 1);
}

function atualizarContadorClientesAtivos() {
  const contador = document.getElementById('contadorClientesAtivos');
  if (!contador) return;
  contador.textContent = String(clientesCarregamento.filter(clienteEstaAtivo).length);
}

function renderizarClientes(clientes) {
  const corpoTabela = document.getElementById('corpoTabelaClientes');
  corpoTabela.innerHTML = '';

  if (!clientes.length) {
    corpoTabela.innerHTML = '<tr><td colspan="7">Nenhum cliente encontrado.</td></tr>';
    return;
  }

  clientes.forEach(cliente => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${escapeHtml(cliente.codigo)}</td>
      <td>${escapeHtml(cliente.nome)}</td>
      <td>${escapeHtml(cliente.fantasia)}</td>
      <td>${escapeHtml(cliente.cnpj_cpf)}</td>
      <td>${escapeHtml(cliente.municipio)}</td>
      <td>${escapeHtml(cliente.uf)}</td>
      <td>
        <button class="btn-icon edit" onclick="editarCliente('${cliente.id}')" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="btn-icon delete" onclick="excluirCliente('${cliente.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    corpoTabela.appendChild(linha);
  });
}

export function filtrarClientes() {
  const termo = normalizarBusca(document.getElementById('buscaClientesCarregamento')?.value);
  if (!termo) {
    renderizarClientes(clientesCarregamento);
    return;
  }

  const filtrados = clientesCarregamento.filter(cliente => [
    cliente.codigo,
    cliente.nome,
    cliente.fantasia,
    cliente.cnpj_cpf
  ].some(valor => normalizarBusca(valor).includes(termo)));

  renderizarClientes(filtrados);
}

export async function abrirModalCliente(cliente = null) {
  const form = document.getElementById('formCliente');
  form.reset();
  form.dataset.clienteId = cliente?.id || '';
  document.getElementById('tituloModalCliente').innerHTML = cliente
    ? '<i class="fas fa-user-edit"></i> Editar Cliente'
    : '<i class="fas fa-user-plus"></i> Incluir Cliente';

  if (cliente) {
    preencherFormularioCliente(cliente);
  } else {
    document.getElementById('clienteAtivo').value = 'A';
    try {
      document.getElementById('clienteCodigo').value = await obterProximoCodigoCliente();
    } catch (error) {
      console.error('Erro ao calcular proximo codigo de cliente:', error);
      document.getElementById('clienteCodigo').value = '';
      alert('Nao foi possivel calcular o proximo codigo do cliente.');
    }
  }

  form.classList.remove('hidden');
  form.setAttribute('aria-hidden', 'false');
  document.getElementById('clienteFantasia').focus();
}

function preencherFormularioCliente(cliente) {
  const valores = {
    clienteCodigo: cliente.codigo,
    clienteFantasia: cliente.fantasia,
    clienteNome: cliente.nome,
    clienteTipoPessoa: cliente.tipo_pessoa,
    clienteUf: cliente.uf,
    clienteMunicipio: cliente.municipio,
    clienteEndereco: cliente.endereco,
    clienteGeolocalizacao: cliente.geolocalizacao,
    clienteBairro: cliente.bairro,
    clienteCep: cliente.cep,
    clienteEmail: cliente.email,
    clienteCnpjCpf: cliente.cnpj_cpf,
    clienteIeRg: cliente.ie_rg,
    clienteCondPagto: cliente.cond_pagto,
    clienteFormaCob: cliente.forma_cob,
    clienteAtivo: cliente.ativo || 'A',
    clienteSupervisor: cliente.supervisor,
    clienteRota: cliente.rota,
    clienteConsultor: cliente.consultor,
    clienteTabelaPreco: cliente.tabela_preco,
    clienteCategoria: cliente.categoria
  };

  Object.entries(valores).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? '';
  });
}

export function limparFormularioCliente() {
  const form = document.getElementById('formCliente');
  const codigo = document.getElementById('clienteCodigo').value;
  form.reset();
  form.dataset.clienteId = '';
  document.getElementById('clienteCodigo').value = codigo;
  document.getElementById('clienteAtivo').value = 'A';
  document.getElementById('clienteFantasia').focus();
}

export function fecharModalCliente() {
  const form = document.getElementById('formCliente');
  form.classList.add('hidden');
  form.setAttribute('aria-hidden', 'true');
  form.reset();
  form.dataset.clienteId = '';
}

export async function salvarCliente(event) {
  return salvarClienteCompleto(event);
  event.preventDefault();

  const formData = new FormData(document.getElementById('formCliente'));
  const agora = new Date().toISOString();
  const cliente = {
    codigo: normalizeCodigo(formData.get('codigo')),
    fantasia: cleanCell(formData.get('fantasia')),
    nome: cleanCell(formData.get('nome')),
    tipo_pessoa: cleanCell(formData.get('tipo_pessoa')).toUpperCase(),
    uf: cleanCell(formData.get('uf')).toUpperCase(),
    municipio: cleanCell(formData.get('municipio')),
    endereco: cleanCell(formData.get('endereco')),
    geolocalizacao: cleanCell(formData.get('geolocalizacao')),
    bairro: cleanCell(formData.get('bairro')),
    cep: cleanCell(formData.get('cep')),
    email: cleanCell(formData.get('email')),
    cnpj_cpf: cleanCell(formData.get('cnpj_cpf')),
    ie_rg: cleanCell(formData.get('ie_rg')),
    cond_pagto: cleanCell(formData.get('cond_pagto')),
    forma_cob: cleanCell(formData.get('forma_cob')),
    ativo: cleanCell(formData.get('ativo')).toUpperCase() || 'A',
    supervisor: cleanCell(formData.get('supervisor')),
    consultor: cleanCell(formData.get('consultor')),
    tabela_preco: cleanCell(formData.get('tabela_preco')),
    categoria: cleanCell(formData.get('categoria')),
    origem_arquivo: 'Cadastro manual',
    importado_em: agora,
    updated_at: agora
  };
  const rota = normalizarRota(formData.get('rota'));

  if (!cliente.codigo) {
    alert('⚠️ Preencha todos os campos.');
    document.getElementById('clienteCodigo')?.focus();
    return;
  }

  let result;
  if (id) {
    // Update
    result = await supabaseClient
      .from('clientes')
      .update({ codigo, nome, fantasia, cnpj_cpf, municipio: cidade, uf: estado })
      .eq('id', id);
  } else {
    // Insert
    result = await supabaseClient
      .from('clientes')
      .insert([{ codigo, nome, fantasia, cnpj_cpf, municipio: cidade, uf: estado, ativo: 'A' }]);
  }

  if (result.error) {
    alert('❌ Erro ao salvar cliente.');
    console.error(result.error);
    return;
  }

  alert('✅ Cliente salvo com sucesso!');
  fecharModalCliente();
  await carregarClientes();
  filtrarClientes();
}

export async function salvarClienteCompleto(event) {
  event.preventDefault();

  const formData = new FormData(document.getElementById('formCliente'));
  const agora = new Date().toISOString();
  const cliente = {
    codigo: normalizeCodigo(formData.get('codigo')),
    fantasia: cleanCell(formData.get('fantasia')),
    nome: cleanCell(formData.get('nome')),
    tipo_pessoa: cleanCell(formData.get('tipo_pessoa')).toUpperCase(),
    uf: cleanCell(formData.get('uf')).toUpperCase(),
    municipio: cleanCell(formData.get('municipio')),
    endereco: cleanCell(formData.get('endereco')),
    geolocalizacao: cleanCell(formData.get('geolocalizacao')),
    bairro: cleanCell(formData.get('bairro')),
    cep: cleanCell(formData.get('cep')),
    email: cleanCell(formData.get('email')),
    cnpj_cpf: cleanCell(formData.get('cnpj_cpf')),
    ie_rg: cleanCell(formData.get('ie_rg')),
    cond_pagto: cleanCell(formData.get('cond_pagto')),
    forma_cob: cleanCell(formData.get('forma_cob')),
    ativo: cleanCell(formData.get('ativo')).toUpperCase() || 'A',
    supervisor: cleanCell(formData.get('supervisor')),
    consultor: cleanCell(formData.get('consultor')),
    tabela_preco: cleanCell(formData.get('tabela_preco')),
    categoria: cleanCell(formData.get('categoria')),
    origem_arquivo: 'Cadastro manual',
    importado_em: agora,
    updated_at: agora
  };
  const rota = normalizarRota(formData.get('rota'));

  if (!cliente.codigo) {
    alert('Informe o codigo do cliente.');
    document.getElementById('clienteCodigo')?.focus();
    return;
  }

  const btn = document.getElementById('btnSalvarCliente');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const { error: clienteError } = await supabaseClient
      .from('clientes')
      .upsert([cliente], { onConflict: 'codigo' });
    if (clienteError) throw clienteError;

    if (rota) {
      const { error: rotaError } = await supabaseClient
        .from('cliente_rotas')
        .upsert([{
          cliente_codigo: cliente.codigo,
          rota,
          supervisor: cliente.supervisor,
          consultor: cliente.consultor,
          ativo: cliente.ativo,
          origem_arquivo: cliente.origem_arquivo,
          importado_em: agora,
          updated_at: agora
        }], { onConflict: 'cliente_codigo,rota' });
      if (rotaError) throw rotaError;
    }

    alert('Cliente salvo com sucesso!');
    fecharModalCliente();
    await carregarClientes();
    filtrarClientes();
  } catch (error) {
    console.error('Erro ao salvar cliente:', error);
    alert(`Erro ao salvar cliente: ${error.message || 'verifique os dados e tente novamente.'}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
  }
}

export async function editarCliente(id) {
  const cliente = clientesCarregamento.find(item => String(item.id) === String(id));

  if (!cliente) {
    alert('❌ Erro ao carregar cliente.');
    return;
  }

  abrirModalCliente(cliente);
}

export async function excluirCliente(id) {
  const confirmar = confirm('Tem certeza que deseja excluir este cliente?');

  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('clientes')
    .delete()
    .eq('id', id);

  if (error) {
    alert('❌ Erro ao excluir cliente.');
    console.error(error);
    return;
  }

  alert('✅ Cliente excluído com sucesso!');
  await carregarClientes();
  filtrarClientes();
}

// === MOTORISTAS ===

export async function carregarMotoristas() {
  const corpoTabela = document.getElementById('corpoTabelaMotoristas');
  corpoTabela.innerHTML = '';

  const { data, error } = await supabaseClient
    .from('motoristas')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    corpoTabela.innerHTML = '<tr><td colspan="3">Erro ao carregar motoristas.</td></tr>';
    console.error(error);
    return;
  }

  if (data.length === 0) {
    corpoTabela.innerHTML = '<tr><td colspan="3">Nenhum motorista encontrado.</td></tr>';
    return;
  }

  data.forEach(motorista => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${motorista.nome}</td>
      <td>${motorista.nome_completo || ''}</td>
      <td>
        <button class="btn-icon edit" onclick="editarMotorista('${motorista.id}')" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="btn-icon delete" onclick="excluirMotorista('${motorista.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    corpoTabela.appendChild(linha);
  });
}

export async function salvarMotorista(event) {
  event.preventDefault();

  const id = document.getElementById('formMotorista').dataset.motoristaId;
  const nome = document.getElementById('nomeMotorista').value.trim();
  const nome_completo = document.getElementById('nomeCompletoMotorista').value.trim();

  if (!nome) {
    alert('⚠️ O campo "Nome" é obrigatório.');
    return;
  }

  let result;
  if (id) {
    // Update
    result = await supabaseClient
      .from('motoristas')
      .update({ nome, nome_completo })
      .eq('id', id);
  } else {
    // Insert
    result = await supabaseClient
      .from('motoristas')
      .insert([{ nome, nome_completo }]);
  }

  if (result.error) {
    alert('❌ Erro ao salvar motorista.');
    console.error(result.error);
    return;
  }

  alert('✅ Motorista salvo com sucesso!');
  document.getElementById('formMotorista').reset();
  document.getElementById('formMotorista').dataset.motoristaId = '';
  carregarMotoristas();
}

export async function editarMotorista(id) {
  const { data, error } = await supabaseClient
    .from('motoristas')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    alert('❌ Erro ao carregar dados do motorista.');
    return;
  }

  document.getElementById('nomeMotorista').value = data.nome;
  document.getElementById('nomeCompletoMotorista').value = data.nome_completo;
  document.getElementById('formMotorista').dataset.motoristaId = data.id;

  // Foca no formulário para facilitar a edição
  document.getElementById('nomeMotorista').focus();
}

export async function excluirMotorista(id) {
  const confirmar = confirm('Tem certeza que deseja excluir este motorista?');

  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('motoristas')
    .delete()
    .eq('id', id);

  if (error) {
    alert('❌ Erro ao excluir motorista.');
    console.error(error);
    return;
  }

  alert('✅ Motorista excluído com sucesso!');
  carregarMotoristas();
}
