import { supabaseClient } from './supabase.js';

const MOTIVOS_QUE_ADICIONAM = ['Aumento', 'Aumento+Troca', 'Cliente Novo'];
const REQUISICOES_TABLE   = 'requisicoes_carregamento';
const CONFERENCIAS_TABLE  = 'conferencias_carregamento';
const REQUISICOES_BUCKET  = 'requisicoes-carregamento';

let clientesCarregamento = [];
let itensCarregamento = [];
let modelosItensCarregamento = [];
let requisicoesImportadas = [];
let requisicoesSalvas = [];
let requisicaoVinculoCarregamentoId = null;
let carregamentosVinculoRequisicao = [];
let filtrosRequisicaoAplicados = {
  supervisor: '',
  data: '',
  motivo: '',
  status: ''
};

let sortRequisicao = { col: null, dir: 'asc' };

function ordenarRequisicoes(lista) {
  if (!sortRequisicao.col) return lista;
  const col = sortRequisicao.col;
  const dateCols = new Set(['created_at', 'data_requisicao']);
  return [...lista].sort((a, b) => {
    const av = String(a[col] ?? '');
    const bv = String(b[col] ?? '');
    const cmp = dateCols.has(col)
      ? av.localeCompare(bv)
      : av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' });
    return sortRequisicao.dir === 'asc' ? cmp : -cmp;
  });
}

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
  await carregarModelosItens();
  itensCarregamento = itensCarregamento.map(item => ({
    ...item,
    modelos: modelosItensCarregamento.filter(modelo => String(modelo.item_id) === String(item.id))
  }));

  itensCarregamento.forEach(item => {
    const modelos = item.modelos || [];
    const modelosHtml = modelos.length
      ? modelos.map(m => m.padrao
          ? `<span class="modelo-chip modelo-chip-padrao"><i class="fas fa-star"></i> ${escapeHtml(m.modelo)}</span>`
          : `<span class="modelo-chip">${escapeHtml(m.modelo)}</span>`
        ).join('')
      : '<span class="modelo-chip-vazio">-</span>';
    const modelosTitle = modelos.map(m => (m.padrao ? '★ ' : '') + m.modelo).join(', ');
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${escapeHtml(item.codigo)}</td>
      <td>${escapeHtml(item.nome)}</td>
      <td title="${escapeHtml(modelosTitle)}" class="col-modelos-chips">${modelosHtml}</td>
      <td>
        <button class="btn-icon edit" onclick="editarItem('${item.id}')" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="btn-icon carregar" onclick="abrirModelosItem('${item.id}')" title="Cadastrar modelos"><i class="fas fa-tags"></i></button>
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

  if (!nome) {
    alert('⚠️ Preencha o nome do item.');
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
      .update({ nome })
      .eq('id', id);
  } else {
    // Insert
    result = await supabaseClient
      .from('itens')
      .insert([{ codigo, nome }]);
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
  document.getElementById('formItem').dataset.itemId = data.id;

  document.getElementById('codigoItem').disabled = false;
  document.getElementById('nomeItem').disabled = false;
  document.getElementById('btnSalvarItem').disabled = false;
}

export async function incluirItem() {
  // Limpar e preparar o formulário para um novo item
  document.getElementById('formItem').reset();
  document.getElementById('formItem').dataset.itemId = '';

  // Deixar o campo código em branco e habilitar para edição
  document.getElementById('codigoItem').value = '';
  document.getElementById('codigoItem').disabled = false;
  document.getElementById('nomeItem').disabled = false;
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

async function carregarModelosItens() {
  const { data, error } = await supabaseClient
    .from('item_modelos')
    .select('*')
    .order('modelo', { ascending: true });

  if (error) {
    console.error('Erro ao carregar modelos dos itens:', error);
    modelosItensCarregamento = [];
    return;
  }

  modelosItensCarregamento = data || [];
}

function fecharModelosItem() {
  document.getElementById('modalModelosItem')?.classList.add('hidden');
  document.getElementById('modeloItemId').value = '';
  document.getElementById('modeloItemNome').value = '';
}

function renderizarModelosItem(item) {
  const lista = document.getElementById('listaModelosItem');
  const info = document.getElementById('modeloItemInfo');
  if (!lista || !info || !item) return;

  info.innerHTML = `<strong>${escapeHtml(item.codigo)} - ${escapeHtml(item.nome)}</strong>`;
  const modelos = modelosItensCarregamento.filter(modelo => String(modelo.item_id) === String(item.id));

  if (!modelos.length) {
    lista.innerHTML = '<div class="modelo-empty">Nenhum modelo cadastrado para este item.</div>';
    return;
  }

  lista.innerHTML = modelos.map(modelo => `
    <span class="modelo-tag ${modelo.padrao ? 'modelo-tag-padrao' : ''}">
      <button type="button" data-padrao-modelo-item="${escapeHtml(String(modelo.id))}" title="${modelo.padrao ? 'Padrão definido' : 'Definir como padrão'}" class="btn-modelo-padrao ${modelo.padrao ? 'is-padrao' : ''}">
        <i class="${modelo.padrao ? 'fas' : 'far'} fa-star"></i>
      </button>
      ${escapeHtml(modelo.modelo)}
      <button type="button" data-excluir-modelo-item="${escapeHtml(String(modelo.id))}" title="Excluir modelo">
        <i class="fas fa-times"></i>
      </button>
    </span>
  `).join('');
}

export async function abrirModelosItem(id) {
  const item = itensCarregamento.find(registro => String(registro.id) === String(id));
  if (!item) return;

  document.getElementById('modeloItemId').value = item.id;
  document.getElementById('modeloItemNome').value = '';
  renderizarModelosItem(item);
  document.getElementById('modalModelosItem')?.classList.remove('hidden');
  document.getElementById('modeloItemNome')?.focus();
}

export async function adicionarModeloItem() {
  const itemId = document.getElementById('modeloItemId')?.value;
  const modelo = cleanCell(document.getElementById('modeloItemNome')?.value).toUpperCase();
  if (!itemId || !modelo) return;

  const { error } = await supabaseClient
    .from('item_modelos')
    .upsert([{ item_id: itemId, modelo }], { onConflict: 'item_id,modelo' });

  if (error) {
    console.error('Erro ao salvar modelo do item:', error);
    alert(`Erro ao salvar modelo: ${error.message}`);
    return;
  }

  document.getElementById('modeloItemNome').value = '';
  await carregarItens();
  const item = itensCarregamento.find(registro => String(registro.id) === String(itemId));
  renderizarModelosItem(item);
  document.getElementById('modeloItemNome')?.focus();
}

export async function excluirModeloItem(id) {
  const itemId = document.getElementById('modeloItemId')?.value;
  const { error } = await supabaseClient
    .from('item_modelos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir modelo do item:', error);
    alert(`Erro ao excluir modelo: ${error.message}`);
    return;
  }

  await carregarItens();
  const item = itensCarregamento.find(registro => String(registro.id) === String(itemId));
  renderizarModelosItem(item);
}

export async function marcarModeloPadrao(modeloId) {
  const itemId = document.getElementById('modeloItemId')?.value;
  if (!itemId || !modeloId) return;

  const modeloAtual = modelosItensCarregamento.find(m => String(m.id) === String(modeloId));
  if (modeloAtual?.padrao) {
    // Clicou no padrão atual → remove o padrão
    const { error } = await supabaseClient
      .from('item_modelos')
      .update({ padrao: false })
      .eq('id', modeloId);
    if (error) { alert(`Erro: ${error.message}`); return; }
  } else {
    // Define o novo padrão: limpa os demais e marca este
    await supabaseClient.from('item_modelos').update({ padrao: false }).eq('item_id', itemId);
    const { error } = await supabaseClient
      .from('item_modelos')
      .update({ padrao: true })
      .eq('id', modeloId);
    if (error) { alert(`Erro: ${error.message}`); return; }
  }

  await carregarItens();
  const item = itensCarregamento.find(registro => String(registro.id) === String(itemId));
  renderizarModelosItem(item);
}

function encontrarItemRequisicao(nomeEquipamento, modeloEsperado = '') {
  const equipamento = normalizarBuscaImportacao(nomeEquipamento);
  const modeloReq = normalizarBuscaImportacao(modeloEsperado);
  if (!equipamento) return null;

  const candidatos = itensCarregamento
    .map(item => {
      const nome = normalizarBuscaImportacao(item.nome);
      const codigo = normalizarBuscaImportacao(item.codigo);
      const modelos = (item.modelos || []).map(modelo => normalizarBuscaImportacao(modelo.modelo)).filter(Boolean);
      let pontuacao = 0;
      if (nome === equipamento || codigo === equipamento) pontuacao = 100;
      if (nome.includes(equipamento) || equipamento.includes(nome)) pontuacao = Math.max(pontuacao, 70);
      if (modeloReq && modelos.length) {
        const matchExato = modelos.some(modelo => modelo === modeloReq);
        const matchParcial = modelos.some(modelo => modelo.includes(modeloReq) || modeloReq.includes(modelo));
        if (matchExato) pontuacao += 30;
        else if (matchParcial) pontuacao += 15;
      }
      return { item, pontuacao };
    })
    .filter(resultado => resultado.pontuacao >= 70)
    .sort((a, b) => b.pontuacao - a.pontuacao);

  return candidatos[0]?.item || null;
}

function renderizarBadgeStatus(req) {
  const s = req.status || 'PENDENTE';
  if (s === 'CARREGADO' && req.carregamento_placa) {
    return `<span class="status-badge carregado car-tooltip-trigger"
      data-car-placa="${escapeHtml(req.carregamento_placa)}"
      data-car-modelo="${escapeHtml(req.carregamento_modelo || '-')}"
      data-car-motorista="${escapeHtml(req.carregamento_motorista || '-')}"
      data-car-saida="${escapeHtml(formatarData(req.carregamento_data_saida))}"
      style="cursor:help;">${escapeHtml(s)}</span>`;
  }
  const cls = s === 'CARREGADO'              ? 'carregado'
            : s === 'AGUARDANDO CONFERENCIA' ? 'aguardando-conf'
            : 'pendente';
  return `<span class="status-badge ${cls}">${escapeHtml(s)}</span>`;
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
      <td>${renderizarBadgeStatus(req)}</td>
      <td>
        ${req.status === 'PENDENTE'
          ? `<button type="button" class="btn-icon edit" data-carregar-requisicao="${escapeHtml(req.id)}" title="Carregar"><i class="fas fa-truck-loading"></i></button>`
          : '<span class="text-muted">Vinculado</span>'}
      </td>
    </tr>
  `).join('');
}

function renderizarTabelaStatusRequisicoes() {
  const tbody = document.getElementById('corpoTabelaRequisicoes');
  if (!tbody) return;

  const dados = ordenarRequisicoes(requisicoesSalvas.filter(req => {
    const supervisorOk = !filtrosRequisicaoAplicados.supervisor || normalizarBusca(req.supervisor).includes(filtrosRequisicaoAplicados.supervisor);
    const dataOk = !filtrosRequisicaoAplicados.data || String(req.data_requisicao || '').slice(0, 10) === filtrosRequisicaoAplicados.data;
    const motivoOk = !filtrosRequisicaoAplicados.motivo || normalizarBusca(req.motivo).includes(filtrosRequisicaoAplicados.motivo);
    const statusOk = !filtrosRequisicaoAplicados.status || String(req.status || '').toUpperCase() === filtrosRequisicaoAplicados.status;
    return supervisorOk && dataOk && motivoOk && statusOk;
  }));

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
      <td>${renderizarBadgeStatus(req)}</td>
      <td class="actions-cell">
        <button type="button" class="btn-icon view" data-visualizar-requisicao="${escapeHtml(req.id)}" title="Visualizar"><i class="fas fa-eye"></i></button>
        <button type="button" class="btn-icon edit" data-editar-requisicao="${escapeHtml(req.id)}" title="Editar"><i class="fas fa-pen"></i></button>
        <button type="button" class="btn-icon delete" data-excluir-requisicao="${escapeHtml(req.id)}" title="Excluir"><i class="fas fa-trash"></i></button>
        ${req.status === 'PENDENTE'
          ? `<button type="button" class="btn-icon carregar" data-carregar-requisicao="${escapeHtml(req.id)}" title="Vincular a carregamento existente"><i class="fas fa-truck-loading"></i></button>`
          : `<button type="button" class="btn-icon revert" data-reverter-requisicao="${escapeHtml(req.id)}" title="Reverter para Pendente"><i class="fas fa-rotate-left"></i></button>`}
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.requisicao-status-table .glass-table th[data-sort]').forEach(th => {
    th.classList.toggle('sort-asc', sortRequisicao.col === th.dataset.sort && sortRequisicao.dir === 'asc');
    th.classList.toggle('sort-desc', sortRequisicao.col === th.dataset.sort && sortRequisicao.dir === 'desc');
  });
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

function normalizarNomeItemParaComparacao(value) {
  return normalizarBuscaImportacao(value)
    .replace(/^\d+\s*[-–]\s*/, '')
    .replace(/\b(?:NOVO|USADO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function encontrarCadastroItemDaRequisicao(item) {
  if (item.item_id) {
    const porId = itensCarregamento.find(registro => String(registro.id) === String(item.item_id));
    if (porId) return porId;
  }

  const equipamento = normalizarNomeItemParaComparacao(item.equipamento || item.item_nome);
  const itemNome = normalizarNomeItemParaComparacao(item.item_nome);
  if (!equipamento && !itemNome) return null;

  return itensCarregamento.find(registro => {
    const nome = normalizarNomeItemParaComparacao(registro.nome);
    const codigo = normalizarBuscaImportacao(registro.codigo);
    if (!nome && !codigo) return false;
    return (
      nome === equipamento ||
      nome === itemNome ||
      (nome && equipamento.includes(nome)) ||
      (nome && itemNome.includes(nome)) ||
      codigo === equipamento ||
      codigo === itemNome
    );
  }) || null;
}

function obterModelosDoItemRequisicao(item) {
  const cadastro = encontrarCadastroItemDaRequisicao(item);
  return cadastro?.modelos || [];
}

function renderizarSelectModeloRequisicao(item, index, editando) {
  const modelos = obterModelosDoItemRequisicao(item);
  const valorAtual = String(item.modelo || '').trim();

  if (!editando) return escapeHtml(valorAtual);
  if (!modelos.length) {
    return `<select class="glass-input requisicao-modelo-select" data-item-index="${index}" disabled>
      <option value="">Sem modelos</option>
    </select>`;
  }

  const opcoes = [
    '<option value="">Selecione</option>',
    ...modelos.map(modelo => {
      const valor = String(modelo.modelo || '').trim();
      const selected = normalizarTexto(valor) === normalizarTexto(valorAtual) ? 'selected' : '';
      return `<option value="${escapeHtml(valor)}" ${selected}>${escapeHtml(valor)}</option>`;
    })
  ].join('');

  return `<select class="glass-input requisicao-modelo-select" data-item-index="${index}">${opcoes}</select>`;
}

function renderizarItensRequisicaoDetalhes(req, editando = false) {
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
          <th>Estado</th>
          <th>OBS</th>
        </tr>
      </thead>
      <tbody>
        ${itens.map((item, index) => {
          const estado = item.novo ? 'NOVO' : item.usado ? 'USADO' : '';
          const estadoClass = item.novo ? 'estado-badge-novo' : item.usado ? 'estado-badge-usado' : '';
          return `
          <tr>
            <td>${escapeHtml(item.quantidade || '')}</td>
            <td>${escapeHtml(item.item_nome || item.equipamento || '')}</td>
            <td>${renderizarSelectModeloRequisicao(item, index, editando)}</td>
            <td>${estado ? `<span class="estado-badge ${estadoClass}">${estado}</span>` : ''}</td>
            <td>${item.obs ? `<span class="obs-badge${item.obs === 'AUMENTO' ? ' obs-badge-aumento' : ''}">${escapeHtml(item.obs)}</span>` : ''}</td>
          </tr>`;
        }).join('')}
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
  const editando = modo === 'editar';
  renderizarItensRequisicaoDetalhes(req, editando);
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
  const req = encontrarRequisicaoSalva(id);
  const itensAtualizados = Array.isArray(req?.itens) ? req.itens.map(item => ({ ...item })) : [];
  document.querySelectorAll('#requisicaoDetalhesItens [data-item-index]').forEach(select => {
    const index = Number(select.dataset.itemIndex);
    if (Number.isInteger(index) && itensAtualizados[index]) {
      itensAtualizados[index].modelo = select.value || '';
    }
  });

  const payload = {
    status: document.getElementById('requisicaoDetalhesStatus').value,
    data_requisicao: document.getElementById('requisicaoDetalhesData').value || null,
    supervisor: document.getElementById('requisicaoDetalhesSupervisor').value.trim(),
    cliente_nome: document.getElementById('requisicaoDetalhesCliente').value.trim(),
    motivo: document.getElementById('requisicaoDetalhesMotivo').value.trim(),
    itens: itensAtualizados
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
      const item = encontrarItemRequisicao(row[1], row[2]);
      const modeloRaw = String(row[2] || '').trim().toUpperCase();
      const ehObs = PALAVRAS_CHAVE_OBS.has(normalizarTexto(modeloRaw));
      const obs = ehObs ? modeloRaw : '';
      const modeloExplicito = ehObs ? '' : String(row[2] || '').trim();
      const modelo = modeloExplicito || (item?.modelos?.find(m => m.padrao)?.modelo || '');
      return {
        item_id: item?.id || null,
        item_nome: item ? `${item.codigo} - ${item.nome}` : String(row[1] || ''),
        equipamento: String(row[1] || '').trim(),
        modelo,
        obs,
        quantidade: Number(row[0]) || 0,
        novo: normalizarTexto(row[3]) === 'X',
        usado: normalizarTexto(row[4]) === 'X'
      };
    });

  // Itens "RETIRAR: X Y" da célula I11 (observação) — sempre retorno, equipamento diferente
  const itensObs = (requisicao.itensRetornoObservacao || []).map(ret => {
    const item = encontrarItemRequisicao(ret.equipamento, '');
    return {
      item_id: item?.id || null,
      item_nome: item ? `${item.codigo} - ${item.nome}` : ret.equipamento,
      equipamento: ret.equipamento,
      modelo: '',
      quantidade: ret.quantidade,
      novo: false,
      usado: true,
      de_observacao: true
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
    itens: [...itens, ...itensObs],
    linhas: requisicao.rows,
    cliente_planilha: requisicao.clientePlanilha || {},
    observacao: requisicao.observacao || null
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
  await abrirModalVincularCarregamento(id);
}

async function marcarRequisicaoComoCarregadaLegadoRemovido(error) {
  if (error) {
    console.error('Erro ao carregar requisição:', error);
    alert(`Não foi possível carregar a requisição: ${error.message}`);
    return;
  }

  await carregarRequisicoesBanco();
  atualizarStatusRequisicao('Requisição marcada como CARREGADO.');
}

async function abrirModalVincularCarregamento(id) {
  const req = encontrarRequisicaoSalva(id);
  const modal = document.getElementById('modalVincularCarregamento');
  const tbody = document.getElementById('corpoModalCarregamentosVinculo');
  const status = document.getElementById('statusVincularCarregamento');
  if (!req || !modal || !tbody) return;

  requisicaoVinculoCarregamentoId = id;
  if (status) {
    status.textContent = `Selecione o carregamento que recebera a requisicao: ${req.arquivo}`;
    status.classList.remove('hidden', 'error');
    status.classList.add('success');
  }
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6c757d;">Carregando...</td></tr>';
  modal.classList.remove('hidden');

  const { data, error } = await supabaseClient
    .from(CARREGAMENTOS_TABLE)
    .select('*')
    .order('data_saida', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Erro ao buscar carregamentos:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c0392b;">Erro ao carregar os carregamentos.</td></tr>';
    return;
  }

  carregamentosVinculoRequisicao = data || [];
  renderizarCarregamentosVinculo();
}

function fecharModalVincularCarregamento() {
  document.getElementById('modalVincularCarregamento')?.classList.add('hidden');
  requisicaoVinculoCarregamentoId = null;
  carregamentosVinculoRequisicao = [];
}

function renderizarCarregamentosVinculo() {
  const tbody = document.getElementById('corpoModalCarregamentosVinculo');
  if (!tbody) return;

  if (!carregamentosVinculoRequisicao.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6c757d;">Nenhum carregamento registrado.</td></tr>';
    return;
  }

  tbody.innerHTML = carregamentosVinculoRequisicao.map(car => {
    const idEsc = escapeHtml(String(car.id));
    return `<tr>
      <td>${escapeHtml(formatarData(car.data_saida))}</td>
      <td><span class="hist-placa">${escapeHtml(car.placa || '-')}</span></td>
      <td>${escapeHtml(car.modelo_veiculo || '-')}</td>
      <td>${escapeHtml(car.motorista || '-')}</td>
      <td class="col-num"><span class="badge-req">${escapeHtml(car.total_requisicoes || 0)}</span></td>
      <td style="text-align:center;">
        <button type="button" class="btn-glass btn-green btn-sm-vincular" data-vincular-carregamento="${idEsc}">
          <i class="fas fa-link"></i> Vincular
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function obterProximaOrdemNoCarregamento(carregamentoId) {
  const { data, error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .select('ordem')
    .eq('carregamento_id', carregamentoId);

  if (error) throw error;

  const maior = (data || []).reduce((max, item) => {
    const numero = Number(String(item.ordem || '').replace(/\D/g, ''));
    return Number.isFinite(numero) ? Math.max(max, numero) : max;
  }, 0);
  return String(maior + 1);
}

async function vincularRequisicaoAoCarregamento(carregamentoId) {
  const req = encontrarRequisicaoSalva(requisicaoVinculoCarregamentoId);
  const car = carregamentosVinculoRequisicao.find(item => String(item.id) === String(carregamentoId));
  if (!req || !car) return;

  const status = document.getElementById('statusVincularCarregamento');
  if (status) {
    status.textContent = 'Vinculando requisicao ao carregamento...';
    status.classList.remove('hidden', 'error');
    status.classList.add('success');
  }

  try {
    const ordem = await obterProximaOrdemNoCarregamento(carregamentoId);
    const { totalEntrega, totalRetorno } = calcularTotaisRequisicoesCarregamento([req]);

    const { error: errReq } = await supabaseClient
      .from(REQUISICOES_TABLE)
      .update({
        status: 'CARREGADO',
        ordem,
        carregado_em: new Date().toISOString(),
        carregamento_id: carregamentoId,
        carregamento_placa: car.placa || null,
        carregamento_motorista: car.motorista || null,
        carregamento_data_saida: car.data_saida || null,
        carregamento_modelo: car.modelo_veiculo || null
      })
      .eq('id', req.id);
    if (errReq) throw errReq;

    const { error: errCar } = await supabaseClient
      .from(CARREGAMENTOS_TABLE)
      .update({
        total_requisicoes: Number(car.total_requisicoes || 0) + 1,
        total_entrega: Number(car.total_entrega || 0) + totalEntrega,
        total_retorno: Number(car.total_retorno || 0) + totalRetorno
      })
      .eq('id', carregamentoId);
    if (errCar) throw errCar;

    fecharModalVincularCarregamento();
    await Promise.all([carregarRequisicoesBanco(), carregarHistoricoCarregamentos()]);
    atualizarStatusRequisicao(`Requisicao vinculada ao carregamento ${car.placa || ''} - ${formatarData(car.data_saida)}.`);
  } catch (error) {
    console.error('Erro ao vincular requisicao ao carregamento:', error);
    if (status) {
      status.textContent = `Erro ao vincular: ${error.message || 'verifique os dados e tente novamente.'}`;
      status.classList.remove('hidden', 'success');
      status.classList.add('error');
    }
  }
}

async function reverterRequisicaoParaPendente(id) {
  const req = encontrarRequisicaoSalva(id);
  if (!req || !confirm(`Reverter a requisição "${req.arquivo}" para PENDENTE?`)) return;

  const { error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .update({ status: 'PENDENTE', carregado_em: null })
    .eq('id', id);

  if (error) {
    console.error('Erro ao reverter requisição:', error);
    alert(`Não foi possível reverter a requisição: ${error.message}`);
    return;
  }

  await carregarRequisicoesBanco();
  atualizarStatusRequisicao('Requisição revertida para PENDENTE.');
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
          const item = encontrarItemRequisicao(row[1], row[2]);
          const modeloRaw = String(row[2] || '').trim().toUpperCase();
          const ehObs = PALAVRAS_CHAVE_OBS.has(normalizarTexto(modeloRaw));
          const obs = ehObs ? modeloRaw : '';
          const modeloExplicito = ehObs ? '' : String(row[2] || '').trim();
          const modelo = modeloExplicito || (item?.modelos?.find(m => m.padrao)?.modelo || '');
          return {
            item_id: item?.id || null,
            item_nome: item ? `${item.codigo} - ${item.nome}` : String(row[1] || ''),
            modelo,
            obs,
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
      // I11 tem dupla função: motivo (quando K8/K9 vazio) OU observação (quando K8/K9 preenchido)
      const motivoCelula = String(sheet[cfg.motivoCell]?.v || '').trim();
      const I11Valor    = String(sheet['I11']?.v || '').trim();
      const motivoPlanilha      = motivoCelula || I11Valor;
      const observacaoPlanilha  = motivoCelula ? I11Valor : '';
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
        status: 'PENDENTE',
        observacao: observacaoPlanilha || null,
        itensRetornoObservacao: parsearItensRetornoObservacao(observacaoPlanilha)
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

// ─── NOVA REQUISIÇÃO ───────────────────────────────────────────────────────────

let itensNovaRequisicao = [];

function abrirModalNovaRequisicao() {
  itensNovaRequisicao = [];

  document.getElementById('novaReqCliente').value = '';
  document.getElementById('novaReqSupervisor').value = '';
  document.getElementById('novaReqMotivo').value = '';
  document.getElementById('novaReqData').value = new Date().toISOString().split('T')[0];
  document.getElementById('novaReqQtd').value = '1';
  document.getElementById('novaReqObs').value = '';

  const datalist = document.getElementById('clientes-nova-req-list');
  if (datalist) {
    datalist.innerHTML = clientesCarregamento
      .map(c => `<option value="${escapeHtml(formatarCliente(c))}">`)
      .join('');
  }

  const selectEq = document.getElementById('novaReqEquipamento');
  if (selectEq) {
    selectEq.innerHTML = '<option value="">Selecione o equipamento</option>' +
      itensCarregamento
        .map(item => `<option value="${escapeHtml(String(item.id))}">${escapeHtml(item.codigo)} - ${escapeHtml(item.nome)}</option>`)
        .join('');
  }

  const selectModelo = document.getElementById('novaReqModelo');
  if (selectModelo) selectModelo.innerHTML = '<option value="">-</option>';

  renderizarItensNovaReq();
  document.getElementById('modalNovaRequisicao')?.classList.remove('hidden');
}

function fecharModalNovaRequisicao() {
  document.getElementById('modalNovaRequisicao')?.classList.add('hidden');
  itensNovaRequisicao = [];
}

function renderizarItensNovaReq() {
  const tbody = document.getElementById('corpoItensNovaReq');
  if (!tbody) return;
  if (!itensNovaRequisicao.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#adb5bd;padding:16px">Nenhum item adicionado</td></tr>';
    return;
  }
  tbody.innerHTML = itensNovaRequisicao.map((item, index) => {
    const estadoHtml = item.novo
      ? '<span class="estado-badge estado-badge-novo">NOVO</span>'
      : '<span class="estado-badge estado-badge-usado">USADO</span>';
    const obsHtml = item.obs
      ? `<span class="obs-badge${item.obs === 'AUMENTO' ? ' obs-badge-aumento' : ''}">${escapeHtml(item.obs)}</span>`
      : '';
    return `<tr>
      <td style="text-align:center">${item.quantidade}</td>
      <td>${escapeHtml(item.item_nome)}</td>
      <td>${escapeHtml(item.modelo || '-')}</td>
      <td>${estadoHtml}</td>
      <td>${obsHtml}</td>
      <td><button type="button" class="btn-nova-req-remover" data-remover-nova-req="${index}" title="Remover"><i class="fas fa-times"></i></button></td>
    </tr>`;
  }).join('');
}

function atualizarModelosNovaReq() {
  const itemId = document.getElementById('novaReqEquipamento')?.value;
  const selectModelo = document.getElementById('novaReqModelo');
  if (!selectModelo) return;
  const item = itensCarregamento.find(i => String(i.id) === itemId);
  const modelos = item?.modelos || [];
  selectModelo.innerHTML = '<option value="">-</option>' +
    modelos.map(m => `<option value="${escapeHtml(m.modelo)}" ${m.padrao ? 'selected' : ''}>${escapeHtml(m.modelo)}${m.padrao ? ' ★' : ''}</option>`).join('');
}

function adicionarItemNovaReq() {
  const itemId = document.getElementById('novaReqEquipamento')?.value;
  const qtd    = Number(document.getElementById('novaReqQtd')?.value) || 0;
  const modelo = document.getElementById('novaReqModelo')?.value.trim() || '';
  const estado = document.getElementById('novaReqEstado')?.value;
  const obs    = (document.getElementById('novaReqObs')?.value.trim() || '').toUpperCase();

  if (!itemId || qtd <= 0) {
    alert('Selecione um equipamento e informe a quantidade.');
    return;
  }
  const itemCadastro = itensCarregamento.find(i => String(i.id) === itemId);
  if (!itemCadastro) return;

  itensNovaRequisicao.push({
    item_id:   itemCadastro.id,
    item_nome: `${itemCadastro.codigo} - ${itemCadastro.nome}`,
    equipamento: itemCadastro.nome,
    modelo,
    obs,
    quantidade: qtd,
    novo:  estado === 'novo',
    usado: estado === 'usado'
  });

  document.getElementById('novaReqQtd').value = '1';
  document.getElementById('novaReqObs').value = '';
  renderizarItensNovaReq();
}

async function gerarPdfNovaRequisicao(req) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(0, 105, 55);
  doc.text('MARQUESPAN', 105, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('REQUISIÇÃO DE CARREGAMENTO', 105, 26, { align: 'center' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 105, 55);
  doc.line(15, 30, 195, 30);

  const dataFormatada = req.data_requisicao
    ? new Date(req.data_requisicao + 'T12:00:00').toLocaleDateString('pt-BR')
    : '-';

  const campos = [
    ['CLIENTE',        req.cliente_nome || '-', 15,  110],
    ['SUPERVISOR',     req.supervisor   || '-', 110, 180],
    ['MOTIVO',         req.motivo       || '-', 15,  110],
    ['DATA REQUISICAO', dataFormatada,          110, 180],
  ];

  let y = 40;
  for (let i = 0; i < campos.length; i += 2) {
    const [label1, val1, x1] = campos[i];
    const [label2, val2, x2] = campos[i + 1] || [];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 105, 55);
    doc.text(label1 + ':', x1, y);
    if (label2) doc.text(label2 + ':', x2, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(String(val1), x1, y);
    if (val2) doc.text(String(val2), x2, y);
    y += 8;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  |  Usuário: ${obterUsuarioAtualNome()}`, 15, y + 1);

  doc.autoTable({
    startY: y + 7,
    head: [['Qtd', 'Equipamento', 'Modelo', 'Estado', 'OBS']],
    body: req.itens.map(item => [
      item.quantidade,
      item.item_nome || item.equipamento || '-',
      item.modelo || '-',
      item.novo ? 'NOVO' : item.usado ? 'USADO' : '-',
      item.obs || ''
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 32 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 25 }
    },
    alternateRowStyles: { fillColor: [245, 250, 246] },
    tableLineColor: [200, 220, 200],
    tableLineWidth: 0.1
  });

  return doc.output('blob');
}

async function salvarNovaRequisicao() {
  const clienteVal = document.getElementById('novaReqCliente')?.value.trim();
  const supervisor = document.getElementById('novaReqSupervisor')?.value.trim();
  const motivo     = document.getElementById('novaReqMotivo')?.value;
  const dataReq    = document.getElementById('novaReqData')?.value;

  if (!clienteVal)                   { alert('Informe o cliente.');                            return; }
  if (!motivo)                       { alert('Selecione o motivo.');                           return; }
  if (!dataReq)                      { alert('Informe a data da requisição.');                 return; }
  if (!itensNovaRequisicao.length)   { alert('Adicione pelo menos um item antes de salvar.'); return; }

  const clienteCadastro = encontrarCliente(clienteVal);
  const clienteNome     = clienteCadastro ? formatarCliente(clienteCadastro) : clienteVal;
  const clienteCodigo   = clienteCadastro?.codigo || null;

  const reqData = { cliente_nome: clienteNome, cliente_codigo: clienteCodigo, supervisor, motivo, data_requisicao: dataReq, itens: itensNovaRequisicao };

  const btn = document.getElementById('btnSalvarNovaRequisicao');
  const originalHtml = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PDF...'; }

  try {
    const pdfBlob = await gerarPdfNovaRequisicao(reqData);

    const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeSeguro = (clienteNome + '_' + dataReq)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .toUpperCase()
      .slice(0, 80);
    const path = `${timestamp}_REQ_${nomeSeguro}.pdf`;

    const { error: uploadError } = await supabaseClient.storage
      .from(REQUISICOES_BUCKET)
      .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;

    const payload = {
      arquivo:         path,
      supervisor:      reqData.supervisor,
      cliente_codigo:  reqData.cliente_codigo,
      cliente_nome:    reqData.cliente_nome,
      motivo:          reqData.motivo,
      data_requisicao: reqData.data_requisicao,
      usuario:         obterUsuarioAtualNome(),
      arquivo_path:    path,
      arquivo_tipo:    'application/pdf',
      arquivo_tamanho: pdfBlob.size,
      status:          'PENDENTE',
      itens:           reqData.itens,
      linhas:          reqData.itens.map(i => [i.quantidade, i.item_nome || i.equipamento, i.modelo, i.novo ? 'X' : '', i.usado ? 'X' : '']),
      cliente_planilha: {},
      observacao:       null
    };

    const { error: dbError } = await supabaseClient.from(REQUISICOES_TABLE).insert([payload]);
    if (dbError) throw dbError;

    await carregarRequisicoesBanco();
    fecharModalNovaRequisicao();
    alert('Requisição criada e PDF anexado com sucesso!');
  } catch (err) {
    console.error('Erro ao salvar nova requisição:', err);
    alert(`Erro ao salvar: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
}

// ───────────────────────────────────────────────────────────────────────────────

export async function inicializarRequisicao() {
  if (!document.getElementById('requisicaoFileUpload')) return;
  document.getElementById('btnImportarRequisicao')?.addEventListener('click', abrirModalImportarRequisicao);
  document.getElementById('btnNovaRequisicao')?.addEventListener('click', abrirModalNovaRequisicao);
  document.getElementById('btnFecharNovaRequisicao')?.addEventListener('click', fecharModalNovaRequisicao);
  document.getElementById('btnCancelarNovaRequisicao')?.addEventListener('click', fecharModalNovaRequisicao);
  document.getElementById('modalNovaRequisicao')?.addEventListener('click', e => {
    if (e.target.id === 'modalNovaRequisicao') fecharModalNovaRequisicao();
  });
  document.getElementById('novaReqEquipamento')?.addEventListener('change', atualizarModelosNovaReq);
  document.getElementById('btnAdicionarItemNovaReq')?.addEventListener('click', adicionarItemNovaReq);
  document.getElementById('novaReqQtd')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); adicionarItemNovaReq(); } });
  document.getElementById('corpoItensNovaReq')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-remover-nova-req]');
    if (!btn) return;
    itensNovaRequisicao.splice(Number(btn.dataset.removerNovaReq), 1);
    renderizarItensNovaReq();
  });
  document.getElementById('btnSalvarNovaRequisicao')?.addEventListener('click', salvarNovaRequisicao);
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
  document.getElementById('btnFecharVincularCarregamento')?.addEventListener('click', fecharModalVincularCarregamento);
  document.getElementById('modalVincularCarregamento')?.addEventListener('click', event => {
    if (event.target.id === 'modalVincularCarregamento') fecharModalVincularCarregamento();
  });
  document.getElementById('corpoModalCarregamentosVinculo')?.addEventListener('click', event => {
    const btn = event.target.closest('[data-vincular-carregamento]');
    if (btn) vincularRequisicaoAoCarregamento(btn.dataset.vincularCarregamento);
  });
  document.querySelector('.requisicao-status-table .glass-table thead')?.addEventListener('click', event => {
    const th = event.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    sortRequisicao.dir = sortRequisicao.col === col && sortRequisicao.dir === 'asc' ? 'desc' : 'asc';
    sortRequisicao.col = col;
    renderizarTabelaStatusRequisicoes();
  });

  document.getElementById('corpoTabelaRequisicoes')?.addEventListener('click', event => {
    const visualizar = event.target.closest('[data-visualizar-requisicao]');
    const editar = event.target.closest('[data-editar-requisicao]');
    const excluir = event.target.closest('[data-excluir-requisicao]');
    const carregar = event.target.closest('[data-carregar-requisicao]');
    const reverter = event.target.closest('[data-reverter-requisicao]');

    if (visualizar) abrirModalRequisicaoDetalhes(visualizar.dataset.visualizarRequisicao, 'visualizar');
    if (editar) abrirModalRequisicaoDetalhes(editar.dataset.editarRequisicao, 'editar');
    if (excluir) excluirRequisicao(excluir.dataset.excluirRequisicao);
    if (carregar) marcarRequisicaoComoCarregada(carregar.dataset.carregarRequisicao);
    if (reverter) reverterRequisicaoParaPendente(reverter.dataset.reverterRequisicao);
  });

  const tooltip = document.getElementById('carregamento-tooltip');
  if (tooltip) {
    document.getElementById('corpoTabelaRequisicoes')?.addEventListener('mouseover', e => {
      const trigger = e.target.closest('.car-tooltip-trigger');
      if (!trigger) return;
      document.getElementById('tt-placa').textContent = trigger.dataset.carPlaca || '-';
      document.getElementById('tt-modelo').textContent = trigger.dataset.carModelo || '-';
      document.getElementById('tt-motorista').textContent = trigger.dataset.carMotorista || '-';
      document.getElementById('tt-saida').textContent = trigger.dataset.carSaida || '-';
      tooltip.classList.remove('hidden');
    });
    document.getElementById('corpoTabelaRequisicoes')?.addEventListener('mousemove', e => {
      if (tooltip.classList.contains('hidden')) return;
      if (!e.target.closest('.car-tooltip-trigger')) return;
      tooltip.style.left = `${e.pageX + 14}px`;
      tooltip.style.top = `${e.pageY - 10}px`;
    });
    document.getElementById('corpoTabelaRequisicoes')?.addEventListener('mouseout', e => {
      if (!e.target.closest('.car-tooltip-trigger')) return;
      tooltip.classList.add('hidden');
    });
  }

  await Promise.all([
    carregarSupervisoresRequisicao(),
    carregarRequisicoesBanco()
  ]);
}

// === CARREGAMENTO ===

const CARREGAMENTOS_TABLE = 'saidas_carregamento';

let carregamentoRequisicoes = [];
let veiculosLista = [];

function popularPlacasDatalist() {
  const datalist = document.getElementById('placas-carregamento-list');
  if (!datalist) return;
  datalist.innerHTML = '';
  veiculosLista.forEach(v => {
    const option = document.createElement('option');
    option.value = v.placa || '';
    option.label = [v.modelo, v.tipo, v.filial].filter(Boolean).join(' · ');
    datalist.appendChild(option);
  });
}

function popularMotoristasDatalist(lista) {
  const datalist = document.getElementById('motoristas-carregamento-list');
  if (!datalist) return;
  datalist.innerHTML = '';
  lista.forEach(f => {
    const option = document.createElement('option');
    option.value = f.nome_completo || f.nome || '';
    option.label = f.funcao || '';
    datalist.appendChild(option);
  });
}

function encontrarVeiculo(placa) {
  const p = String(placa || '').trim().toUpperCase();
  return veiculosLista.find(v => String(v.placa || '').toUpperCase() === p) || null;
}

function atualizarStatusCarregamento(message, error = false, carregamentoId = null) {
  const el     = document.getElementById('carregamentoStatus');
  const msgEl  = document.getElementById('carregamentoStatusMsg');
  const btnRes = document.getElementById('btnResumoAposSalvar');
  if (!el) return;

  if (msgEl) msgEl.textContent = message;
  else el.textContent = message;

  el.classList.toggle('error', error);
  el.classList.toggle('hidden', !message);

  if (btnRes) {
    btnRes.classList.toggle('hidden', !carregamentoId || !!error);
    btnRes.onclick = carregamentoId ? () => gerarResumoCarregamento(carregamentoId) : null;
  }
}

async function salvarCarregamento() {
  const placa       = document.getElementById('carregamentoPlaca')?.value.trim().toUpperCase();
  const motorista   = document.getElementById('carregamentoMotorista')?.value.trim();
  const dataSaida   = document.getElementById('carregamentoDataSaida')?.value;

  if (!placa || !motorista || !dataSaida) {
    atualizarStatusCarregamento('Preencha Placa, Motorista e Data de Saída.', true);
    return;
  }
  if (!carregamentoRequisicoes.length) {
    atualizarStatusCarregamento('Adicione ao menos uma requisição ao carregamento.', true);
    return;
  }

  normalizarOrdemCarregamento();

  const veiculo      = encontrarVeiculo(placa);
  const modeloVeiculo = [veiculo?.modelo, veiculo?.tipo].filter(Boolean).join(' / ') || null;

  const btn = document.getElementById('btnSalvarCarregamento');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const { totalEntrega, totalRetorno } = calcularTotaisCarregamento();
    const agora = new Date().toISOString();
    let carregamentoId;

    if (carregamentoEditandoId) {
      // ── MODO EDIÇÃO ──────────────────────────────────────────────────────
      carregamentoId = carregamentoEditandoId;

      // Requisições que estavam neste carregamento mas foram removidas da lista
      const { data: origReqs } = await supabaseClient
        .from(REQUISICOES_TABLE)
        .select('id')
        .eq('carregamento_id', carregamentoId);

      const idsAtuais = new Set(carregamentoRequisicoes.map(r => r.id));
      const removidas = (origReqs || []).filter(r => !idsAtuais.has(r.id));

      if (removidas.length) {
        await supabaseClient.from(REQUISICOES_TABLE)
          .update({
            status: 'PENDENTE',
            ordem: null,
            carregado_em: null,
            carregamento_id: null,
            carregamento_placa: null,
            carregamento_motorista: null,
            carregamento_data_saida: null,
            carregamento_modelo: null
          })
          .in('id', removidas.map(r => r.id));
      }

      // Atualizar registro do carregamento
      const { error: errUpd } = await supabaseClient
        .from(CARREGAMENTOS_TABLE)
        .update({
          placa,
          modelo_veiculo: modeloVeiculo,
          motorista,
          data_saida: dataSaida,
          total_requisicoes: carregamentoRequisicoes.length,
          total_entrega: totalEntrega,
          total_retorno: totalRetorno
        })
        .eq('id', carregamentoId);

      if (errUpd) throw errUpd;

    } else {
      // ── MODO CRIAÇÃO ─────────────────────────────────────────────────────
      const { data: carregamento, error: errCar } = await supabaseClient
        .from(CARREGAMENTOS_TABLE)
        .insert([{
          placa,
          modelo_veiculo: modeloVeiculo,
          motorista,
          data_saida: dataSaida,
          usuario: obterUsuarioAtualNome(),
          total_requisicoes: carregamentoRequisicoes.length,
          total_entrega: totalEntrega,
          total_retorno: totalRetorno
        }])
        .select('id')
        .single();

      if (errCar) throw errCar;
      carregamentoId = carregamento.id;
    }

    // Atualizar todas as requisições da lista
    const updates = carregamentoRequisicoes.map(req =>
      supabaseClient
        .from(REQUISICOES_TABLE)
        .update({
          status: 'AGUARDANDO CONFERENCIA',
          ordem: req.ordem || null,
          carregado_em: agora,
          carregamento_id: carregamentoId,
          carregamento_placa: placa,
          carregamento_motorista: motorista,
          carregamento_data_saida: dataSaida,
          carregamento_modelo: modeloVeiculo
        })
        .eq('id', req.id)
    );

    const resultados = await Promise.all(updates);
    const erros = resultados.filter(r => r.error);
    if (erros.length) throw erros[0].error;

    const modoEdicao = !!carregamentoEditandoId;
    carregamentoEditandoId  = null;
    carregamentoRequisicoes = [];
    renderizarRequisicoesCarregamento();
    document.getElementById('carregamentoPlaca').value     = '';
    document.getElementById('carregamentoMotorista').value = '';
    document.getElementById('carregamentoDataSaida').value = '';
    document.getElementById('carregamentoEdicaoBanner')?.classList.add('hidden');

    await carregarRequisicoesBanco();
    const msg = modoEdicao
      ? `Carregamento atualizado! ${updates.length} requisição(ões) vinculadas.`
      : `Carregamento salvo! ${updates.length} requisição(ões) marcadas como AGUARDANDO CONFERENCIA.`;
    atualizarStatusCarregamento(msg, false, carregamentoId);
  } catch (error) {
    console.error('Erro ao salvar carregamento:', error);
    atualizarStatusCarregamento(`Erro ao salvar: ${error.message}`, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar Carregamento';
  }
}

// Motivos que determinam a direção no nível da requisição inteira
const MOTIVOS_SO_RETORNO = ['Retirada Total', 'Retirada Parcial', 'Retirada de Empréstimo'];
const PALAVRAS_CHAVE_OBS  = new Set(['AUMENTO', 'TROCA', 'NOVO', 'USADO']);

// Parseia "RETIRAR: 1 CLIMA 20" da célula I11 (campo Observação)
function parsearItensRetornoObservacao(observacao) {
  if (!observacao) return [];
  const itens = [];
  const re = /RETIRAR[:\s]+(\d+)\s+([^\n\r,;]+)/gi;
  for (const m of String(observacao).matchAll(re)) {
    const qtd = parseInt(m[1], 10);
    const equip = m[2].trim();
    if (qtd > 0 && equip) itens.push({ quantidade: qtd, equipamento: equip });
  }
  return itens;
}
const MOTIVOS_SO_ENTREGA  = ['Aumento', 'Cliente Novo'];

function direcionarItemCarregamento(item, motivoRequisicao = '', temRetornoObservacao = false) {
  // Itens vindos de "RETIRAR: X Y" no campo I11 — sempre só retorno
  if (item.de_observacao) return 'retorno';

  const motiNorm = normalizarTexto(motivoRequisicao);

  // Retiradas: caminhão não leva nada, só traz de volta
  if (MOTIVOS_SO_RETORNO.some(m => normalizarTexto(m) === motiNorm)) return 'retorno';

  // Só entrega, sem retorno
  if (MOTIVOS_SO_ENTREGA.some(m => normalizarTexto(m) === motiNorm)) return 'entrega';

  const mod = normalizarTexto(item.modelo || '');
  const obsDir = normalizarTexto(item.obs || '');
  if (mod === 'TROCA'   || obsDir === 'TROCA')   return 'troca';   // leva novo E retorna usado
  if (mod === 'AUMENTO' || obsDir === 'AUMENTO') return 'entrega'; // só leva

  // TROCA com observação: a tabela só carrega (itens de retorno estão em de_observacao)
  if (motiNorm === 'TROCA' && temRetornoObservacao) return 'entrega';

  // TROCA sem observação: swap simples, mesma qtd vai e volta
  if (!mod && !obsDir && motiNorm === 'TROCA') return 'troca';

  // Fallback: colunas N / U da planilha
  if (item.novo)  return 'entrega';
  if (item.usado) return 'retorno';
  return 'entrega';
}

function calcularTotaisCarregamento() {
  return calcularTotaisRequisicoesCarregamento(carregamentoRequisicoes);
}

function calcularTotaisRequisicoesCarregamento(requisicoes) {
  let totalEntrega = 0, totalRetorno = 0;
  (requisicoes || []).forEach(req => {
    const temRetornoObs = (Array.isArray(req.itens) ? req.itens : []).some(i => i.de_observacao);
    (Array.isArray(req.itens) ? req.itens : []).forEach(item => {
      const qtd = Number(item.quantidade) || 0;
      if (qtd <= 0) return;
      const dir = direcionarItemCarregamento(item, req.motivo, temRetornoObs);
      if (dir === 'troca') { totalEntrega += qtd; totalRetorno += qtd; }
      else if (dir === 'entrega') totalEntrega += qtd;
      else totalRetorno += qtd;
    });
  });
  return { totalEntrega, totalRetorno };
}

function calcularTotalizadorCarregamento() {
  const mapa = new Map();
  carregamentoRequisicoes.forEach(req => {
    const temRetornoObs = (Array.isArray(req.itens) ? req.itens : []).some(i => i.de_observacao);
    (Array.isArray(req.itens) ? req.itens : []).forEach(item => {
      const qtd = Number(item.quantidade) || 0;
      if (qtd <= 0) return;
      const key = item.item_nome || item.equipamento || '?';
      if (!mapa.has(key)) mapa.set(key, { nome: key, entrega: 0, retorno: 0, entregaNovo: 0, entregaUsado: 0, retornoNovo: 0, retornoUsado: 0 });
      const e = mapa.get(key);
      const dir = direcionarItemCarregamento(item, req.motivo, temRetornoObs);
      if (dir === 'troca') {
        e.entrega += qtd; e.retorno += qtd;
        e.entregaNovo += qtd; e.retornoUsado += qtd;
      } else if (dir === 'entrega') {
        e.entrega += qtd;
        if (item.usado) e.entregaUsado += qtd; else e.entregaNovo += qtd;
      } else {
        e.retorno += qtd;
        if (item.novo) e.retornoNovo += qtd; else e.retornoUsado += qtd;
      }
    });
  });
  return mapa;
}

function obterOrdemCarregamento(req, fallbackIndex = 0) {
  const raw = req?.ordem_carregamento ?? req?.ordem ?? fallbackIndex + 1;
  const numero = Number(String(raw).replace(/\D/g, ''));
  return Number.isFinite(numero) && numero > 0 ? numero : fallbackIndex + 1;
}

function ordenarRequisicoesCarregamento() {
  carregamentoRequisicoes = carregamentoRequisicoes
    .map((req, index) => ({ req, index, ordem: obterOrdemCarregamento(req, index) }))
    .sort((a, b) => (a.ordem - b.ordem) || (a.index - b.index))
    .map(item => item.req);
}

function normalizarOrdemCarregamento() {
  ordenarRequisicoesCarregamento();
  renumerarOrdemCarregamento();
}

function renumerarOrdemCarregamento() {
  carregamentoRequisicoes.forEach((req, index) => {
    const ordem = String(index + 1);
    req.ordem = ordem;
    req.ordem_carregamento = ordem;
  });
}

function proximaOrdemCarregamento() {
  return String(carregamentoRequisicoes.length + 1);
}

function moverRequisicaoCarregamento(id, direcao) {
  normalizarOrdemCarregamento();
  const index = carregamentoRequisicoes.findIndex(req => String(req.id) === String(id));
  if (index < 0) return;

  const novoIndex = index + direcao;
  if (novoIndex < 0 || novoIndex >= carregamentoRequisicoes.length) return;

  const [req] = carregamentoRequisicoes.splice(index, 1);
  carregamentoRequisicoes.splice(novoIndex, 0, req);
  renumerarOrdemCarregamento();
  renderizarRequisicoesCarregamento();
}

function alterarOrdemRequisicaoCarregamento(id, value) {
  normalizarOrdemCarregamento();
  const atual = carregamentoRequisicoes.findIndex(req => String(req.id) === String(id));
  if (atual < 0) return;

  const destino = Math.min(
    Math.max(Number(value) || 1, 1),
    carregamentoRequisicoes.length
  ) - 1;

  const [req] = carregamentoRequisicoes.splice(atual, 1);
  carregamentoRequisicoes.splice(destino, 0, req);
  renumerarOrdemCarregamento();
  renderizarRequisicoesCarregamento();
}

// Itens que devem ser totalizados separadamente dos equipamentos de carga
const ITENS_ESPECIAIS_NOMES = ['ESTEIRA', 'FORMA'];
function isItemEspecial(nomeItem) {
  const n = normalizarTexto(nomeItem || '');
  return ITENS_ESPECIAIS_NOMES.some(esp => n.includes(esp));
}

function renderizarTotalizadorCarregamento() {
  const conteudo = document.getElementById('carregamentoTotalizadorConteudo');
  const wrapper  = document.getElementById('carregamentoTotalizador');
  if (!conteudo) return;

  const mapa = calcularTotalizadorCarregamento();
  if (!mapa.size) { wrapper?.classList.add('hidden'); return; }
  wrapper?.classList.remove('hidden');

  const regular   = [...mapa.values()].filter(e => !isItemEspecial(e.nome));
  const especiais = [...mapa.values()].filter(e =>  isItemEspecial(e.nome));

  function renderBloco(lista) {
    let te = 0, tr_ = 0, teNovo = 0, teUsado = 0, trNovo = 0, trUsado = 0;
    lista.forEach(e => {
      te += e.entrega; tr_ += e.retorno;
      teNovo += e.entregaNovo; teUsado += e.entregaUsado;
      trNovo += e.retornoNovo; trUsado += e.retornoUsado;
    });
    const linhas = lista.map(e => `<tr>
      <td>${escapeHtml(e.nome)}</td>
      <td class="col-num col-entrega">${e.entregaNovo || '-'}</td>
      <td class="col-num col-entrega-usado">${e.entregaUsado || '-'}</td>
      <td class="col-num col-retorno-novo">${e.retornoNovo || '-'}</td>
      <td class="col-num col-retorno">${e.retornoUsado || '-'}</td>
    </tr>`).join('');
    return `<div class="totalizador-bloco">
      <div class="totalizador-cards">
        <div class="tot-card tot-card-carregar">
          <div class="tot-card-label"><i class="fas fa-arrow-up"></i> Total a Carregar</div>
          <div class="tot-card-value">${te}</div>
          <div class="tot-card-sub">itens</div>
          <div class="tot-card-breakdown">
            <span class="tot-breakdown-novo">N: ${teNovo}</span>
            <span class="tot-breakdown-usado">U: ${teUsado}</span>
          </div>
        </div>
        <div class="tot-card tot-card-retirar">
          <div class="tot-card-label"><i class="fas fa-arrow-down"></i> Total a Retirar</div>
          <div class="tot-card-value">${tr_}</div>
          <div class="tot-card-sub">itens</div>
          <div class="tot-card-breakdown">
            <span class="tot-breakdown-novo">N: ${trNovo}</span>
            <span class="tot-breakdown-usado">U: ${trUsado}</span>
          </div>
        </div>
      </div>
      <table class="totalizador-detalhe-table">
        <thead>
          <tr>
            <th rowspan="2" class="th-equipamento">Equipamento</th>
            <th colspan="2" class="col-num col-entrega">↑ Carregar</th>
            <th colspan="2" class="col-num col-retorno">↓ Retirar</th>
          </tr>
          <tr>
            <th class="col-num col-num-sub col-entrega">Novos</th>
            <th class="col-num col-num-sub col-entrega-usado">Usados</th>
            <th class="col-num col-num-sub col-retorno-novo">Novos</th>
            <th class="col-num col-num-sub col-retorno">Usados</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
  }

  let html = renderBloco(regular);

  if (especiais.length) {
    html += `<div class="totalizador-separador-bloco">
      <span><i class="fas fa-exchange-alt"></i>&nbsp;Esteiras &amp; Formas</span>
    </div>`;
    html += renderBloco(especiais);
  }

  conteudo.innerHTML = html;
}

function renderizarRequisicoesCarregamento() {
  const tbody = document.getElementById('corpoCarregamentoRequisicoes');
  const section = document.getElementById('carregamentoRequisicoesList');
  if (!tbody) return;

  if (!carregamentoRequisicoes.length) {
    section?.classList.add('hidden');
    document.getElementById('carregamentoTotalizador')?.classList.add('hidden');
    return;
  }

  normalizarOrdemCarregamento();
  section?.classList.remove('hidden');
  tbody.innerHTML = carregamentoRequisicoes.map((req, index) => {
    const numItens = Array.isArray(req.itens) ? req.itens.filter(i => Number(i.quantidade) > 0).length : 0;
    const idEsc = escapeHtml(String(req.id));
    const ordem = index + 1;
    return `<tr>
      <td class="ordem-carga-cell">
        <div class="ordem-carga-control">
          <input type="text"
            class="ordem-carga-input"
            value="${ordem}"
            inputmode="numeric"
            pattern="[0-9]*"
            min="1"
            max="${carregamentoRequisicoes.length}"
            data-ordem-req-car="${idEsc}"
            title="Ordem de carregamento">
          <div class="ordem-carga-actions">
            <button type="button" class="ordem-carga-btn" data-mover-req-car="${idEsc}" data-direcao="-1" title="Subir" ${index === 0 ? 'disabled' : ''}>
              <i class="fas fa-chevron-up"></i>
            </button>
            <button type="button" class="ordem-carga-btn" data-mover-req-car="${idEsc}" data-direcao="1" title="Descer" ${index === carregamentoRequisicoes.length - 1 ? 'disabled' : ''}>
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
        </div>
      </td>
      <td title="${escapeHtml(req.arquivo)}">${escapeHtml(req.arquivo)}</td>
      <td>${escapeHtml(req.supervisor || '-')}</td>
      <td title="${escapeHtml(req.cliente_nome || '-')}">${escapeHtml(req.cliente_nome || '-')}</td>
      <td>${escapeHtml(req.motivo || '-')}</td>
      <td class="col-num">${numItens}</td>
      <td><button type="button" class="btn-icon delete" data-remover-req-car="${idEsc}" title="Remover"><i class="fas fa-times"></i></button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-ordem-req-car]').forEach((input, index) => {
    input.value = String(index + 1);
  });

  renderizarTotalizadorCarregamento();
}

let sortModalReq = { col: 'data', dir: 'desc' };

function renderizarModalRequisicoesPendentes() {
  const supervisor = normalizarBusca(document.getElementById('buscaSupervisorCarregamento')?.value);
  const cliente   = normalizarBusca(document.getElementById('buscaClienteCarregamento')?.value);
  const motivo    = normalizarBusca(document.getElementById('filtroMotivoCarregamento')?.value);
  const tbody = document.getElementById('corpoModalRequisicoesPendentes');
  if (!tbody) return;

  let pendentes = requisicoesSalvas.filter(req => {
    const statusOk    = String(req.status || '').toUpperCase() === 'PENDENTE';
    const supervisorOk = !supervisor || normalizarBusca(req.supervisor || '').includes(supervisor);
    const clienteOk   = !cliente   || normalizarBusca(req.cliente_nome || '').includes(cliente);
    const motivoOk    = !motivo    || normalizarBusca(req.motivo || '') === motivo;
    return statusOk && supervisorOk && clienteOk && motivoOk;
  });

  const colMap = { arquivo: 'arquivo', supervisor: 'supervisor', cliente: 'cliente_nome', motivo: 'motivo', data: 'data_requisicao' };
  const sortKey = colMap[sortModalReq.col] || 'data_requisicao';
  const sortDir = sortModalReq.dir;
  pendentes.sort((a, b) => {
    const va = String(a[sortKey] || '');
    const vb = String(b[sortKey] || '');
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  document.querySelectorAll('#modalAdicionarRequisicoes .th-sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.sortCol === sortModalReq.col) {
      icon.className = `fas fa-sort-${sortDir === 'asc' ? 'up' : 'down'} sort-icon sort-active`;
    } else {
      icon.className = 'fas fa-sort sort-icon';
    }
  });

  if (!pendentes.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6c757d;">Nenhuma requisição PENDENTE encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = pendentes.map(req => {
    const jaAdicionada = carregamentoRequisicoes.some(r => String(r.id) === String(req.id));
    return `<tr>
      <td title="${escapeHtml(req.arquivo)}">${escapeHtml(req.arquivo)}</td>
      <td>${escapeHtml(req.supervisor || '-')}</td>
      <td title="${escapeHtml(req.cliente_nome || '-')}">${escapeHtml(req.cliente_nome || '-')}</td>
      <td>${escapeHtml(req.motivo || '-')}</td>
      <td>${escapeHtml(formatarData(req.data_requisicao))}</td>
      <td style="text-align:center;">
        <button type="button"
          class="btn-sm-add ${jaAdicionada ? 'btn-sm-added' : 'btn-glass btn-green'}"
          data-adicionar-req-car="${escapeHtml(String(req.id))}"
          title="${jaAdicionada ? 'Já adicionada' : 'Adicionar'}"
          ${jaAdicionada ? 'disabled' : ''}>
          <i class="fas ${jaAdicionada ? 'fa-check' : 'fa-plus'}"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function adicionarRequisicaoNoCarregamento(id) {
  const req = requisicoesSalvas.find(r => String(r.id) === String(id));
  if (!req || carregamentoRequisicoes.some(r => String(r.id) === String(id))) return;

  req.ordem = proximaOrdemCarregamento();
  req.ordem_carregamento = req.ordem;
  carregamentoRequisicoes.push(req);
  renderizarRequisicoesCarregamento();

  const btn = document.querySelector(`[data-adicionar-req-car="${CSS.escape(String(id))}"]`);
  if (btn) {
    btn.disabled = true;
    btn.className = 'btn-sm-add btn-sm-added';
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.title = 'Já adicionada';
  }
}

function removerRequisicaoDoCarregamento(id) {
  carregamentoRequisicoes = carregamentoRequisicoes.filter(r => String(r.id) !== String(id));
  normalizarOrdemCarregamento();
  renderizarRequisicoesCarregamento();
}

function abrirModalRequisicoesPendentes() {
  renderizarModalRequisicoesPendentes();
  document.getElementById('modalAdicionarRequisicoes')?.classList.remove('hidden');
}

function fecharModalRequisicoesPendentes() {
  document.getElementById('modalAdicionarRequisicoes')?.classList.add('hidden');
}

export async function inicializarCarregamento() {
  if (!document.getElementById('carregamentoPlaca')) return;

  const [{ data: veiculos }, { data: motoristas }] = await Promise.all([
    supabaseClient.from('veiculos').select('placa, modelo, tipo, filial, situacao').eq('situacao', 'ativo').order('placa'),
    supabaseClient.from('funcionario').select('nome, nome_completo, funcao')
      .or('funcao.ilike.%Motorista%,funcao.ilike.%Lider%,funcao.ilike.%Líder%')
      .order('nome')
  ]);

  veiculosLista = veiculos || [];
  popularPlacasDatalist();
  popularMotoristasDatalist(motoristas || []);

  document.getElementById('btnSalvarCarregamento')?.addEventListener('click', salvarCarregamento);

  document.getElementById('btnAdicionarRequisicoesCarregamento')?.addEventListener('click', abrirModalRequisicoesPendentes);
  document.getElementById('btnFecharModalAdicionarReq')?.addEventListener('click', fecharModalRequisicoesPendentes);
  document.getElementById('btnConfirmarModalAdicionarReq')?.addEventListener('click', fecharModalRequisicoesPendentes);
  document.getElementById('modalAdicionarRequisicoes')?.addEventListener('click', e => {
    if (e.target.id === 'modalAdicionarRequisicoes') fecharModalRequisicoesPendentes();
  });

  document.getElementById('btnBuscarReqModal')?.addEventListener('click', renderizarModalRequisicoesPendentes);

  ['buscaSupervisorCarregamento', 'buscaClienteCarregamento'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderizarModalRequisicoesPendentes);
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); renderizarModalRequisicoesPendentes(); }
    });
  });
  document.getElementById('filtroMotivoCarregamento')?.addEventListener('change', renderizarModalRequisicoesPendentes);

  document.querySelector('#modalAdicionarRequisicoes thead')?.addEventListener('click', e => {
    const th = e.target.closest('.th-sortable');
    if (!th) return;
    const col = th.dataset.sortCol;
    if (sortModalReq.col === col) {
      sortModalReq.dir = sortModalReq.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortModalReq.col = col;
      sortModalReq.dir = col === 'data' ? 'desc' : 'asc';
    }
    renderizarModalRequisicoesPendentes();
  });

  document.getElementById('corpoModalRequisicoesPendentes')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-adicionar-req-car]');
    if (btn && !btn.disabled) adicionarRequisicaoNoCarregamento(btn.dataset.adicionarReqCar);
  });

  document.getElementById('corpoCarregamentoRequisicoes')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-remover-req-car]');
    if (btn) removerRequisicaoDoCarregamento(btn.dataset.removerReqCar);

    const btnMover = e.target.closest('[data-mover-req-car]');
    if (btnMover) moverRequisicaoCarregamento(btnMover.dataset.moverReqCar, Number(btnMover.dataset.direcao));
  });

  document.getElementById('corpoCarregamentoRequisicoes')?.addEventListener('change', e => {
    const input = e.target.closest('[data-ordem-req-car]');
    if (input) alterarOrdemRequisicaoCarregamento(input.dataset.ordemReqCar, input.value);
  });
}

// === HISTÓRICO DE CARREGAMENTOS ===

let carregamentosSalvos = [];
let carregamentoEditandoId = null;

async function carregarHistoricoCarregamentos() {
  const tbody = document.getElementById('corpoHistoricoCarregamentos');
  if (!tbody) return;

  const { data, error } = await supabaseClient
    .from(CARREGAMENTOS_TABLE)
    .select('*')
    .order('data_saida', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar histórico:', error);
    tbody.innerHTML = `<tr><td colspan="9" class="historico-loading">Erro ao carregar histórico.</td></tr>`;
    return;
  }

  carregamentosSalvos = data || [];
  renderizarHistoricoCarregamentos();
}

function renderizarHistoricoCarregamentos() {
  const tbody = document.getElementById('corpoHistoricoCarregamentos');
  if (!tbody) return;

  if (!carregamentosSalvos.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="historico-loading">Nenhum carregamento salvo.</td></tr>`;
    return;
  }

  tbody.innerHTML = carregamentosSalvos.map(car => {
    const dataFmt = formatarData(car.data_saida);
    const criadoEm = car.created_at ? new Date(car.created_at).toLocaleDateString('pt-BR') : '-';
    const idEsc = escapeHtml(String(car.id));
    return `<tr>
      <td><strong>${escapeHtml(dataFmt)}</strong><br><small style="color:#888">${criadoEm}</small></td>
      <td><span class="hist-placa">${escapeHtml(car.placa)}</span></td>
      <td style="font-size:0.85rem">${escapeHtml(car.modelo_veiculo || '-')}</td>
      <td>${escapeHtml(car.motorista)}</td>
      <td class="col-num"><span class="badge-req">${car.total_requisicoes || 0}</span></td>
      <td class="col-num col-entrega"><strong>${car.total_entrega || 0}</strong></td>
      <td class="col-num col-retorno"><strong>${car.total_retorno || 0}</strong></td>
      <td style="font-size:0.78rem;color:#888">${escapeHtml(car.usuario || '-')}</td>
      <td style="display:flex;gap:6px;align-items:center">
        <button type="button" class="hist-btn-resumo"
          data-resumo-carregamento="${idEsc}"
          title="Gerar resumo deste carregamento">
          <i class="fas fa-file-alt"></i> Resumo
        </button>
        <button type="button" class="hist-btn-editar"
          data-editar-carregamento="${idEsc}"
          title="Editar este carregamento">
          <i class="fas fa-pencil-alt"></i> Editar
        </button>
        <button type="button" class="btn-icon delete hist-btn-cancelar"
          data-cancelar-carregamento="${idEsc}"
          title="Cancelar carregamento e reverter requisições para PENDENTE">
          <i class="fas fa-times-circle"></i> Cancelar
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function gerarResumoCarregamento(id) {
  const modal   = document.getElementById('modalResumoCarregamento');
  const conteudo = document.getElementById('conteudoResumoCarregamento');
  if (!modal || !conteudo) return;

  conteudo.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#006937"></i></div>';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const [{ data: car, error: errCar }, { data: reqs, error: errReqs }] = await Promise.all([
      supabaseClient.from(CARREGAMENTOS_TABLE).select('*').eq('id', id).single(),
      supabaseClient.from(REQUISICOES_TABLE)
        .select('arquivo, cliente_nome, motivo, supervisor, ordem, data_requisicao, itens, observacao')
        .eq('carregamento_id', id)
        .order('ordem', { ascending: true })
        .order('supervisor')
    ]);

    if (errCar) throw errCar;
    if (errReqs) throw errReqs;

    // Recalcular totalizador por item usando a mesma lógica do carregamento
    const mapaItens = new Map();
    (reqs || []).forEach(req => {
      const itens = Array.isArray(req.itens) ? req.itens : [];
      const temRetornoObs = itens.some(i => i.de_observacao);
      itens.forEach(item => {
        const qtd = Number(item.quantidade) || 0;
        if (qtd <= 0) return;
        const key = item.item_nome || item.equipamento || '?';
        if (!mapaItens.has(key)) mapaItens.set(key, {
          nome: key, entrega: 0, entregaNovo: 0, entregaUsado: 0,
          retorno: 0, retornoUsado: 0  // retirada é sempre USADO
        });
        const e   = mapaItens.get(key);
        const dir = direcionarItemCarregamento(item, req.motivo, temRetornoObs);
        if (dir === 'troca') {
          e.entrega += qtd; e.entregaNovo += qtd;   // troca entrega como NOVO
          e.retorno += qtd; e.retornoUsado += qtd;  // retira como USADO
        } else if (dir === 'entrega') {
          e.entrega += qtd;
          if (item.usado) e.entregaUsado += qtd; else e.entregaNovo += qtd;
        } else {
          e.retorno += qtd;
          e.retornoUsado += qtd; // retirada do cliente: sempre USADO
        }
      });
    });

    const reqsOrdenadas = (reqs || [])
      .map((req, index) => ({ req, index, ordem: obterOrdemCarregamento(req, index) }))
      .sort((a, b) => (a.ordem - b.ordem) || (a.index - b.index))
      .map(item => item.req);

    conteudo.innerHTML = renderResumoHTML(car, reqsOrdenadas, mapaItens);
  } catch (err) {
    console.error('Erro ao gerar resumo:', err);
    conteudo.innerHTML = `<p style="color:#c0392b;padding:30px;text-align:center">Erro ao carregar dados: ${escapeHtml(err.message)}</p>`;
  }
}

function renderResumoHTML(car, reqs, mapaItens) {
  const agora = new Date().toLocaleString('pt-BR');

  const reqRows = reqs.map((req, index) => `<tr>
    <td class="resumo-num-cel">${escapeHtml(obterOrdemCarregamento(req, index))}</td>
    <td>${escapeHtml(req.cliente_nome || '-')}</td>
    <td>${escapeHtml(req.motivo || '-')}</td>
    <td>${escapeHtml(req.supervisor || '-')}</td>
    <td>${escapeHtml(formatarData(req.data_requisicao))}</td>
    <td>${escapeHtml(req.arquivo || '-')}</td>
  </tr>`).join('');

  const regular   = [...mapaItens.values()].filter(e => !isItemEspecial(e.nome));
  const especiais = [...mapaItens.values()].filter(e =>  isItemEspecial(e.nome));

  const somarBloco = lista => lista.reduce((acc, e) => ({
    entrega:      acc.entrega      + e.entrega,
    entregaNovo:  acc.entregaNovo  + e.entregaNovo,
    entregaUsado: acc.entregaUsado + e.entregaUsado,
    retorno:      acc.retorno      + e.retorno,
    retornoUsado: acc.retornoUsado + e.retornoUsado
  }), { entrega: 0, entregaNovo: 0, entregaUsado: 0, retorno: 0, retornoUsado: 0 });

  const totReg = somarBloco(regular);
  const totEsp = somarBloco(especiais);
  const teReg = totReg.entrega, trReg = totReg.retorno;
  const teEsp = totEsp.entrega, trEsp = totEsp.retorno;

  const n = v => v > 0 ? v : '-';

  const linhasItem = lista => lista.map(e => `<tr>
    <td>${escapeHtml(e.nome)}</td>
    <td class="resumo-num-cel col-entrega">${n(e.entrega)}</td>
    <td class="resumo-num-cel col-entrega resumo-sub-novo">${n(e.entregaNovo)}</td>
    <td class="resumo-num-cel col-entrega resumo-sub-usado">${n(e.entregaUsado)}</td>
    <td class="resumo-num-cel col-retorno">${n(e.retorno)}</td>
    <td class="resumo-num-cel col-retorno resumo-sub-usado">${n(e.retornoUsado)}</td>
  </tr>`).join('');

  const linhaSubtotal = (label, tot, colspan = 1) => `
    <tr class="resumo-subtotal-row">
      <td colspan="${colspan}">${label}</td>
      <td class="resumo-num-cel col-entrega">${n(tot.entrega)}</td>
      <td class="resumo-num-cel col-entrega resumo-sub-novo">${n(tot.entregaNovo)}</td>
      <td class="resumo-num-cel col-entrega resumo-sub-usado">${n(tot.entregaUsado)}</td>
      <td class="resumo-num-cel col-retorno">${n(tot.retorno)}</td>
      <td class="resumo-num-cel col-retorno resumo-sub-usado">${n(tot.retornoUsado)}</td>
    </tr>`;

  const blocoEspeciais = especiais.length ? `
    <tr class="resumo-sep-row"><td colspan="6"><i class="fas fa-exchange-alt"></i> Esteiras &amp; Formas</td></tr>
    ${linhasItem(especiais)}
    ${linhaSubtotal('Subtotal Esteiras &amp; Formas', totEsp)}` : '';

  return `<div class="resumo-print-area">

    <div class="resumo-topo">
      <div class="resumo-logo-wrap">
        <img src="logo.png" alt="Marquespan" class="resumo-logo" onerror="this.style.display='none'">
      </div>
      <div class="resumo-titulo-wrap">
        <h2 class="resumo-titulo">Resumo de Carregamento</h2>
        <p class="resumo-subtitulo">Gerado em ${agora}</p>
      </div>
    </div>

    <div class="resumo-info-grid">
      <div class="resumo-info-item">
        <span class="resumo-label">Data de Saída</span>
        <strong class="resumo-valor">${escapeHtml(formatarData(car.data_saida))}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Placa</span>
        <strong class="resumo-valor resumo-placa-tag">${escapeHtml(car.placa)}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Modelo / Tipo</span>
        <strong class="resumo-valor">${escapeHtml(car.modelo_veiculo || '-')}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Motorista</span>
        <strong class="resumo-valor">${escapeHtml(car.motorista)}</strong>
      </div>
      <div class="resumo-info-item">
        <span class="resumo-label">Salvo por</span>
        <strong class="resumo-valor">${escapeHtml(car.usuario || '-')}</strong>
      </div>
    </div>

    <div class="resumo-strip">
      <div class="resumo-strip-item">
        <span class="resumo-strip-num">${car.total_requisicoes || 0}</span>
        <span class="resumo-strip-label">Requisições</span>
      </div>
      <div class="resumo-strip-item resumo-strip-carregar">
        <span class="resumo-strip-num">${car.total_entrega || 0}</span>
        <span class="resumo-strip-label">↑ Total a Carregar</span>
      </div>
      <div class="resumo-strip-item resumo-strip-retirar">
        <span class="resumo-strip-num">${car.total_retorno || 0}</span>
        <span class="resumo-strip-label">↓ Total a Retirar</span>
      </div>
    </div>

    <h4 class="resumo-section-h"><i class="fas fa-list-ul"></i> Requisições Incluídas</h4>
    <table class="resumo-table resumo-table-req">
      <thead><tr>
        <th class="resumo-num-cel">Ordem</th><th>Cliente</th><th>Motivo</th><th>Supervisor</th><th>Data Req.</th><th>Arquivo</th>
      </tr></thead>
      <tbody>${reqRows || '<tr><td colspan="6" style="text-align:center;color:#888">Sem requisições</td></tr>'}</tbody>
    </table>

    <h4 class="resumo-section-h"><i class="fas fa-boxes"></i> Totalizador de Equipamentos</h4>
    <table class="resumo-table resumo-table-totalizador">
      <thead>
        <tr>
          <th rowspan="2" class="resumo-th-equip">Equipamento</th>
          <th colspan="3" class="resumo-num-cel col-entrega resumo-th-grupo">↑ Carregar ao Cliente</th>
          <th colspan="2" class="resumo-num-cel col-retorno resumo-th-grupo">↓ Retirar do Cliente</th>
        </tr>
        <tr>
          <th class="resumo-num-cel col-entrega resumo-th-sub">Total</th>
          <th class="resumo-num-cel col-entrega resumo-th-sub resumo-sub-novo">Novo</th>
          <th class="resumo-num-cel col-entrega resumo-th-sub resumo-sub-usado">Usado</th>
          <th class="resumo-num-cel col-retorno resumo-th-sub">Total</th>
          <th class="resumo-num-cel col-retorno resumo-th-sub resumo-sub-usado">Usado</th>
        </tr>
      </thead>
      <tbody>
        ${linhasItem(regular)}
        ${linhaSubtotal('Subtotal Equipamentos', totReg)}
        ${blocoEspeciais}
      </tbody>
      <tfoot>
        <tr class="resumo-total-final">
          <td><strong>TOTAL GERAL</strong></td>
          <td class="resumo-num-cel col-entrega"><strong>${n(totReg.entrega + totEsp.entrega)}</strong></td>
          <td class="resumo-num-cel col-entrega resumo-sub-novo"><strong>${n(totReg.entregaNovo + totEsp.entregaNovo)}</strong></td>
          <td class="resumo-num-cel col-entrega resumo-sub-usado"><strong>${n(totReg.entregaUsado + totEsp.entregaUsado)}</strong></td>
          <td class="resumo-num-cel col-retorno"><strong>${n(totReg.retorno + totEsp.retorno)}</strong></td>
          <td class="resumo-num-cel col-retorno resumo-sub-usado"><strong>${n(totReg.retornoUsado + totEsp.retornoUsado)}</strong></td>
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
      Marquespan Alimentos &bull; Documento gerado automaticamente &bull; ${agora}
    </div>
  </div>`;
}

async function cancelarCarregamento(id) {
  const car = carregamentosSalvos.find(c => c.id === id);
  const info = car ? `${car.placa} – ${formatarData(car.data_saida)}` : '';
  const nReq = car?.total_requisicoes || 0;

  if (!confirm(`Cancelar o carregamento ${info}?\n\n${nReq} requisição(ões) voltarão para PENDENTE.`)) return;

  const statusEl = document.getElementById('statusHistorico');
  const exibirStatus = (msg, erro = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden', 'success', 'error');
    statusEl.classList.add(erro ? 'error' : 'success');
  };

  try {
    const { error: errReq } = await supabaseClient
      .from(REQUISICOES_TABLE)
      .update({
        status: 'PENDENTE',
        ordem: null,
        carregado_em: null,
        carregamento_id: null,
        carregamento_placa: null,
        carregamento_motorista: null,
        carregamento_data_saida: null,
        carregamento_modelo: null
      })
      .eq('carregamento_id', id);

    if (errReq) throw errReq;

    const { error: errCar } = await supabaseClient
      .from(CARREGAMENTOS_TABLE)
      .delete()
      .eq('id', id);

    if (errCar) throw errCar;

    exibirStatus(`Carregamento ${info} cancelado. ${nReq} requisição(ões) revertidas para PENDENTE.`);
    await Promise.all([carregarHistoricoCarregamentos(), carregarRequisicoesBanco()]);
  } catch (err) {
    console.error('Erro ao cancelar carregamento:', err);
    exibirStatus(`Erro ao cancelar: ${err.message}`, true);
  }
}

async function editarCarregamento(id) {
  const car = carregamentosSalvos.find(c => c.id === id);
  if (!car) return;

  const { data: reqs, error } = await supabaseClient
    .from(REQUISICOES_TABLE)
    .select('*')
    .eq('carregamento_id', id)
    .order('ordem', { ascending: true })
    .order('supervisor');

  if (error) {
    alert('Erro ao carregar requisições do carregamento.');
    console.error(error);
    return;
  }

  // Preencher formulário
  document.getElementById('carregamentoPlaca').value       = car.placa        || '';
  document.getElementById('carregamentoMotorista').value   = car.motorista     || '';
  document.getElementById('carregamentoDataSaida').value   = car.data_saida    || '';

  // Carregar requisições no estado
  carregamentoRequisicoes = reqs || [];
  normalizarOrdemCarregamento();
  carregamentoEditandoId  = id;

  // Mostrar banner de edição
  const banner  = document.getElementById('carregamentoEdicaoBanner');
  const infoEl  = document.getElementById('carregamentoEdicaoInfo');
  if (banner && infoEl) {
    infoEl.textContent = `Editando: ${car.placa} – ${formatarData(car.data_saida)} (${car.motorista})`;
    banner.classList.remove('hidden');
  }

  // Atualizar texto do botão salvar
  const btnSalvar = document.getElementById('btnSalvarCarregamento');
  if (btnSalvar) btnSalvar.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Carregamento';

  // Navegar para a aba Carregamento e renderizar
  document.querySelector('[data-tab-target="carregamento"]')?.click();
  renderizarRequisicoesCarregamento();
}

function cancelarEdicaoCarregamento() {
  carregamentoEditandoId  = null;
  carregamentoRequisicoes = [];

  document.getElementById('carregamentoPlaca').value     = '';
  document.getElementById('carregamentoMotorista').value = '';
  document.getElementById('carregamentoDataSaida').value = '';
  document.getElementById('carregamentoEdicaoBanner')?.classList.add('hidden');

  const btnSalvar = document.getElementById('btnSalvarCarregamento');
  if (btnSalvar) btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Carregamento';

  renderizarRequisicoesCarregamento();
}

export async function inicializarHistorico() {
  if (!document.getElementById('corpoHistoricoCarregamentos')) return;

  await carregarHistoricoCarregamentos();

  document.getElementById('btnRecarregarHistorico')?.addEventListener('click', carregarHistoricoCarregamentos);

  document.getElementById('corpoHistoricoCarregamentos')?.addEventListener('click', async e => {
    const btnCancelar = e.target.closest('[data-cancelar-carregamento]');
    if (btnCancelar) { await cancelarCarregamento(btnCancelar.dataset.cancelarCarregamento); return; }

    const btnResumo = e.target.closest('[data-resumo-carregamento]');
    if (btnResumo) { await gerarResumoCarregamento(btnResumo.dataset.resumoCarregamento); return; }

    const btnEditar = e.target.closest('[data-editar-carregamento]');
    if (btnEditar) await editarCarregamento(btnEditar.dataset.editarCarregamento);
  });

  document.getElementById('btnCancelarEdicaoCarregamento')?.addEventListener('click', cancelarEdicaoCarregamento);

  // Fechar modal
  document.getElementById('btnFecharResumo')?.addEventListener('click', fecharModalResumo);
  document.getElementById('modalResumoCarregamento')?.addEventListener('click', e => {
    if (e.target.id === 'modalResumoCarregamento') fecharModalResumo();
  });

  // Imprimir
  document.getElementById('btnImprimirResumo')?.addEventListener('click', imprimirResumo);

  // Recarregar ao entrar na aba
  document.querySelectorAll('[data-tab-target="historico"]').forEach(btn =>
    btn.addEventListener('click', carregarHistoricoCarregamentos)
  );
}

function fecharModalResumo() {
  document.getElementById('modalResumoCarregamento')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function imprimirResumo() {
  const conteudo = document.getElementById('conteudoResumoCarregamento');
  if (!conteudo) return;

  // Base URL para referenciar CSS e imagens corretamente
  const base = window.location.origin
    + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

  // Captura o link do CSS da página atual
  const cssLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(l => l.href.includes('cadastro-carregamento.css'));
  const cssHref = cssLink ? cssLink.href : `${base}css/cadastro-carregamento.css`;

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

// ===== CARREGAR VEÍCULO (CONFERÊNCIA DE CARREGAMENTO) =====

let conferenciaAtiva = null;   // { requisicoes[], placa, motorista, dataSaida }
let conferenciaIndex = 0;      // índice da requisição atual
let conferenciaResultados = {}; // { [reqId]: [{ status: null|'ok'|'divergencia', obs: '' }, ...] }
let conferenciaEmModoApp = false;

function inicializarResultadosConferencia(requisicoes) {
  conferenciaResultados = {};
  requisicoes.forEach(req => {
    conferenciaResultados[req.id] = (req.itens || []).map(() => ({
      status:        null,
      obs:           '',
      wasAutoSet:    false,   // true = status foi gerado automaticamente por edição de campo
      qtdReal:       null,    // qtd encontrada fisicamente (null = igual à requisição)
      modeloReal:    null,
      estadoReal:    null,    // 'novo' | 'usado' | '' | null
      obsReal:       null,
      autoObs:       ''       // texto gerado automaticamente descrevendo as modificações
    }));
  });
}

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

function atualizarProgressoConferencia() {
  const { totalItens, confirmados } = calcularTotaisConferencia();
  const pct = totalItens > 0 ? Math.round(confirmados / totalItens * 100) : 0;
  const el = document.getElementById('cvProgressoItens');
  const bar = document.getElementById('cvBarraProgresso');
  if (el)  el.textContent   = `${confirmados} de ${totalItens} itens confirmados (${pct}%)`;
  if (bar) bar.style.width  = `${pct}%`;
}

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
    res.status     = 'divergencia';
    res.wasAutoSet = true;
  } else if (res.wasAutoSet && !res.obs?.trim()) {
    res.status     = null;
    res.wasAutoSet = false;
  }

  // Atualização parcial do DOM (sem recriar o card todo e preservar o foco)
  const row = document.querySelector(`[data-cv-item-idx="${itemIdx}"]`);
  if (row) {
    row.classList.toggle('cv-row-ok',  res.status === 'ok');
    row.classList.toggle('cv-row-div', res.status === 'divergencia');
    row.querySelector('[data-cv-ok]')?.classList.toggle('ativo',  res.status === 'ok');
    row.querySelector('[data-cv-div]')?.classList.toggle('ativo', res.status === 'divergencia');

    // Badge de status dentro do card APP
    const badge = row.querySelector('.cv-app-item-status');
    if (badge) {
      badge.className = `cv-app-item-status ${res.status === 'ok' ? 'cv-status-ok' : res.status === 'divergencia' ? 'cv-status-div' : ''}`;
      badge.textContent = res.status === 'ok' ? '✓ OK' : res.status === 'divergencia' ? '⚠ Div.' : '';
    }

    // Detalhe de divergência
    let divDetail = row.querySelector('.cv-app-div-detail');
    if (res.status === 'divergencia') {
      if (!divDetail) {
        divDetail = document.createElement('div');
        divDetail.className = 'cv-app-div-detail';
        row.appendChild(divDetail);
      }
      divDetail.innerHTML = `
        ${res.autoObs ? `<div class="cv-auto-obs-info"><i class="fas fa-sync-alt"></i> Modificado: ${escapeHtml(res.autoObs)}</div>` : ''}
        <input type="text" class="glass-input cv-obs-input" placeholder="Descreva o motivo da divergência..."
          value="${escapeHtml(res.obs || '')}" data-cv-obs="${itemIdx}">`;
      divDetail.querySelector('[data-cv-obs]')?.addEventListener('input', e => {
        if (conferenciaResultados[reqId]?.[itemIdx]) {
          conferenciaResultados[reqId][itemIdx].obs = e.target.value;
        }
      });
    } else {
      divDetail?.remove();
    }
  }

  atualizarProgressoConferencia();
}

function inicializarConferenciaDoCarregamentoAtual() {
  if (!carregamentoRequisicoes.length) return false;
  conferenciaAtiva = {
    requisicoes: carregamentoRequisicoes.map(r => ({ ...r, itens: Array.isArray(r.itens) ? [...r.itens] : [] })),
    placa:       document.getElementById('carregamentoPlaca')?.value     || '',
    motorista:   document.getElementById('carregamentoMotorista')?.value || '',
    dataSaida:   document.getElementById('carregamentoDataSaida')?.value || ''
  };
  conferenciaIndex = 0;
  inicializarResultadosConferencia(conferenciaAtiva.requisicoes);
  return true;
}

function popularSeletorHistoricoConferencia() {
  const select = document.getElementById('cvSeletorCarregamento');
  if (!select) return;

  // Apenas carregamentos com pelo menos uma req AGUARDANDO CONFERENCIA
  const idsNaFila = new Set(
    (requisicoesSalvas || [])
      .filter(r => r.status === 'AGUARDANDO CONFERENCIA' && r.carregamento_id)
      .map(r => r.carregamento_id)
  );

  select.innerHTML = '<option value="">Selecione um carregamento...</option>';
  (carregamentosSalvos || [])
    .filter(c => idsNaFila.has(c.id))
    .forEach(car => {
      const op = document.createElement('option');
      op.value = car.id;
      const data = car.data_saida ? car.data_saida.split('-').reverse().join('/') : '-';
      op.textContent = `${data} · ${car.placa || '-'} · ${car.motorista || '-'}`;
      select.appendChild(op);
    });

  // Exibe aviso se fila vazia
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
    const data_saida = c.data_saida ? c.data_saida.split('-').reverse().join('/') : '-';
    const fin_em     = c.finalizado_em ? new Date(c.finalizado_em).toLocaleString('pt-BR') : '-';
    const temDiv     = c.total_divergencias > 0;
    return `<tr>
      <td>${data_saida}</td>
      <td>${escapeHtml(c.placa || '-')}</td>
      <td>${escapeHtml(c.motorista || '-')}</td>
      <td>${fin_em}</td>
      <td class="text-center"><span class="cv-badge-ok">${c.total_ok}</span></td>
      <td class="text-center">${temDiv ? `<span class="cv-badge-div">${c.total_divergencias}</span>` : '<span class="cv-badge-ok">0</span>'}</td>
      <td class="text-center">
        <button type="button" class="btn-icon view" data-carregar-conferencia="${escapeHtml(c.id)}" title="Reabrir conferência"><i class="fas fa-eye"></i></button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-carregar-conferencia]').forEach(btn => {
    btn.addEventListener('click', () => recarregarConferenciaSalva(btn.dataset.carregarConferencia));
  });
}

async function recarregarConferenciaSalva(confId) {
  const { data: conf, error } = await supabaseClient
    .from(CONFERENCIAS_TABLE)
    .select('*, carregamento_id')
    .eq('id', confId)
    .single();
  if (error || !conf) { alert('Erro ao carregar conferência.'); return; }

  const { data: car } = await supabaseClient
    .from(CARREGAMENTOS_TABLE).select('*').eq('id', conf.carregamento_id).single();
  const { data: reqs } = await supabaseClient
    .from(REQUISICOES_TABLE).select('*').eq('carregamento_id', conf.carregamento_id).order('ordem');

  conferenciaAtiva = {
    requisicoes: reqs || [],
    placa:       conf.placa     || '',
    motorista:   conf.motorista || '',
    dataSaida:   conf.data_saida || ''
  };
  conferenciaIndex = 0;
  inicializarResultadosConferencia(conferenciaAtiva.requisicoes);

  // Restaura os resultados salvos
  if (conf.resultados) {
    Object.assign(conferenciaResultados, conf.resultados);
  }

  renderizarConferenciaUI();
}

async function carregarConferenciaDoHistorico() {
  const id = document.getElementById('cvSeletorCarregamento')?.value;
  if (!id) { alert('Selecione um carregamento.'); return; }

  const { data: car, error: errCar } = await supabaseClient
    .from(CARREGAMENTOS_TABLE).select('*').eq('id', id).single();
  const { data: reqs, error: errReqs } = await supabaseClient
    .from(REQUISICOES_TABLE).select('*').eq('carregamento_id', id).order('ordem');

  if (errCar || errReqs) { alert('Erro ao carregar carregamento.'); return; }

  conferenciaAtiva = {
    requisicoes: (reqs || []),
    placa:       car.placa      || '',
    motorista:   car.motorista  || '',
    dataSaida:   car.data_saida || ''
  };
  conferenciaIndex = 0;
  inicializarResultadosConferencia(conferenciaAtiva.requisicoes);
  renderizarConferenciaUI();
}

function abrirConferenciaTab() {
  const emptyEl       = document.getElementById('cvSemCarregamento');
  const conferenciaEl = document.getElementById('cvConferencia');
  const resumoEl      = document.getElementById('cvResumo');
  const cardEl        = document.getElementById('cvRequisicaoCard');

  // Se ainda não há conferência ativa mas há carregamento preparado, inicia automaticamente
  if (!conferenciaAtiva && carregamentoRequisicoes.length > 0) {
    inicializarConferenciaDoCarregamentoAtual();
  }

  if (conferenciaAtiva && conferenciaAtiva.requisicoes.length > 0) {
    emptyEl?.classList.add('hidden');
    conferenciaEl?.classList.remove('hidden');
    resumoEl?.classList.add('hidden');
    cardEl?.classList.remove('hidden');
    renderizarConferenciaAtual();
  } else {
    emptyEl?.classList.remove('hidden');
    conferenciaEl?.classList.add('hidden');
    popularSeletorHistoricoConferencia();
  }
}

function renderizarConferenciaUI() {
  const emptyEl       = document.getElementById('cvSemCarregamento');
  const conferenciaEl = document.getElementById('cvConferencia');
  const resumoEl      = document.getElementById('cvResumo');
  const cardEl        = document.getElementById('cvRequisicaoCard');
  emptyEl?.classList.add('hidden');
  conferenciaEl?.classList.remove('hidden');
  resumoEl?.classList.add('hidden');
  cardEl?.classList.remove('hidden');
  renderizarConferenciaAtual();
}

function calcularTotaisConferencia() {
  if (!conferenciaAtiva) return { totalItens: 0, confirmados: 0, okCount: 0, divCount: 0 };
  let totalItens = 0, confirmados = 0, okCount = 0, divCount = 0;
  conferenciaAtiva.requisicoes.forEach(req => {
    const resultados = conferenciaResultados[req.id] || [];
    (req.itens || []).forEach((_, idx) => {
      totalItens++;
      const r = resultados[idx];
      if (r?.status === 'ok')         { confirmados++; okCount++; }
      else if (r?.status === 'divergencia') { confirmados++; divCount++; }
    });
  });
  return { totalItens, confirmados, okCount, divCount };
}

function renderizarConferenciaAtual() {
  if (!conferenciaAtiva) return;
  const reqs = conferenciaAtiva.requisicoes;
  const req  = reqs[conferenciaIndex];
  if (!req) return;

  // Progresso global
  const { totalItens, confirmados } = calcularTotaisConferencia();
  const pct = totalItens > 0 ? Math.round(confirmados / totalItens * 100) : 0;
  document.getElementById('cvProgressoTexto').textContent  = `Requisição ${conferenciaIndex + 1} de ${reqs.length}`;
  document.getElementById('cvProgressoItens').textContent  = `${confirmados} de ${totalItens} itens confirmados (${pct}%)`;
  document.getElementById('cvBarraProgresso').style.width  = `${pct}%`;
  document.getElementById('cvReqNumero').textContent       = conferenciaIndex + 1;

  // Botões de navegação
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

  // Card da requisição
  const itens     = req.itens || [];
  const resultados = conferenciaResultados[req.id] || [];
  const itensOkCount = resultados.filter(r => r?.status === 'ok').length;
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
        <button type="button" class="btn-glass btn-sm btn-green cv-btn-todos-ok" data-cv-todos-ok title="Marcar todos como OK">
          <i class="fas fa-check-double"></i> Todos OK
        </button>
      </div>
    </div>`;

  if (conferenciaEmModoApp) {
    // ===== MODO APP: cards compactos com campos editáveis =====
    card.innerHTML = cabecalhoCard + `
      <div class="cv-items-app">
        ${itens.map((item, idx) => {
          const res = resultados[idx] || {};
          const rowCls = res.status === 'ok' ? 'cv-row-ok' : res.status === 'divergencia' ? 'cv-row-div' : '';
          const estadoOrig = item.novo ? 'novo' : item.usado ? 'usado' : '';
          const qtdVal  = res.qtdReal    !== null && res.qtdReal    !== undefined ? res.qtdReal    : (item.quantidade || '');
          const modVal  = res.modeloReal !== null && res.modeloReal !== undefined ? res.modeloReal : (item.modelo    || '');
          const estVal  = res.estadoReal !== null && res.estadoReal !== undefined ? res.estadoReal : estadoOrig;
          const obsVal  = res.obsReal    !== null && res.obsReal    !== undefined ? res.obsReal    : (item.obs       || '');
          return `
            <div class="cv-app-item ${rowCls}" data-cv-item-idx="${idx}">
              <div class="cv-app-item-top">
                <div class="cv-app-item-equip">
                  <span class="cv-app-qtd-orig" title="Qtd. requisitada">${escapeHtml(String(item.quantidade || ''))}</span>
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
                  <input type="number" class="glass-input" value="${escapeHtml(String(qtdVal))}" min="0"
                    data-cv-edit="qtdReal" data-cv-item="${idx}">
                </div>
                <div class="cv-app-field cv-app-field-modelo">
                  <label>Modelo</label>
                  <input type="text" class="glass-input" value="${escapeHtml(modVal)}"
                    data-cv-edit="modeloReal" data-cv-item="${idx}">
                </div>
                <div class="cv-app-field cv-app-field-estado">
                  <label>Estado</label>
                  <select class="glass-input" data-cv-edit="estadoReal" data-cv-item="${idx}">
                    <option value=""  ${estVal === ''      ? 'selected' : ''}>-</option>
                    <option value="novo"  ${estVal === 'novo'  ? 'selected' : ''}>NOVO</option>
                    <option value="usado" ${estVal === 'usado' ? 'selected' : ''}>USADO</option>
                  </select>
                </div>
                <div class="cv-app-field cv-app-field-obs">
                  <label>OBS</label>
                  <input type="text" class="glass-input" value="${escapeHtml(obsVal)}" placeholder="OBS do item"
                    data-cv-edit="obsReal" data-cv-item="${idx}">
                </div>
              </div>
              ${res.status === 'divergencia' ? `
                <div class="cv-app-div-detail">
                  ${res.autoObs ? `<div class="cv-auto-obs-info"><i class="fas fa-sync-alt"></i> Modificado: ${escapeHtml(res.autoObs)}</div>` : ''}
                  <input type="text" class="glass-input cv-obs-input"
                    placeholder="Descreva o motivo da divergência..."
                    value="${escapeHtml(res.obs || '')}"
                    data-cv-obs="${idx}">
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>`;

    // Eventos — edição de campos (usa 'change' para não re-renderizar a cada tecla)
    card.querySelectorAll('[data-cv-edit]').forEach(input => {
      input.addEventListener('change', () => {
        const idx   = Number(input.dataset.cvItem);
        const campo = input.dataset.cvEdit;
        onCampoEditadoConferencia(req.id, idx, campo, input.value, itens[idx]);
      });
    });

  } else {
    // ===== DESKTOP: tabela compacta =====
    card.innerHTML = cabecalhoCard + `
      <div class="table-responsive">
        <table class="glass-table cv-table-conferencia">
          <thead>
            <tr>
              <th class="cv-th-qtd">Qtd</th>
              <th>Equipamento</th>
              <th>Modelo</th>
              <th class="cv-th-estado">Estado</th>
              <th class="cv-th-obs-req">OBS</th>
              <th class="cv-th-status">Conferência</th>
            </tr>
          </thead>
          <tbody>
            ${itens.map((item, idx) => {
              const res = resultados[idx] || { status: null, obs: '' };
              const estado = item.novo ? 'NOVO' : item.usado ? 'USADO' : '';
              const estadoCls = item.novo ? 'estado-badge estado-badge-novo' : item.usado ? 'estado-badge estado-badge-usado' : '';
              const rowCls = res.status === 'ok' ? 'cv-row-ok' : res.status === 'divergencia' ? 'cv-row-div' : '';
              return `
                <tr class="${rowCls}" data-cv-item-idx="${idx}">
                  <td class="cv-th-qtd"><strong>${escapeHtml(String(item.quantidade || ''))}</strong></td>
                  <td>${escapeHtml(item.item_nome || item.equipamento || '-')}</td>
                  <td>${escapeHtml(item.modelo || '-')}</td>
                  <td>${estado ? `<span class="${estadoCls}">${estado}</span>` : '-'}</td>
                  <td>${item.obs ? `<span class="obs-badge${item.obs === 'AUMENTO' ? ' obs-badge-aumento' : ''}">${escapeHtml(item.obs)}</span>` : '-'}</td>
                  <td class="cv-td-status">
                    <div class="cv-status-btns">
                      <button type="button" class="btn-cv-ok${res.status === 'ok' ? ' ativo' : ''}" data-cv-ok="${idx}" title="Conferido OK">
                        <i class="fas fa-check"></i><span class="cv-btn-label"> OK</span>
                      </button>
                      <button type="button" class="btn-cv-div${res.status === 'divergencia' ? ' ativo' : ''}" data-cv-div="${idx}" title="Divergência encontrada">
                        <i class="fas fa-exclamation-triangle"></i><span class="cv-btn-label"> Div.</span>
                      </button>
                    </div>
                    ${res.status === 'divergencia' ? `
                      <input type="text" class="glass-input cv-obs-input"
                        placeholder="Descreva a divergência..."
                        value="${escapeHtml(res.obs || '')}" data-cv-obs="${idx}">
                    ` : ''}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // Eventos comuns (OK, Div, obs, todos-ok)
  card.querySelector('[data-cv-todos-ok]')?.addEventListener('click', () => {
    marcarTodosOkConferencia(req.id, itens.length);
  });
  card.querySelectorAll('[data-cv-ok]').forEach(btn => {
    btn.addEventListener('click', () => marcarItemConferencia(req.id, Number(btn.dataset.cvOk), 'ok'));
  });
  card.querySelectorAll('[data-cv-div]').forEach(btn => {
    btn.addEventListener('click', () => marcarItemConferencia(req.id, Number(btn.dataset.cvDiv), 'divergencia'));
  });
  card.querySelectorAll('[data-cv-obs]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.cvObs);
      if (!conferenciaResultados[req.id]?.[idx]) return;
      conferenciaResultados[req.id][idx].obs = input.value;
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
  for (let i = 0; i < count; i++) {
    conferenciaResultados[reqId][i] = { status: 'ok', obs: '' };
  }
  renderizarConferenciaAtual();
}

function navegarConferencia(delta) {
  if (!conferenciaAtiva) return;
  const reqs = conferenciaAtiva.requisicoes;
  if (delta > 0 && conferenciaIndex >= reqs.length - 1) {
    mostrarResumoConferencia();
    return;
  }
  conferenciaIndex = Math.max(0, Math.min(reqs.length - 1, conferenciaIndex + delta));
  renderizarConferenciaAtual();
}

function calcularTotalizador() {
  if (!conferenciaAtiva) return [];

  // mapa: { [nomeEquip]: { entrega, entregaNovo, entregaUsado, retirada, retiradaUsado } }
  // Retirada do cliente é SEMPRE considerada USADO (nunca NOVO)
  const mapa = {};

  for (const req of conferenciaAtiva.requisicoes) {
    const resultados    = conferenciaResultados[req.id] || [];
    const motivo        = req.motivo || '';
    const ehRetirada    = /retirada/i.test(motivo);
    const ehTroca       = /troca/i.test(motivo);
    const ehEntregaPura = !ehRetirada && !ehTroca;

    for (const [idx, item] of (req.itens || []).entries()) {
      const res = resultados[idx] || {};

      // Quantidade efetiva (usa modificação do conferente se houver)
      const qtd = (res.qtdReal !== null && res.qtdReal !== undefined)
        ? Number(res.qtdReal)
        : Number(item.quantidade || 0);
      if (qtd <= 0) continue;

      // Estado efetivo da ENTREGA (respeita alteração feita durante a conferência)
      let estadoEfetivo;
      if (res.estadoReal !== null && res.estadoReal !== undefined && res.estadoReal !== '') {
        estadoEfetivo = res.estadoReal;
      } else {
        estadoEfetivo = item.novo ? 'novo' : item.usado ? 'usado' : null;
      }
      const isNovo  = estadoEfetivo === 'novo';
      const isUsado = estadoEfetivo === 'usado';

      const key = item.item_nome || item.equipamento || '-';
      if (!mapa[key]) mapa[key] = {
        entrega: 0, entregaNovo: 0, entregaUsado: 0,
        retirada: 0, retiradaUsado: 0  // retirada é sempre USADO
      };

      const somarEntrega = () => {
        mapa[key].entrega     += qtd;
        mapa[key].entregaNovo  += isNovo  ? qtd : 0;
        mapa[key].entregaUsado += isUsado ? qtd : 0;
      };

      const somarRetirada = () => {
        // Sempre USADO — equipamento retirado do cliente nunca é NOVO
        mapa[key].retirada      += qtd;
        mapa[key].retiradaUsado += qtd;
      };

      if (ehRetirada) {
        somarRetirada();
      } else if (ehEntregaPura) {
        somarEntrega();
      } else {
        // Troca / Aumento+Troca
        if (item.obs === 'AUMENTO') {
          somarEntrega();
        } else {
          // Entrega o novo E retira o velho (sempre USADO)
          somarEntrega();
          somarRetirada();
        }
      }
    }
  }

  return Object.entries(mapa)
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([nome, v]) => ({ nome, ...v }));
}

async function mostrarResumoConferencia() {
  if (!conferenciaAtiva) return;
  document.getElementById('cvRequisicaoCard')?.classList.add('hidden');
  document.getElementById('cvResumo')?.classList.remove('hidden');

  // Marca todas as requisições da conferência como CARREGADO e salva a conferência
  try {
    const ids = (conferenciaAtiva.requisicoes || []).map(r => r.id).filter(Boolean);
    if (ids.length) {
      await supabaseClient
        .from(REQUISICOES_TABLE)
        .update({ status: 'CARREGADO' })
        .in('id', ids);
    }

    // Calcula totais para snapshot
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
  } catch (e) {
    console.error('Erro ao salvar conferência:', e);
  }

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

  const totalizador   = calcularTotalizador();
  const totalEntregas = totalizador.reduce((s, r) => s + r.entrega,  0);
  const totalRetiradas= totalizador.reduce((s, r) => s + r.retirada, 0);

  document.getElementById('cvResumoConteudo').innerHTML = `
    <div class="cv-resumo-totais">
      <div class="cv-total-card cv-total-ok"><strong>${totalOk}</strong><span>Confirmados OK</span></div>
      <div class="cv-total-card cv-total-div"><strong>${totalDiv}</strong><span>Divergências</span></div>
      <div class="cv-total-card cv-total-nao"><strong>${totalNao}</strong><span>Não conferidos</span></div>
    </div>

    <div class="table-responsive" style="margin-top:16px">
      <table class="glass-table">
        <thead><tr>
          <th>Cliente</th><th>Motivo</th>
          <th class="text-center">OK</th>
          <th class="text-center">Div.</th>
          <th class="text-center">N/C</th>
        </tr></thead>
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
      ${(()=>{
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

        const renderLinhas = lista => lista.map(row => {
          const eTotal = row.entrega  > 0;
          const rTotal = row.retirada > 0;
          return `<tr>
            <td>${escapeHtml(row.nome)}</td>
            ${cel(row.entrega,       eTotal ? 'cv-cell-entrega'  : '')}
            ${cel(row.entregaNovo,   eTotal ? 'cv-cell-entrega'  : '')}
            ${cel(row.entregaUsado,  eTotal ? 'cv-cell-entrega'  : '')}
            ${cel(row.retirada,      rTotal ? 'cv-cell-retirada' : '')}
            ${cel(row.retiradaUsado, rTotal ? 'cv-cell-retirada' : '')}
          </tr>`;
        }).join('');

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
            <table class="glass-table cv-table-totalizador">
              ${thead}
              <tbody>${renderLinhas(lista)}</tbody>
              <tfoot>${renderSubtotal(lista)}</tfoot>
            </table>
          </div>`;

        let html = regular.length ? renderTabela(regular, '') : '';
        if (especiais.length) html += renderTabela(especiais, 'Esteiras &amp; Formas');
        return html;
      })()}
    </div>`;
}

async function gerarRelatorioConferencia() {
  if (!conferenciaAtiva) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('Biblioteca PDF não carregada.'); return; }

  // ── Carregar logo com fundo branco (padrão do projeto) ──────────────────────
  const logoBase64 = await new Promise(resolve => {
    const img = new Image();
    img.src = 'logo.png';
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = () => resolve(null);
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Cabeçalho padrão Marquespan ──────────────────────────────────────────────
  if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 8, 40, 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 105, 55);
  doc.text('MARQUESPAN', 195, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('CONFERÊNCIA DE CARREGAMENTO', 195, 20, { align: 'right' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 105, 55);
  doc.line(14, 24, 196, 24);

  // ── Dados do carregamento ────────────────────────────────────────────────────
  let y = 33;
  const { okCount, divCount, totalItens } = calcularTotaisConferencia();
  const naoConf = totalItens - okCount - divCount;

  const campos = [
    ['PLACA',       conferenciaAtiva.placa    || '-'],
    ['MOTORISTA',   conferenciaAtiva.motorista || '-'],
    ['DATA SAÍDA',  conferenciaAtiva.dataSaida ? conferenciaAtiva.dataSaida.split('-').reverse().join('/') : '-'],
    ['TOTAL ITENS', `${totalItens} itens  |  OK: ${okCount}  |  Divergencias: ${divCount}  |  Nao conferidos: ${naoConf}`],
  ];

  // dois campos por linha
  for (let i = 0; i < campos.length; i += 2) {
    const [label1, val1] = campos[i];
    const [label2, val2] = campos[i + 1] || [];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 105, 55);
    doc.text(label1 + ':', 14, y);
    if (label2) doc.text(label2 + ':', 108, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    doc.text(String(val1), 14, y);
    if (val2) doc.text(String(val2), 108, y);
    y += 8;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  |  Usuario: ${obterUsuarioAtualNome?.() || '-'}`, 14, y);
  y += 8;

  // ── Uma tabela por requisição ────────────────────────────────────────────────
  for (const req of conferenciaAtiva.requisicoes) {
    if (y > 255) { doc.addPage(); y = 18; }

    // Faixa verde com info da requisição
    doc.setFillColor(0, 105, 55);
    doc.rect(14, y, 182, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    const labelReq = [req.cliente_nome, req.motivo, req.supervisor ? `Sup.: ${req.supervisor}` : null]
      .filter(Boolean).join('  |  ');
    doc.text(labelReq, 16, y + 4.3);
    doc.setTextColor(30, 30, 30);
    y += 8;

    const resultados = conferenciaResultados[req.id] || [];
    const itens      = req.itens || [];

    doc.autoTable({
      startY: y,
      head: [['Qtd', 'Equipamento', 'Modelo', 'Est.', 'OBS Req', 'Status', 'Modificacoes / Motivo']],
      body: itens.map((item, idx) => {
        const res    = resultados[idx] || {};
        const estado = item.novo ? 'NOVO' : item.usado ? 'USADO' : '-';
        // Usar texto ASCII puro — helvetica nao suporta Unicode checkmark/warning
        const status = res.status === 'ok' ? 'OK' : res.status === 'divergencia' ? 'DIV.' : '-';
        const notas  = [res.autoObs, res.obs].filter(Boolean).join(' | ') || '';
        return [item.quantidade, item.item_nome || '-', item.modelo || '-', estado, item.obs || '-', status, notas];
      }),
      styles:             { fontSize: 8, cellPadding: 2.2, textColor: [30, 30, 30] },
      headStyles:         { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 250, 246] },
      tableLineColor:     [200, 220, 200],
      tableLineWidth:     0.1,
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        3: { halign: 'center', cellWidth: 16 },
        5: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
        6: { cellWidth: 50 }
      },
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

  // ── Totalizador Geral de Equipamentos ────────────────────────────────────────
  const totalizador = calcularTotalizador();

  if (totalizador.length > 0) {
    if (y > 220) { doc.addPage(); y = 18; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 105, 55);
    doc.text('TOTALIZADOR GERAL DE EQUIPAMENTOS', 14, y);
    y += 2;
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 105, 55);
    doc.line(14, y, 196, y);
    y += 5;

    const regular   = totalizador.filter(r => !isItemEspecial(r.nome));
    const especiais = totalizador.filter(r =>  isItemEspecial(r.nome));

    // Cabeçalho reutilizável
    const headTot = [
      [
        { content: 'Equipamento',         rowSpan: 2, styles: { valign: 'middle' } },
        { content: 'Entrega ao Cliente',  colSpan: 3, styles: { halign: 'center', fillColor: [0, 130, 60] } },
        { content: 'Retirada do Cliente', colSpan: 2, styles: { halign: 'center', fillColor: [160, 30, 30] } }
      ],
      [
        { content: 'Total', styles: { halign: 'center', fillColor: [0, 130, 60] } },
        { content: 'Novo',  styles: { halign: 'center', fillColor: [0, 130, 60] } },
        { content: 'Usado', styles: { halign: 'center', fillColor: [0, 130, 60] } },
        { content: 'Total', styles: { halign: 'center', fillColor: [160, 30, 30] } },
        { content: 'Usado', styles: { halign: 'center', fillColor: [160, 30, 30] } }
      ]
    ];

    const colStyles = {
      0: { cellWidth: 80 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 20 }
    };

    const buildBody = lista => [
      ...lista.map(row => [
        row.nome,
        row.entrega      > 0 ? row.entrega      : '-',
        row.entregaNovo  > 0 ? row.entregaNovo  : '-',
        row.entregaUsado > 0 ? row.entregaUsado : '-',
        row.retirada      > 0 ? row.retirada      : '-',
        row.retiradaUsado > 0 ? row.retiradaUsado : '-'
      ]),
      [
        { content: 'SUBTOTAL', styles: { fontStyle: 'bold' } },
        { content: lista.reduce((s,r)=>s+r.entrega,0)      || '-', styles: { fontStyle: 'bold', halign: 'center' } },
        { content: lista.reduce((s,r)=>s+r.entregaNovo,0)  || '-', styles: { fontStyle: 'bold', halign: 'center' } },
        { content: lista.reduce((s,r)=>s+r.entregaUsado,0) || '-', styles: { fontStyle: 'bold', halign: 'center' } },
        { content: lista.reduce((s,r)=>s+r.retirada,0)      || '-', styles: { fontStyle: 'bold', halign: 'center' } },
        { content: lista.reduce((s,r)=>s+r.retiradaUsado,0) || '-', styles: { fontStyle: 'bold', halign: 'center' } }
      ]
    ];

    const didParseCell = lista => data => {
      if (data.section !== 'body') return;
      const isSub = data.row.index === lista.length;
      if (isSub) {
        data.cell.styles.fillColor = [230, 245, 235];
        data.cell.styles.lineWidth = 0.3;
        data.cell.styles.lineColor = [0, 105, 55];
      }
      if (!isSub) {
        if ([1,2,3].includes(data.column.index) && data.cell.raw !== '-')
          data.cell.styles.textColor = [0, 130, 60];
        if ([4,5].includes(data.column.index) && data.cell.raw !== '-')
          data.cell.styles.textColor = [190, 30, 30];
      }
    };

    const autoTabTot = (lista) => {
      doc.autoTable({
        startY: y, head: headTot, body: buildBody(lista),
        styles: { fontSize: 8, cellPadding: 2, textColor: [30, 30, 30] },
        headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 250, 246] },
        tableLineColor: [200, 220, 200], tableLineWidth: 0.1,
        columnStyles: colStyles, didParseCell: didParseCell(lista),
        margin: { left: 14, right: 14 }
      });
      y = doc.lastAutoTable.finalY + 6;
    };

    if (regular.length) autoTabTot(regular);

    if (especiais.length) {
      if (y > 240) { doc.addPage(); y = 18; }
      // Separador Esteiras & Formas
      doc.setFillColor(240, 240, 240);
      doc.rect(14, y, 182, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('Esteiras & Formas', 17, y + 4.2);
      y += 8;
      autoTabTot(especiais);
    }
  }

  // ── Rodapé na última página ──────────────────────────────────────────────────
  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Página ${p} de ${totalPags}`, 195, 290, { align: 'right' });
    doc.text('Marquespan — Conferência de Carregamento', 15, 290);
  }

  const nomeArq = `Conferencia_Carregamento_${conferenciaAtiva.placa || 'carg'}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nomeArq);
}

function toggleModoApp() {
  conferenciaEmModoApp = !conferenciaEmModoApp;
  const section = document.getElementById('carregar-veiculo');
  const btn     = document.getElementById('btnModoApp');

  if (conferenciaEmModoApp) {
    // Move a seção direto para <body> para escapar de qualquer filter/transform
    // que crie stacking context e quebre o position:fixed (ex: .main-content.expanded com filter:blur)
    section._cvOriginalParent      = section.parentNode;
    section._cvOriginalNextSibling = section.nextSibling;
    document.body.appendChild(section);
    section.classList.add('modo-app-ativo');
    document.body.classList.add('cv-modo-app-body');
  } else {
    section.classList.remove('modo-app-ativo');
    document.body.classList.remove('cv-modo-app-body');
    // Devolve a seção para a posição original
    if (section._cvOriginalParent) {
      if (section._cvOriginalNextSibling) {
        section._cvOriginalParent.insertBefore(section, section._cvOriginalNextSibling);
      } else {
        section._cvOriginalParent.appendChild(section);
      }
      section._cvOriginalParent = null;
      section._cvOriginalNextSibling = null;
    }
  }

  if (btn) {
    btn.innerHTML = conferenciaEmModoApp
      ? '<i class="fas fa-times"></i> Sair do Modo APP'
      : '<i class="fas fa-mobile-alt"></i> Modo APP';
    btn.className = `btn-glass ${conferenciaEmModoApp ? 'btn-red' : 'btn-blue'}`;
  }
}

export async function inicializarCarregarVeiculo() {
  if (!document.getElementById('cvConferencia')) return;

  document.getElementById('btnModoApp')?.addEventListener('click', toggleModoApp);
  document.getElementById('btnCvAnterior')?.addEventListener('click', () => navegarConferencia(-1));
  document.getElementById('btnCvProxima')?.addEventListener('click',  () => navegarConferencia(1));
  document.getElementById('btnIniciarConferenciaHistorico')?.addEventListener('click', carregarConferenciaDoHistorico);
  document.getElementById('btnCvGerarRelatorio')?.addEventListener('click', gerarRelatorioConferencia);
  document.getElementById('btnCvReiniciar')?.addEventListener('click', () => {
    conferenciaAtiva      = null;
    conferenciaResultados = {};
    conferenciaIndex      = 0;
    document.getElementById('cvRequisicaoCard')?.classList.remove('hidden');
    document.getElementById('cvResumo')?.classList.add('hidden');
    abrirConferenciaTab();
  });

  // Ativa a conferência ao entrar na aba
  document.querySelectorAll('[data-tab-target="carregar-veiculo"]').forEach(btn =>
    btn.addEventListener('click', () => setTimeout(abrirConferenciaTab, 50))
  );
}
