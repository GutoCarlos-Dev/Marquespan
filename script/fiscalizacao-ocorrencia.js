import { supabaseClient } from './supabase.js';

let ocorrencias = [];
let ocorrenciaEditandoId = null;
let sortState = { field: 'created_at', ascending: false };
const niveisComExclusao = ['administrador', 'gerencia'];
const bucketAnexos = 'fiscalizacao_ocorrencias_anexos';
const niveisSomenteLeitura = [];
let anexosNovos = [];
let anexosExistentes = [];
let anexosParaRemover = [];
let visualizandoOcorrencia = false;
let veiculosPorPlaca = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  document.getElementById('filtroDataDe').valueAsDate = primeiroDia;
  document.getElementById('filtroDataAte').valueAsDate = hoje;
  document.getElementById('ocorrenciaData').valueAsDate = hoje;

  bindEvents();
  aplicarRestricoesNivelOcorrencia();
  await carregarListas();
  await buscarOcorrencias();
});

function bindEvents() {
  document.getElementById('btnIncluirOcorrencia').addEventListener('click', abrirModal);
  document.getElementById('btnBuscarOcorrencias').addEventListener('click', buscarOcorrencias);
  document.getElementById('btnExportarXLS').addEventListener('click', exportarExcel);
  document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
  document.getElementById('filtroLocal').addEventListener('input', renderizarTabela);
  document.getElementById('filtroFilial').addEventListener('change', buscarOcorrencias);
  document.getElementById('ocorrenciaPlaca').addEventListener('change', preencherFilialPorPlaca);
  document.getElementById('formOcorrencia').addEventListener('submit', salvarOcorrencia);
  document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
  document.getElementById('btnCancelarOcorrencia').addEventListener('click', fecharModal);
  document.getElementById('btnCompartilharOcorrenciaWhatsapp').addEventListener('click', () => compartilharOcorrenciaWhatsapp());
  document.getElementById('ocorrenciaAnexos').addEventListener('change', handleAnexosChange);
  document.getElementById('listaAnexosOcorrencia').addEventListener('click', handleAnexoClick);
  ['envolveVeiculoEmpresa', 'envolveVeiculoTerceiro', 'envolveOutroPatrimonio'].forEach(id => {
    document.getElementById(id).addEventListener('change', atualizarGruposEnvolvimento);
  });
  document.getElementById('modalOcorrencia').addEventListener('click', (event) => {
    if (event.target.id === 'modalOcorrencia') fecharModal();
  });
  document.getElementById('tbodyOcorrencias').addEventListener('click', handleTabelaClick);

  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      sortState.ascending = sortState.field === field ? !sortState.ascending : true;
      sortState.field = field;
      renderizarTabela();
    });
  });
}

async function carregarListas() {
  try {
    const filialUsuario = getFilialUsuario();
    const filtrarPorFilial = usuarioRestritoPorFilial();
    let veiculosQuery = supabaseClient.from('veiculos').select('placa, filial').eq('situacao', 'ativo').order('placa');
    let rotasQuery = supabaseClient.from('rotas').select('numero, filial').order('numero', { ascending: true });
    let filiaisQuery = supabaseClient.from('filiais').select('nome, sigla').order('nome');

    if (filtrarPorFilial) {
      veiculosQuery = veiculosQuery.eq('filial', filialUsuario);
      rotasQuery = rotasQuery.eq('filial', filialUsuario);
      filiaisQuery = filiaisQuery.or(`sigla.eq.${filialUsuario},nome.eq.${filialUsuario}`);
    }

    const [veiculosRes, motoristasRes, auxiliaresRes, rotasRes, filiaisRes] = await Promise.all([
      veiculosQuery,
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Motorista%').order('nome'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Auxiliar%').order('nome'),
      rotasQuery,
      filiaisQuery
    ]);

    veiculosPorPlaca = new Map((veiculosRes.data || []).map(v => [normalizarBusca(v.placa), v]));
    preencherDatalist('listaPlacas', veiculosRes.data?.map(v => v.placa));
    preencherDatalist('listaMotoristas', motoristasRes.data?.map(nomeFuncionario));
    preencherDatalist('listaAuxiliares', auxiliaresRes.data?.map(nomeFuncionario));
    preencherDatalist('listaRotas', rotasRes.data?.map(r => r.numero));
    preencherSelectFiliais('filtroFilial', filiaisRes.data, 'Todas');
    preencherSelectFiliais('ocorrenciaFilial', filiaisRes.data, 'Selecione a filial');
    configurarCamposFilialUsuario();
  } catch (error) {
    console.error('Erro ao carregar listas:', error);
  }
}

function preencherSelectFiliais(id, filiais = [], textoInicial = 'Todas') {
  const select = document.getElementById(id);
  if (!select) return;
  const valorAtual = select.value;
  select.innerHTML = `<option value="">${textoInicial}</option>`;
  (filiais || []).forEach(filial => {
    const valor = filial.sigla || filial.nome;
    if (valor) select.appendChild(new Option(valor, valor));
  });
  select.value = valorAtual;
}

function configurarCamposFilialUsuario() {
  if (!usuarioRestritoPorFilial()) return;
  const filialUsuario = getFilialUsuario();

  ['filtroFilial', 'ocorrenciaFilial'].forEach(id => {
    definirValorSelect(id, filialUsuario);
    const select = document.getElementById(id);
    if (select) {
      select.disabled = true;
      select.title = 'Filial definida pelo usuario logado.';
    }
  });
}

function preencherDatalist(id, valores = []) {
  const datalist = document.getElementById(id);
  datalist.innerHTML = '';
  [...new Set(valores.filter(Boolean))].forEach(valor => {
    const option = document.createElement('option');
    option.value = valor;
    datalist.appendChild(option);
  });
}

function nomeFuncionario(funcionario) {
  return funcionario?.nome_completo || funcionario?.nome || '';
}

function getUsuarioAtual() {
  return JSON.parse(localStorage.getItem('usuarioLogado')) || {};
}

function normalizarFilial(value) {
  return String(value || '').trim().toUpperCase();
}

function getFilialUsuario() {
  return normalizarFilial(getUsuarioAtual().filial);
}

function usuarioRestritoPorFilial() {
  return Boolean(getFilialUsuario());
}

function normalizarBusca(value) {
  return String(value || '').trim().toUpperCase();
}

function preencherFilialPorPlaca() {
  const placa = normalizarBusca(document.getElementById('ocorrenciaPlaca').value);
  const veiculo = veiculosPorPlaca.get(placa);
  const filialUsuario = getFilialUsuario();
  if (usuarioRestritoPorFilial()) {
    if (veiculo?.filial && normalizarFilial(veiculo.filial) !== filialUsuario) {
      alert('Esta placa pertence a outra filial e nao pode ser lancada por este usuario.');
      document.getElementById('ocorrenciaPlaca').value = '';
    }
    definirValorSelect('ocorrenciaFilial', filialUsuario);
    return;
  }
  if (veiculo?.filial) definirValorSelect('ocorrenciaFilial', veiculo.filial);
}

function definirValorSelect(id, valor) {
  const select = document.getElementById(id);
  if (!select) return;
  const valorNormalizado = String(valor || '').trim();
  if (!valorNormalizado) {
    select.value = '';
    return;
  }
  const existe = Array.from(select.options).some(option => option.value === valorNormalizado);
  if (!existe) select.appendChild(new Option(valorNormalizado, valorNormalizado));
  select.value = valorNormalizado;
}

function getNivelUsuario() {
  const usuario = getUsuarioAtual();
  return String(usuario.nivel || '').toLowerCase();
}

function usuarioSomenteLeitura() {
  return niveisSomenteLeitura.includes(getNivelUsuario());
}

function aplicarRestricoesNivelOcorrencia() {
  if (!usuarioSomenteLeitura()) return;
  ['btnIncluirOcorrencia'].forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    element.disabled = true;
    element.classList.add('hidden');
    element.title = 'Seu nivel permite apenas visualizar ocorrencias.';
  });
}

function atualizarTituloModalOcorrencia() {
  const titulo = document.querySelector('#modalOcorrencia .modal-header h3');
  if (!titulo) return;

  if (visualizandoOcorrencia) {
    titulo.textContent = 'Visualizar Ocorr\u00eancia';
    return;
  }

  titulo.textContent = ocorrenciaEditandoId ? 'Editar Ocorr\u00eancia' : 'Incluir Ocorr\u00eancia';
}

async function abrirModal(item = null, modo = 'editar') {
  if (item && usuarioRestritoPorFilial() && normalizarFilial(item.filial) !== getFilialUsuario()) {
    alert('Esta ocorrencia pertence a outra filial e nao pode ser acessada por este usuario.');
    return;
  }

  document.getElementById('formOcorrencia').reset();
  anexosNovos = [];
  anexosExistentes = [];
  anexosParaRemover = [];
  visualizandoOcorrencia = modo === 'visualizar' || usuarioSomenteLeitura();
  document.getElementById('ocorrenciaAnexos').value = '';
  ocorrenciaEditandoId = item?.id || null;
  document.getElementById('btnSalvarOcorrencia').textContent = ocorrenciaEditandoId ? 'Salvar Alterações' : 'Salvar';
  atualizarTituloModalOcorrencia();
  atualizarBotaoCompartilharModal();
  document.getElementById('ocorrenciaData').value = item?.data_ocorrencia || new Date().toISOString().split('T')[0];
  document.getElementById('ocorrenciaHorario').value = item?.hora_ocorrencia || '';
  definirValorSelect('ocorrenciaFilial', item?.filial || '');
  document.getElementById('ocorrenciaRota').value = item?.rota || '';
  document.getElementById('ocorrenciaPlaca').value = item?.placa || '';
  document.getElementById('ocorrenciaMotorista').value = item?.motorista || '';
  document.getElementById('ocorrenciaAuxiliar').value = item?.auxiliar || '';
  document.getElementById('ocorrenciaLocal').value = item?.local_ocorrencia || '';
  document.getElementById('ocorrenciaRelatorio').value = item?.relatorio || '';
  if (usuarioRestritoPorFilial()) definirValorSelect('ocorrenciaFilial', getFilialUsuario());
  preencherEnvolvimento(item?.envolvimento);
  atualizarGruposEnvolvimento();
  renderizarAnexos();
  atualizarModoVisualizacao();
  document.getElementById('modalOcorrencia').classList.remove('hidden');
  if (ocorrenciaEditandoId) {
    await carregarAnexosExistentes(ocorrenciaEditandoId);
    atualizarModoVisualizacao();
  }
}

function fecharModal() {
  ocorrenciaEditandoId = null;
  visualizandoOcorrencia = false;
  document.getElementById('modalOcorrencia').classList.add('hidden');
}

function atualizarBotaoCompartilharModal() {
  const btn = document.getElementById('btnCompartilharOcorrenciaWhatsapp');
  const podeCompartilhar = Boolean(ocorrenciaEditandoId) && !usuarioSomenteLeitura();
  btn.classList.toggle('hidden', !podeCompartilhar);
  btn.disabled = !podeCompartilhar;
}

function atualizarModoVisualizacao() {
  const modal = document.getElementById('modalOcorrencia');
  modal.querySelectorAll('input, textarea, select').forEach(campo => {
    campo.disabled = visualizandoOcorrencia;
  });
  document.getElementById('btnSalvarOcorrencia').classList.toggle('hidden', visualizandoOcorrencia);
  document.getElementById('btnCancelarOcorrencia').textContent = visualizandoOcorrencia ? 'Fechar' : 'Cancelar';
  atualizarBotaoCompartilharModal();
}

async function handleTabelaClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const item = ocorrencias.find(ocorrencia => ocorrencia.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'editar') {
    if (usuarioSomenteLeitura()) {
      await abrirModal(item, 'visualizar');
      return;
    }
    await abrirModal(item, 'editar');
    return;
  }

  if (button.dataset.action === 'visualizar') {
    await abrirModal(item, 'visualizar');
    return;
  }

  if (button.dataset.action === 'excluir') {
    if (!usuarioPodeExcluir()) {
      alert('Seu nivel de acesso permite apenas editar ocorrencias.');
      return;
    }
    await excluirOcorrencia(item);
    return;
  }

  if (button.dataset.action === 'whatsapp') {
    if (usuarioSomenteLeitura()) return;
    compartilharOcorrenciaWhatsapp(item);
  }
}

async function salvarOcorrencia(event) {
  event.preventDefault();
  if (visualizandoOcorrencia || usuarioSomenteLeitura()) return;
  const btn = document.getElementById('btnSalvarOcorrencia');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const usuario = getUsuarioAtual();
    const filialUsuario = getFilialUsuario();
    const estavaEditando = Boolean(ocorrenciaEditandoId);
    const payload = {
      data_ocorrencia: document.getElementById('ocorrenciaData').value,
      hora_ocorrencia: document.getElementById('ocorrenciaHorario').value || null,
      filial: document.getElementById('ocorrenciaFilial').value || null,
      rota: document.getElementById('ocorrenciaRota').value.trim(),
      placa: document.getElementById('ocorrenciaPlaca').value.trim().toUpperCase(),
      motorista: document.getElementById('ocorrenciaMotorista').value.trim(),
      auxiliar: document.getElementById('ocorrenciaAuxiliar').value.trim() || null,
      local_ocorrencia: document.getElementById('ocorrenciaLocal').value.trim() || null,
      envolvimento: coletarEnvolvimento(),
      relatorio: document.getElementById('ocorrenciaRelatorio').value.trim()
    };

    if (usuarioRestritoPorFilial()) {
      payload.filial = filialUsuario;
    }

    if (!payload.filial) {
      throw new Error('Filial obrigatoria para lancar ocorrencia.');
    }

    if (!estavaEditando) {
      payload.usuario_id = usuario.id || null;
      payload.usuario_nome = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
      payload.usuario_inclusao_id = payload.usuario_id;
      payload.usuario_inclusao_nome = payload.usuario_nome;
    } else {
      payload.usuario_edicao_id = usuario.id || null;
      payload.usuario_edicao_nome = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
    }

    let idOcorrencia = ocorrenciaEditandoId;

    if (estavaEditando) {
      let query = supabaseClient.from('fiscalizacao_ocorrencias').update(payload).eq('id', ocorrenciaEditandoId);
      if (usuarioRestritoPorFilial()) query = query.eq('filial', filialUsuario);
      const { error } = await query;
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient.from('fiscalizacao_ocorrencias').insert([payload]).select('id').single();
      if (error) throw error;
      idOcorrencia = data.id;
    }

    await salvarAnexos(idOcorrencia);

    ocorrenciaEditandoId = idOcorrencia;
    visualizandoOcorrencia = false;
    atualizarTituloModalOcorrencia();
    document.getElementById('btnSalvarOcorrencia').textContent = 'Salvar Alteracoes';
    atualizarBotaoCompartilharModal();
    await carregarAnexosExistentes(idOcorrencia);
    await buscarOcorrencias();
    alert(estavaEditando ? 'Ocorrencia atualizada com sucesso! Botao de compartilhamento habilitado.' : 'Ocorrencia registrada com sucesso! Botao de compartilhamento habilitado.');
  } catch (error) {
    console.error('Erro ao salvar ocorrencia:', error);
    alert(`Erro ao salvar ocorrencia: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = ocorrenciaEditandoId ? 'Salvar Alteracoes' : 'Salvar';
  }
}

async function excluirOcorrencia(item) {
  if (usuarioSomenteLeitura()) {
    alert('Seu nivel de acesso permite apenas visualizar ocorrencias.');
    return;
  }
  const confirmar = confirm(`Deseja excluir a ocorrencia da placa ${item.placa || '-'} em ${formatarData(item.data_ocorrencia)}?`);
  if (!confirmar) return;

  try {
    let query = supabaseClient
      .from('fiscalizacao_ocorrencias')
      .delete()
      .eq('id', item.id);
    if (usuarioRestritoPorFilial()) query = query.eq('filial', getFilialUsuario());

    const { error } = await query;

    if (error) throw error;

    await buscarOcorrencias();
    alert('Ocorrencia excluida com sucesso!');
  } catch (error) {
    console.error('Erro ao excluir ocorrencia:', error);
    alert(`Erro ao excluir ocorrencia: ${error.message}`);
  }
}

async function buscarOcorrencias() {
  const btn = document.getElementById('btnBuscarOcorrencias');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

  try {
    const dataDe = document.getElementById('filtroDataDe').value;
    const dataAte = document.getElementById('filtroDataAte').value;
    const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
    const motorista = document.getElementById('filtroMotorista').value.trim();
    const rota = document.getElementById('filtroRota').value.trim();
    const filial = usuarioRestritoPorFilial() ? getFilialUsuario() : document.getElementById('filtroFilial').value;

    let query = supabaseClient.from('fiscalizacao_ocorrencias').select('*');
    if (dataDe) query = query.gte('data_ocorrencia', dataDe);
    if (dataAte) query = query.lte('data_ocorrencia', dataAte);
    if (placa) query = query.ilike('placa', `%${placa}%`);
    if (motorista) query = query.ilike('motorista', `%${motorista}%`);
    if (rota) query = query.ilike('rota', `%${rota}%`);
    if (filial) query = query.eq('filial', filial);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    ocorrencias = data || [];
    renderizarTabela();
  } catch (error) {
    console.error('Erro ao buscar ocorrencias:', error);
    alert(`Erro ao buscar ocorrencias: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-search"></i> Buscar';
  }
}

function getDadosGrid() {
  const termo = document.getElementById('filtroLocal').value.trim().toUpperCase();
  let dados = [...ocorrencias];

  if (termo) {
    dados = dados.filter(item => [
      item.data_ocorrencia,
      item.created_at,
      item.updated_at,
      item.usuario_nome,
      item.usuario_inclusao_nome,
      item.usuario_edicao_nome,
      item.rota,
      item.filial,
      item.placa,
      item.motorista,
      item.auxiliar,
      item.local_ocorrencia,
      resumoEnvolvimento(item.envolvimento),
      item.relatorio
    ].some(valor => String(valor || '').toUpperCase().includes(termo)));
  }

  dados.sort((a, b) => {
    let valA = a[sortState.field] ?? '';
    let valB = b[sortState.field] ?? '';
    if (typeof valA === 'string') valA = valA.toUpperCase();
    if (typeof valB === 'string') valB = valB.toUpperCase();
    if (valA < valB) return sortState.ascending ? -1 : 1;
    if (valA > valB) return sortState.ascending ? 1 : -1;
    return 0;
  });

  return dados;
}

function renderizarTabela() {
  const tbody = document.getElementById('tbodyOcorrencias');
  const dados = getDadosGrid();
  const somenteLeitura = usuarioSomenteLeitura();
  document.getElementById('totalRegistros').textContent = dados.length;

  if (dados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;">Nenhum registro encontrado.</td></tr>';
    atualizarIconesOrdenacao();
    return;
  }

  tbody.innerHTML = dados.map(item => `
    <tr>
      <td>${formatarDataHora(item.created_at)}</td>
      <td>${escapeHtml(item.usuario_inclusao_nome || item.usuario_nome || '-')}</td>
      <td>${escapeHtml(formatarUltimaEdicao(item))}</td>
      <td>${escapeHtml(item.rota || '-')}</td>
      <td>${escapeHtml(item.filial || '-')}</td>
      <td><strong>${escapeHtml(item.placa || '-')}</strong></td>
      <td>${escapeHtml(item.motorista || '-')}</td>
      <td>${escapeHtml(item.auxiliar || '-')}</td>
      <td class="ocorrencia-texto">${escapeHtml(item.relatorio || '-')}</td>
      <td class="acoes-cell">
        ${somenteLeitura ? '' : `
          <button type="button" class="btn-grid-action btn-edit" data-action="editar" data-id="${escapeHtml(item.id)}" title="Editar">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="btn-grid-action btn-share" data-action="whatsapp" data-id="${escapeHtml(item.id)}" title="Compartilhar via WhatsApp">
            <i class="fab fa-whatsapp"></i>
          </button>
        `}
        <button type="button" class="btn-grid-action btn-view" data-action="visualizar" data-id="${escapeHtml(item.id)}" title="Visualizar">
          <i class="fas fa-eye"></i>
        </button>
        ${!somenteLeitura && usuarioPodeExcluir() ? `
          <button type="button" class="btn-grid-action btn-delete" data-action="excluir" data-id="${escapeHtml(item.id)}" title="Excluir">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  atualizarIconesOrdenacao();
}

function atualizarIconesOrdenacao() {
  document.querySelectorAll('.sortable i').forEach(i => i.className = 'fas fa-sort');
  const ativo = document.querySelector(`.sortable[data-sort="${sortState.field}"] i`);
  if (ativo) ativo.className = sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
}

function formatarData(data) {
  if (!data) return '-';
  return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
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
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatarUltimaEdicao(item) {
  if (!item?.usuario_edicao_nome) return '-';
  return `${item.usuario_edicao_nome} - ${formatarDataHora(item.updated_at)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function usuarioPodeExcluir() {
  return niveisComExclusao.includes(getNivelUsuario());
}

function dadosParaExportacao() {
  return getDadosGrid().map(item => ({
    'Data Inclusao': formatarDataHora(item.created_at),
    'Data Ocorrencia': formatarData(item.data_ocorrencia),
    'Usuario que Incluiu': item.usuario_inclusao_nome || item.usuario_nome || '',
    'Ultima Edicao': formatarUltimaEdicao(item),
    Rota: item.rota || '',
    Filial: item.filial || '',
    Placa: item.placa || '',
    Motorista: item.motorista || '',
    Auxiliar: item.auxiliar || '',
    Horario: item.hora_ocorrencia || '',
    'Local da Ocorrencia': item.local_ocorrencia || '',
    Envolvimento: resumoEnvolvimento(item.envolvimento),
    Ocorrencia: item.relatorio || ''
  }));
}

function coletarEnvolvimento() {
  return {
    veiculo_empresa: {
      ativo: document.getElementById('envolveVeiculoEmpresa').checked,
      placa: document.getElementById('empresaPlaca').value.trim().toUpperCase() || null,
      modelo: document.getElementById('empresaModelo').value.trim() || null,
      motorista_responsavel: document.getElementById('empresaMotoristaResponsavel').value.trim() || null,
      danos_causados: document.getElementById('empresaDanos').value.trim() || null
    },
    veiculo_terceiro: {
      ativo: document.getElementById('envolveVeiculoTerceiro').checked,
      placa: document.getElementById('terceiroPlaca').value.trim().toUpperCase() || null,
      modelo: document.getElementById('terceiroModelo').value.trim() || null,
      cor: document.getElementById('terceiroCor').value.trim() || null,
      condutor: document.getElementById('terceiroCondutor').value.trim() || null,
      contato: document.getElementById('terceiroContato').value.trim() || null,
      danos_causados: document.getElementById('terceiroDanos').value.trim() || null
    },
    outro_patrimonio: {
      ativo: document.getElementById('envolveOutroPatrimonio').checked,
      tipo_patrimonio: document.getElementById('patrimonioTipo').value.trim() || null,
      responsavel: document.getElementById('patrimonioResponsavel').value.trim() || null,
      contato: document.getElementById('patrimonioContato').value.trim() || null,
      dano_causado: document.getElementById('patrimonioDano').value.trim() || null
    }
  };
}

function preencherEnvolvimento(envolvimento) {
  const dados = normalizarObjeto(envolvimento);
  const empresa = dados.veiculo_empresa || {};
  const terceiro = dados.veiculo_terceiro || {};
  const patrimonio = dados.outro_patrimonio || {};

  document.getElementById('envolveVeiculoEmpresa').checked = Boolean(empresa.ativo);
  document.getElementById('empresaPlaca').value = empresa.placa || '';
  document.getElementById('empresaModelo').value = empresa.modelo || '';
  document.getElementById('empresaMotoristaResponsavel').value = empresa.motorista_responsavel || '';
  document.getElementById('empresaDanos').value = empresa.danos_causados || '';

  document.getElementById('envolveVeiculoTerceiro').checked = Boolean(terceiro.ativo);
  document.getElementById('terceiroPlaca').value = terceiro.placa || '';
  document.getElementById('terceiroModelo').value = terceiro.modelo || '';
  document.getElementById('terceiroCor').value = terceiro.cor || '';
  document.getElementById('terceiroCondutor').value = terceiro.condutor || '';
  document.getElementById('terceiroContato').value = terceiro.contato || '';
  document.getElementById('terceiroDanos').value = terceiro.danos_causados || '';

  document.getElementById('envolveOutroPatrimonio').checked = Boolean(patrimonio.ativo);
  document.getElementById('patrimonioTipo').value = patrimonio.tipo_patrimonio || '';
  document.getElementById('patrimonioResponsavel').value = patrimonio.responsavel || '';
  document.getElementById('patrimonioContato').value = patrimonio.contato || '';
  document.getElementById('patrimonioDano').value = patrimonio.dano_causado || '';
}

function atualizarGruposEnvolvimento() {
  document.getElementById('grupoVeiculoEmpresa').classList.toggle('hidden', !document.getElementById('envolveVeiculoEmpresa').checked);
  document.getElementById('grupoVeiculoTerceiro').classList.toggle('hidden', !document.getElementById('envolveVeiculoTerceiro').checked);
  document.getElementById('grupoOutroPatrimonio').classList.toggle('hidden', !document.getElementById('envolveOutroPatrimonio').checked);
}

function normalizarObjeto(valor) {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor;
  if (!valor) return {};
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resumoEnvolvimento(envolvimento) {
  const dados = normalizarObjeto(envolvimento);
  const partes = [];
  if (dados.veiculo_empresa?.ativo) partes.push('Outro veiculo da empresa');
  if (dados.veiculo_terceiro?.ativo) partes.push('Veiculo de terceiros');
  if (dados.outro_patrimonio?.ativo) partes.push('Outro patrimonio');
  return partes.join('; ');
}

function obterOcorrenciaDoFormulario() {
  return {
    id: ocorrenciaEditandoId,
    data_ocorrencia: document.getElementById('ocorrenciaData').value,
    hora_ocorrencia: document.getElementById('ocorrenciaHorario').value || null,
    filial: document.getElementById('ocorrenciaFilial').value || null,
    rota: document.getElementById('ocorrenciaRota').value.trim(),
    placa: document.getElementById('ocorrenciaPlaca').value.trim().toUpperCase(),
    motorista: document.getElementById('ocorrenciaMotorista').value.trim(),
    auxiliar: document.getElementById('ocorrenciaAuxiliar').value.trim() || null,
    local_ocorrencia: document.getElementById('ocorrenciaLocal').value.trim() || null,
    envolvimento: coletarEnvolvimento(),
    relatorio: document.getElementById('ocorrenciaRelatorio').value.trim()
  };
}

function compartilharOcorrenciaWhatsapp(ocorrencia = null) {
  if (usuarioSomenteLeitura()) return;
  const dados = ocorrencia || obterOcorrenciaDoFormulario();
  if (!dados?.id && !ocorrenciaEditandoId) {
    alert('Salve a ocorrencia antes de compartilhar.');
    return;
  }

  const linhas = [
    '*Fiscalizacao - Ocorrencia*',
    `Data: ${formatarData(dados.data_ocorrencia)}`,
    `Horario: ${dados.hora_ocorrencia || '-'}`,
    `Filial: ${dados.filial || '-'}`,
    `Rota: ${dados.rota || '-'}`,
    `Placa: ${dados.placa || '-'}`,
    `Motorista(s): ${dados.motorista || '-'}`,
    `Auxiliar: ${dados.auxiliar || '-'}`,
    `Local: ${dados.local_ocorrencia || '-'}`,
    `Envolvimento: ${resumoEnvolvimento(dados.envolvimento) || '-'}`,
    '',
    '*Relatorio Ocorrido:*',
    dados.relatorio || '-'
  ];

  const quantidadeAnexos = ocorrencia ? null : anexosExistentes.length;
  if (quantidadeAnexos) linhas.push('', `Anexos registrados: ${quantidadeAnexos}`);

  window.open(`https://wa.me/?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank');
}

function handleAnexosChange(event) {
  if (usuarioSomenteLeitura()) {
    event.target.value = '';
    return;
  }
  anexosNovos.push(...Array.from(event.target.files || []));
  event.target.value = '';
  renderizarAnexos();
}

async function handleAnexoClick(event) {
  const button = event.target.closest('[data-anexo-action]');
  if (!button) return;

  const index = Number(button.dataset.index);
  const action = button.dataset.anexoAction;
  const tipo = button.dataset.tipo;

  if (action === 'remover' && tipo === 'novo') {
    if (visualizandoOcorrencia || usuarioSomenteLeitura()) return;
    anexosNovos.splice(index, 1);
    renderizarAnexos();
    return;
  }

  if (action === 'remover' && tipo === 'existente') {
    if (visualizandoOcorrencia || usuarioSomenteLeitura()) return;
    const anexo = anexosExistentes.splice(index, 1)[0];
    if (anexo?.caminho_arquivo) anexosParaRemover.push(anexo);
    renderizarAnexos();
    return;
  }

  if (action === 'baixar' && tipo === 'existente') {
    await baixarAnexo(anexosExistentes[index]);
  }
}

function renderizarAnexos() {
  const container = document.getElementById('listaAnexosOcorrencia');
  const itens = [
    ...anexosExistentes.map((anexo, index) => ({ anexo, index, tipo: 'existente' })),
    ...anexosNovos.map((anexo, index) => ({ anexo, index, tipo: 'novo' }))
  ];

  if (!itens.length) {
    container.innerHTML = '<div class="anexo-ocorrencia-item"><span class="anexo-ocorrencia-nome">Nenhum anexo selecionado.</span></div>';
    return;
  }

  container.innerHTML = itens.map(({ anexo, index, tipo }) => {
    const nome = tipo === 'novo' ? anexo.name : anexo.nome_arquivo;
    return `
      <div class="anexo-ocorrencia-item">
        <div class="anexo-ocorrencia-nome">
          <i class="fas fa-file"></i>
          <span>${escapeHtml(nome || 'Arquivo')}</span>
          ${tipo === 'novo' ? '<strong>(Novo)</strong>' : ''}
        </div>
        <div class="anexo-ocorrencia-acoes">
          ${tipo === 'existente' ? `
            <button type="button" class="btn-anexo btn-anexo-download" data-anexo-action="baixar" data-tipo="${tipo}" data-index="${index}" title="Baixar">
              <i class="fas fa-download"></i>
            </button>
          ` : ''}
          ${visualizandoOcorrencia || usuarioSomenteLeitura() ? '' : `
            <button type="button" class="btn-anexo btn-anexo-remove" data-anexo-action="remover" data-tipo="${tipo}" data-index="${index}" title="Remover">
              <i class="fas fa-trash"></i>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function carregarAnexosExistentes(idOcorrencia) {
  try {
    const { data, error } = await supabaseClient
      .from('fiscalizacao_ocorrencias_anexos')
      .select('*')
      .eq('ocorrencia_id', idOcorrencia)
      .order('created_at', { ascending: true });

    if (error) throw error;
    anexosExistentes = data || [];
    renderizarAnexos();
  } catch (error) {
    console.error('Erro ao carregar anexos:', error);
    anexosExistentes = [];
    renderizarAnexos();
  }
}

async function salvarAnexos(idOcorrencia) {
  if (anexosParaRemover.length) {
    const caminhos = anexosParaRemover.map(anexo => anexo.caminho_arquivo).filter(Boolean);
    if (caminhos.length) {
      const { error: storageError } = await supabaseClient.storage.from(bucketAnexos).remove(caminhos);
      if (storageError) throw storageError;

      const { error: deleteError } = await supabaseClient.from('fiscalizacao_ocorrencias_anexos').delete().in('caminho_arquivo', caminhos);
      if (deleteError) throw deleteError;
    }
  }

  for (const file of anexosNovos) {
    const caminho = `${idOcorrencia}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
    const { data, error } = await supabaseClient.storage
      .from(bucketAnexos)
      .upload(caminho, file, { contentType: file.type || 'application/octet-stream' });

    if (error) throw error;

    const { error: insertError } = await supabaseClient
      .from('fiscalizacao_ocorrencias_anexos')
      .insert({
        ocorrencia_id: idOcorrencia,
        nome_arquivo: file.name,
        caminho_arquivo: data.path,
        tipo_arquivo: file.type || null,
        tamanho_bytes: file.size || null
      });

    if (insertError) throw insertError;
  }

  anexosNovos = [];
  anexosParaRemover = [];
}

async function baixarAnexo(anexo) {
  if (!anexo?.caminho_arquivo) return;
  const { data, error } = await supabaseClient.storage.from(bucketAnexos).createSignedUrl(anexo.caminho_arquivo, 60);
  if (error) return alert(`Erro ao gerar link do anexo: ${error.message}`);
  window.open(data.signedUrl, '_blank');
}

function sanitizarNomeArquivo(nome) {
  return String(nome || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function exportarExcel() {
  const rows = dadosParaExportacao();
  if (!rows.length) return alert('Nenhum registro para exportar.');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ocorrencias');
  XLSX.writeFile(wb, `fiscalizacao_ocorrencias_${Date.now()}.xlsx`);
}

async function getLogoBase64() {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = 'logo.png';
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = () => resolve(null);
  });
}

async function exportarPDF() {
  const rows = dadosParaExportacao();
  if (!rows.length) return alert('Nenhum registro para exportar.');
  if (!window.jspdf) return alert('Biblioteca jsPDF nao carregada.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  const logo = await getLogoBase64();

  if (logo) doc.addImage(logo, 'JPEG', 14, 10, 40, 12);

  doc.setFontSize(18);
  doc.setTextColor(0, 105, 55);
  doc.text('Fiscalizacao - Ocorrencias', 60, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 18, { align: 'right' });

  doc.autoTable({
    head: [['Data Inclusao', 'Data Ocorrencia', 'Ultima Edicao', 'Filial', 'Rota', 'Placa', 'Motorista', 'Ocorrencia']],
    body: rows.map(row => [
      row['Data Inclusao'],
      row['Data Ocorrencia'],
      row['Ultima Edicao'],
      row.Filial,
      row.Rota,
      row.Placa,
      row.Motorista,
      row.Ocorrencia
    ]),
    startY: 30,
    theme: 'grid',
    headStyles: { fillColor: [0, 105, 55], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [240, 240, 240] },
    columnStyles: {
      7: { cellWidth: 80 }
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Pagina ${i} de ${pageCount}`, 283, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
  }

  doc.save(`fiscalizacao_ocorrencias_${Date.now()}.pdf`);
}
