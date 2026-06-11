import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

let acompanhamentos = [];
let acompanhamentoEditandoId = null;
let acompanhamentoVisualizando = false;
let sortState = { field: 'data_acompanhamento', ascending: false };
const niveisComExclusao = ['administrador', 'gerencia'];
let rotasCadastradas = [];

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  document.getElementById('filtroDataDe').valueAsDate = primeiroDia;
  document.getElementById('filtroDataAte').valueAsDate = hoje;
  document.getElementById('acompanhamentoData').valueAsDate = hoje;

  bindEvents();
  await carregarListas();
  await buscarAcompanhamentos();
});

function bindEvents() {
  document.getElementById('btnIncluirAcompanhamento').addEventListener('click', abrirModal);
  document.getElementById('btnBuscarAcompanhamentos').addEventListener('click', buscarAcompanhamentos);
  document.getElementById('btnFormularioImpresso').addEventListener('click', gerarFormularioImpresso);
  document.getElementById('btnExportarXLS').addEventListener('click', exportarExcel);
  document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
  document.getElementById('filtroLocal').addEventListener('input', renderizarTabela);
  document.getElementById('formAcompanhamento').addEventListener('submit', salvarAcompanhamento);
  document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
  document.getElementById('btnCancelarAcompanhamento').addEventListener('click', fecharModal);
  document.getElementById('btnAdicionarCliente').addEventListener('click', () => adicionarCliente());
  document.getElementById('btnAdicionarSugestaoCliente').addEventListener('click', () => adicionarCliente({}, 'sugestaoClientesContainer'));
  document.getElementById('btnAdicionarDia').addEventListener('click', () => adicionarDia());
  document.getElementById('btnCompartilharSugestaoWhatsapp').addEventListener('click', compartilharSugestaoWhatsapp);
  document.getElementById('btnCompartilharRoteiroAtualWhatsapp').addEventListener('click', compartilharRoteiroAtualWhatsapp);
  document.getElementById('btnCompartilharAcompanhamentoWhatsapp').addEventListener('click', () => compartilharAcompanhamentoWhatsapp());
  document.getElementById('habilitarSugestaoRoteiro').addEventListener('change', atualizarSugestaoRoteiro);
  document.getElementById('acompanhamentoTipoRota').addEventListener('change', atualizarTipoRota);
  document.getElementById('acompanhamentoRota').addEventListener('change', preencherSupervisorDaRota);
  document.getElementById('acompanhamentoRota').addEventListener('blur', preencherSupervisorDaRota);
  document.getElementById('modalAcompanhamento').addEventListener('click', (event) => {
    if (event.target.id === 'modalAcompanhamento') fecharModal();
  });
  document.getElementById('clientesContainer').addEventListener('change', handleClienteChange);
  document.getElementById('clientesContainer').addEventListener('click', handleDynamicRemove);
  document.getElementById('sugestaoClientesContainer').addEventListener('change', handleClienteChange);
  document.getElementById('sugestaoClientesContainer').addEventListener('click', handleDynamicRemove);
  document.getElementById('horariosContainer').addEventListener('input', handleHorarioInput);
  document.getElementById('horariosContainer').addEventListener('click', handleDynamicRemove);
  document.getElementById('tbodyAcompanhamentos').addEventListener('click', handleTabelaClick);

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
    const [veiculosRes, motoristasRes, auxiliaresRes, rotasRes] = await Promise.all([
      supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Motorista%').order('nome'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Auxiliar%').order('nome'),
      supabaseClient.from('rotas').select('numero, supervisor').order('numero', { ascending: true })
    ]);

    rotasCadastradas = rotasRes.data || [];
    preencherDatalist('listaPlacas', veiculosRes.data?.map(v => v.placa));
    preencherDatalist('listaMotoristas', motoristasRes.data?.map(nomeFuncionario));
    preencherDatalist('listaAuxiliares', auxiliaresRes.data?.map(nomeFuncionario));
    preencherDatalist('listaRotas', rotasCadastradas.map(r => r.numero));
  } catch (error) {
    console.error('Erro ao carregar listas:', error);
  }
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

function normalizarTextoBusca(valor) {
  return String(valor || '').trim().toUpperCase();
}

function obterSupervisorDaRota(numeroRota) {
  const rota = rotasCadastradas.find(item => normalizarTextoBusca(item.numero) === normalizarTextoBusca(numeroRota));
  return rota?.supervisor || '';
}

function preencherSupervisorDaRota() {
  const supervisor = obterSupervisorDaRota(document.getElementById('acompanhamentoRota').value);
  document.getElementById('acompanhamentoSupervisor').value = supervisor;
}

function abrirModal(item = null, somenteVisualizacao = false) {
  document.getElementById('formAcompanhamento').reset();
  acompanhamentoEditandoId = item?.id || null;
  acompanhamentoVisualizando = Boolean(somenteVisualizacao);
  document.querySelector('#modalAcompanhamento .modal-header h3').textContent = acompanhamentoVisualizando
    ? 'Visualizar Acompanhamento'
    : (acompanhamentoEditandoId ? 'Editar Acompanhamento' : 'Acompanhamento');
  document.getElementById('btnSalvarAcompanhamento').textContent = acompanhamentoEditandoId ? 'Salvar Alteracoes' : 'Salvar';
  atualizarBotaoCompartilharModal();

  document.getElementById('acompanhamentoData').value = item?.data_acompanhamento || new Date().toISOString().split('T')[0];
  document.getElementById('acompanhamentoRota').value = item?.rota || '';
  document.getElementById('acompanhamentoQtdEntregas').value = item?.qtd_entregas ?? '';
  document.getElementById('acompanhamentoSupervisor').value = item?.supervisor || obterSupervisorDaRota(item?.rota) || '';
  document.getElementById('acompanhamentoPlaca').value = item?.placa || '';
  document.getElementById('acompanhamentoTipoRota').value = item?.tipo_rota || 'bate_volta';
  document.getElementById('acompanhamentoMotorista').value = item?.motorista || '';
  document.getElementById('acompanhamentoAuxiliar').value = item?.auxiliar || '';
  document.getElementById('acompanhamentoTerceiro').value = item?.terceiro || item?.terceiro_motorista || item?.terceiro_auxiliar || '';
  document.getElementById('acompanhamentoObservacoes').value = item?.observacoes || '';

  const clientes = normalizarArray(item?.clientes);
  const sugestaoRoteiro = normalizarArray(item?.sugestao_roteiro);
  const horarios = normalizarArray(item?.horarios);
  document.getElementById('clientesContainer').innerHTML = '';
  document.getElementById('sugestaoClientesContainer').innerHTML = '';
  document.getElementById('horariosContainer').innerHTML = '';
  (clientes.length ? clientes : [{}]).forEach(cliente => adicionarCliente(cliente));
  sugestaoRoteiro.forEach(cliente => adicionarCliente(cliente, 'sugestaoClientesContainer'));
  document.getElementById('habilitarSugestaoRoteiro').checked = sugestaoRoteiro.length > 0;
  atualizarSugestaoRoteiro();
  (horarios.length ? horarios : [{}]).forEach((dia, index) => adicionarDia(dia, index + 1));
  atualizarTipoRota();
  aplicarModoVisualizacaoAcompanhamento();
  document.getElementById('modalAcompanhamento').classList.remove('hidden');
}

function fecharModal() {
  acompanhamentoEditandoId = null;
  acompanhamentoVisualizando = false;
  document.getElementById('modalAcompanhamento').classList.add('hidden');
}

function atualizarBotaoCompartilharModal() {
  const btn = document.getElementById('btnCompartilharAcompanhamentoWhatsapp');
  const podeCompartilhar = Boolean(acompanhamentoEditandoId) && !acompanhamentoVisualizando;
  btn.classList.toggle('hidden', !podeCompartilhar);
  btn.disabled = !podeCompartilhar;
}

function aplicarModoVisualizacaoAcompanhamento() {
  const modal = document.getElementById('modalAcompanhamento');
  if (!modal) return;

  modal.querySelectorAll('input, select, textarea').forEach(campo => {
    campo.disabled = acompanhamentoVisualizando;
  });

  const botoesSempreBloqueadosNaVisualizacao = [
    'btnAdicionarCliente',
    'btnAdicionarSugestaoCliente',
    'btnCompartilharSugestaoWhatsapp',
    'btnCompartilharRoteiroAtualWhatsapp',
    'btnSalvarAcompanhamento'
  ];

  botoesSempreBloqueadosNaVisualizacao.forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', acompanhamentoVisualizando);
  });
  if (acompanhamentoVisualizando) {
    document.getElementById('btnAdicionarDia')?.classList.add('hidden');
  }

  modal.querySelectorAll('[data-remove]').forEach(btn => {
    btn.classList.toggle('hidden', acompanhamentoVisualizando);
  });

  const btnCancelar = document.getElementById('btnCancelarAcompanhamento');
  if (btnCancelar) btnCancelar.textContent = acompanhamentoVisualizando ? 'Fechar' : 'Cancelar';

  atualizarBotaoCompartilharModal();
}

function adicionarCliente(cliente = {}, containerId = 'clientesContainer') {
  const container = document.getElementById(containerId);
  const isSugestao = containerId === 'sugestaoClientesContainer';
  const index = container.querySelectorAll('.cliente-item').length + 1;
  const item = document.createElement('div');
  item.className = 'dynamic-item cliente-item';
  item.innerHTML = `
    <div class="dynamic-item-header">
      <span class="dynamic-item-title">Cliente ${index}</span>
      <button type="button" class="btn-custom btn-remover" data-remove="cliente"><i class="fas fa-trash"></i></button>
    </div>
    <div class="form-grid-2-cols">
      <div class="form-group">
        <label>Nome do Cliente</label>
        <input type="text" class="glass-input cliente-nome" required>
      </div>
      <div class="form-group checkbox-line">
        <input type="checkbox" class="cliente-mercado-horario">
        <label>Mercado de horario?</label>
      </div>
      <div class="form-group horario-mercado hidden">
        <label>Horario de Recebimento ate</label>
        <input type="time" class="glass-input cliente-horario-recebimento">
      </div>
      ${isSugestao ? '' : `
      <div class="form-group">
        <label>Horario de chegada</label>
        <input type="time" class="glass-input cliente-horario-chegada">
      </div>
      <div class="form-group">
        <label>Chamou p/ Descarga</label>
        <input type="time" class="glass-input cliente-chamou-descarga">
      </div>
      <div class="form-group">
        <label>Termino da Descarga</label>
        <input type="time" class="glass-input cliente-termino-descarga">
      </div>
      <div class="form-group">
        <label>Liberou Canhoto</label>
        <input type="time" class="glass-input cliente-liberou-canhoto">
      </div>
      `}
    </div>
  `;
  container.appendChild(item);
  item.querySelector('.cliente-nome').value = cliente.nome || '';
  item.querySelector('.cliente-mercado-horario').checked = Boolean(cliente.mercado_horario);
  item.querySelector('.cliente-horario-recebimento').value = cliente.horario_recebimento_ate || '';
  if (!isSugestao) {
    item.querySelector('.cliente-horario-chegada').value = cliente.horario_chegada || '';
    item.querySelector('.cliente-chamou-descarga').value = cliente.chamou_descarga || '';
    item.querySelector('.cliente-termino-descarga').value = cliente.termino_descarga || '';
    item.querySelector('.cliente-liberou-canhoto').value = cliente.liberou_canhoto || '';
  }
  atualizarMercadoHorario(item);
}

function adicionarDia(dia = {}, numeroInformado = null) {
  const index = numeroInformado || document.querySelectorAll('#horariosContainer .dia-item').length + 1;
  const item = document.createElement('div');
  item.className = 'dynamic-item dia-item';
  item.innerHTML = `
    <div class="dynamic-item-header">
      <span class="dynamic-item-title">${index} Dia</span>
      <button type="button" class="btn-custom btn-remover" data-remove="dia"><i class="fas fa-trash"></i></button>
    </div>
    <div class="form-grid-2-cols">
      <div class="form-group bate-volta-only">
        <label>Saida da empresa</label>
        <input type="time" class="glass-input dia-saida-empresa">
      </div>
      <div class="form-group viagem-only hidden">
        <label class="dia-saida-label">Saida da empresa</label>
        <input type="time" class="glass-input dia-saida-viagem">
      </div>
      <div class="form-group">
        <label>Cafe de</label>
        <input type="time" class="glass-input dia-cafe-de">
      </div>
      <div class="form-group">
        <label>Cafe ate</label>
        <input type="time" class="glass-input dia-cafe-ate">
      </div>
      <div class="form-group">
        <label>Total Cafe</label>
        <div class="tempo-totalizador dia-cafe-total">0min</div>
      </div>
      <div class="form-group">
        <label>Almoco de</label>
        <input type="time" class="glass-input dia-almoco-de">
      </div>
      <div class="form-group">
        <label>Almoco ate</label>
        <input type="time" class="glass-input dia-almoco-ate">
      </div>
      <div class="form-group">
        <label>Total Almoco</label>
        <div class="tempo-totalizador dia-almoco-total">0min</div>
      </div>
      <div class="form-group">
        <label>Finalizacao das Entregas</label>
        <input type="time" class="glass-input dia-finalizacao">
      </div>
      <div class="form-group bate-volta-only">
        <label>Chegada na empresa</label>
        <input type="time" class="glass-input dia-chegada-empresa">
      </div>
      <div class="form-group viagem-only hidden">
        <label class="dia-chegada-label">Chegada no Hotel</label>
        <input type="time" class="glass-input dia-chegada-viagem">
      </div>
    </div>
  `;
  document.getElementById('horariosContainer').appendChild(item);
  item.querySelector('.dia-saida-empresa').value = dia.saida_empresa || '';
  item.querySelector('.dia-saida-viagem').value = dia.saida_viagem || dia.saida_empresa || dia.saida_hotel || '';
  item.querySelector('.dia-cafe-de').value = dia.cafe_de || dia.cafe || '';
  item.querySelector('.dia-cafe-ate').value = dia.cafe_ate || '';
  item.querySelector('.dia-almoco-de').value = dia.almoco_de || dia.almoco || '';
  item.querySelector('.dia-almoco-ate').value = dia.almoco_ate || '';
  item.querySelector('.dia-finalizacao').value = dia.finalizacao_entregas || '';
  item.querySelector('.dia-chegada-empresa').value = dia.chegada_empresa || '';
  item.querySelector('.dia-chegada-viagem').value = dia.chegada_viagem || dia.chegada_hotel || dia.chegada_hotel_empresa || '';
  atualizarTotalizadoresDia(item);
  atualizarTipoRota();
}

function handleClienteChange(event) {
  if (!event.target.classList.contains('cliente-mercado-horario')) return;
  atualizarMercadoHorario(event.target.closest('.cliente-item'));
}

function atualizarMercadoHorario(item) {
  const campoHorario = item.querySelector('.horario-mercado');
  campoHorario.classList.toggle('hidden', !item.querySelector('.cliente-mercado-horario').checked);
}

function handleHorarioInput(event) {
  if (!event.target.matches('.dia-cafe-de, .dia-cafe-ate, .dia-almoco-de, .dia-almoco-ate')) return;
  atualizarTotalizadoresDia(event.target.closest('.dia-item'));
}

function atualizarTotalizadoresDia(item) {
  if (!item) return;
  const cafeMinutos = calcularMinutos(item.querySelector('.dia-cafe-de').value, item.querySelector('.dia-cafe-ate').value);
  const almocoMinutos = calcularMinutos(item.querySelector('.dia-almoco-de').value, item.querySelector('.dia-almoco-ate').value);
  item.querySelector('.dia-cafe-total').textContent = formatarDuracao(cafeMinutos);
  item.querySelector('.dia-almoco-total').textContent = formatarDuracao(almocoMinutos);
}

function atualizarSugestaoRoteiro() {
  const habilitado = document.getElementById('habilitarSugestaoRoteiro').checked;
  const body = document.getElementById('sugestaoRoteiroBody');
  const container = document.getElementById('sugestaoClientesContainer');
  body.classList.toggle('hidden', !habilitado);
  if (habilitado && container.querySelectorAll('.cliente-item').length === 0) {
    adicionarCliente({}, 'sugestaoClientesContainer');
  }
}

function handleDynamicRemove(event) {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  const container = button.closest('.dynamic-list');
  if (container.querySelectorAll('.dynamic-item').length <= 1) {
    alert('Mantenha pelo menos um item.');
    return;
  }
  button.closest('.dynamic-item').remove();
  renumerarItens(container);
}

function renumerarItens(container) {
  container.querySelectorAll('.dynamic-item-title').forEach((title, index) => {
    title.textContent = container.classList.contains('dynamic-list') && container.id !== 'horariosContainer'
      ? `Cliente ${index + 1}`
      : `${index + 1} Dia`;
  });
  atualizarTipoRota();
}

function atualizarTipoRota() {
  const tipo = document.getElementById('acompanhamentoTipoRota').value;
  const totalDias = document.querySelectorAll('#horariosContainer .dia-item').length;
  if (tipo === 'viagem' && totalDias < 2) {
    for (let i = totalDias; i < 2; i += 1) adicionarDia();
    return;
  }

  document.querySelectorAll('.bate-volta-only').forEach(el => el.classList.toggle('hidden', tipo !== 'bate_volta'));
  document.querySelectorAll('.viagem-only').forEach(el => el.classList.toggle('hidden', tipo !== 'viagem'));
  document.getElementById('btnAdicionarDia').classList.toggle('hidden', tipo !== 'viagem');

  document.querySelectorAll('#horariosContainer .dia-item').forEach((item, index) => {
    item.querySelector('.dynamic-item-title').textContent = tipo === 'viagem' ? `${index + 1} Dia` : 'Bate e Volta';
    item.querySelector('.dia-saida-label').textContent = index === 0 ? 'Saida da empresa' : 'Saida do Hotel';
    item.querySelector('.dia-chegada-label').textContent = index === 0 ? 'Chegada no Hotel' : 'Chegada no Hotel/Empresa';
  });
}

async function handleTabelaClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const item = acompanhamentos.find(acompanhamento => acompanhamento.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'visualizar') {
    abrirModal(item, true);
    return;
  }

  if (button.dataset.action === 'editar') {
    abrirModal(item);
    return;
  }

  if (button.dataset.action === 'excluir') {
    if (!usuarioPodeExcluir()) {
      alert('Seu nivel de acesso permite apenas editar acompanhamentos.');
      return;
    }
    await excluirAcompanhamento(item);
    return;
  }

  if (button.dataset.action === 'whatsapp') {
    compartilharAcompanhamentoWhatsapp(item);
  }
}

async function salvarAcompanhamento(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSalvarAcompanhamento');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
    const estavaEditando = Boolean(acompanhamentoEditandoId);
    const payload = {
      data_acompanhamento: document.getElementById('acompanhamentoData').value,
      rota: document.getElementById('acompanhamentoRota').value.trim(),
      qtd_entregas: getNumeroOuNull('acompanhamentoQtdEntregas'),
      supervisor: document.getElementById('acompanhamentoSupervisor').value.trim() || null,
      tipo_rota: document.getElementById('acompanhamentoTipoRota').value,
      placa: document.getElementById('acompanhamentoPlaca').value.trim().toUpperCase(),
      motorista: document.getElementById('acompanhamentoMotorista').value.trim(),
      auxiliar: document.getElementById('acompanhamentoAuxiliar').value.trim() || null,
      terceiro: document.getElementById('acompanhamentoTerceiro').value.trim() || null,
      clientes: coletarClientes(),
      sugestao_roteiro: coletarSugestaoRoteiro(),
      horarios: coletarHorarios(),
      observacoes: document.getElementById('acompanhamentoObservacoes').value.trim() || null
    };

    if (!payload.clientes.length) throw new Error('Informe pelo menos um cliente.');
    if (!payload.horarios.length) throw new Error('Informe pelo menos um horario.');

    if (!estavaEditando) {
      payload.usuario_id = usuario.id || null;
      payload.usuario_nome = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
    }

    let idAcompanhamento = acompanhamentoEditandoId;
    let error = null;

    if (estavaEditando) {
      ({ error } = await supabaseClient.from('fiscalizacao_acompanhamentos').update(payload).eq('id', acompanhamentoEditandoId));
    } else {
      const result = await supabaseClient.from('fiscalizacao_acompanhamentos').insert([payload]).select('id').single();
      error = result.error;
      idAcompanhamento = result.data?.id || null;
    }

    if (error) throw error;

    acompanhamentoEditandoId = idAcompanhamento;
    document.querySelector('#modalAcompanhamento .modal-header h3').textContent = 'Editar Acompanhamento';
    btn.textContent = 'Salvar Alteracoes';
    atualizarBotaoCompartilharModal();
    await buscarAcompanhamentos();
    registrarAuditoria(estavaEditando ? 'ALTERAR' : 'INCLUIR', 'Fiscalização Acompanhamento', `${estavaEditando ? 'Alteração' : 'Inclusão'} de acompanhamento`);
    alert(estavaEditando ? 'Acompanhamento atualizado com sucesso! Botao de compartilhamento habilitado.' : 'Acompanhamento registrado com sucesso! Botao de compartilhamento habilitado.');
  } catch (error) {
    console.error('Erro ao salvar acompanhamento:', error);
    alert(`Erro ao salvar acompanhamento: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = acompanhamentoEditandoId ? 'Salvar Alteracoes' : 'Salvar';
  }
}

function coletarClientes() {
  return coletarClientesDoContainer('clientesContainer');
}

function coletarSugestaoRoteiro() {
  if (!document.getElementById('habilitarSugestaoRoteiro').checked) return [];
  return coletarClientesDoContainer('sugestaoClientesContainer');
}

function coletarClientesDoContainer(containerId) {
  return [...document.querySelectorAll(`#${containerId} .cliente-item`)]
    .map(item => ({
      nome: item.querySelector('.cliente-nome').value.trim(),
      mercado_horario: item.querySelector('.cliente-mercado-horario').checked,
      horario_recebimento_ate: item.querySelector('.cliente-horario-recebimento').value || null,
      horario_chegada: item.querySelector('.cliente-horario-chegada')?.value || null,
      chamou_descarga: item.querySelector('.cliente-chamou-descarga')?.value || null,
      termino_descarga: item.querySelector('.cliente-termino-descarga')?.value || null,
      liberou_canhoto: item.querySelector('.cliente-liberou-canhoto')?.value || null
    }))
    .filter(cliente => cliente.nome);
}

function coletarHorarios() {
  const tipo = document.getElementById('acompanhamentoTipoRota').value;
  return [...document.querySelectorAll('#horariosContainer .dia-item')].map((item, index) => ({
    dia: index + 1,
    tipo_rota: tipo,
    saida_empresa: tipo === 'bate_volta' ? item.querySelector('.dia-saida-empresa').value || null : null,
    saida_viagem: tipo === 'viagem' ? item.querySelector('.dia-saida-viagem').value || null : null,
    cafe_de: item.querySelector('.dia-cafe-de').value || null,
    cafe_ate: item.querySelector('.dia-cafe-ate').value || null,
    cafe_total_minutos: calcularMinutos(item.querySelector('.dia-cafe-de').value, item.querySelector('.dia-cafe-ate').value),
    almoco_de: item.querySelector('.dia-almoco-de').value || null,
    almoco_ate: item.querySelector('.dia-almoco-ate').value || null,
    almoco_total_minutos: calcularMinutos(item.querySelector('.dia-almoco-de').value, item.querySelector('.dia-almoco-ate').value),
    finalizacao_entregas: item.querySelector('.dia-finalizacao').value || null,
    chegada_empresa: tipo === 'bate_volta' ? item.querySelector('.dia-chegada-empresa').value || null : null,
    chegada_viagem: tipo === 'viagem' ? item.querySelector('.dia-chegada-viagem').value || null : null
  }));
}

async function excluirAcompanhamento(item) {
  const confirmar = confirm(`Deseja excluir o acompanhamento da placa ${item.placa || '-'} em ${formatarData(item.data_acompanhamento)}?`);
  if (!confirmar) return;

  try {
    const { error } = await supabaseClient
      .from('fiscalizacao_acompanhamentos')
      .delete()
      .eq('id', item.id);

    if (error) throw error;

    await buscarAcompanhamentos();
    registrarAuditoria('EXCLUIR', 'Fiscalização Acompanhamento', `Exclusão de acompanhamento da placa ${item.placa || item.id}`);
    alert('Acompanhamento excluido com sucesso!');
  } catch (error) {
    console.error('Erro ao excluir acompanhamento:', error);
    alert(`Erro ao excluir acompanhamento: ${error.message}`);
  }
}

async function buscarAcompanhamentos() {
  const btn = document.getElementById('btnBuscarAcompanhamentos');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

  try {
    const dataDe = document.getElementById('filtroDataDe').value;
    const dataAte = document.getElementById('filtroDataAte').value;
    const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
    const motorista = document.getElementById('filtroMotorista').value.trim();
    const rota = document.getElementById('filtroRota').value.trim();

    let query = supabaseClient.from('fiscalizacao_acompanhamentos').select('*');
    if (dataDe) query = query.gte('data_acompanhamento', dataDe);
    if (dataAte) query = query.lte('data_acompanhamento', dataAte);
    if (placa) query = query.ilike('placa', `%${placa}%`);
    if (motorista) query = query.ilike('motorista', `%${motorista}%`);
    if (rota) query = query.ilike('rota', `%${rota}%`);

    const { data, error } = await query.order('data_acompanhamento', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;

    acompanhamentos = data || [];
    renderizarTabela();
  } catch (error) {
    console.error('Erro ao buscar acompanhamentos:', error);
    alert(`Erro ao buscar acompanhamentos: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-search"></i> Buscar';
  }
}

function getDadosGrid() {
  const termo = document.getElementById('filtroLocal').value.trim().toUpperCase();
  let dados = [...acompanhamentos];

  if (termo) {
    dados = dados.filter(item => [
      item.data_acompanhamento,
      item.usuario_nome,
      item.rota,
      item.supervisor,
      item.qtd_entregas,
      item.tipo_rota,
      item.placa,
      item.motorista,
      item.auxiliar,
      item.terceiro,
      resumoClientes(item.clientes),
      resumoClientes(item.sugestao_roteiro),
      resumoHorarios(item.horarios),
      item.observacoes
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
  const tbody = document.getElementById('tbodyAcompanhamentos');
  const dados = getDadosGrid();
  document.getElementById('totalRegistros').textContent = dados.length;

  if (dados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 20px;">Nenhum registro encontrado.</td></tr>';
    atualizarIconesOrdenacao();
    return;
  }

  tbody.innerHTML = dados.map(item => `
    <tr>
      <td>${formatarData(item.data_acompanhamento)}</td>
      <td>${escapeHtml(item.usuario_nome || '-')}</td>
      <td>${escapeHtml(item.rota || '-')}</td>
      <td>${escapeHtml(item.supervisor || '-')}</td>
      <td>${escapeHtml(item.qtd_entregas ?? '-')}</td>
      <td>${escapeHtml(formatarTipoRota(item.tipo_rota))}</td>
      <td><strong>${escapeHtml(item.placa || '-')}</strong></td>
      <td>${escapeHtml(item.motorista || '-')}</td>
      <td class="clientes-resumo">${escapeHtml(resumoClientes(item.clientes))}</td>
      <td class="dias-resumo">${escapeHtml(resumoHorarios(item.horarios))}</td>
      <td class="acoes-cell">
        <button type="button" class="btn-grid-action btn-view" data-action="visualizar" data-id="${escapeHtml(item.id)}" title="Visualizar">
          <i class="fas fa-eye"></i>
        </button>
        <button type="button" class="btn-grid-action btn-edit" data-action="editar" data-id="${escapeHtml(item.id)}" title="Editar">
          <i class="fas fa-pen"></i>
        </button>
        <button type="button" class="btn-grid-action btn-share" data-action="whatsapp" data-id="${escapeHtml(item.id)}" title="Compartilhar via WhatsApp">
          <i class="fab fa-whatsapp"></i>
        </button>
        ${usuarioPodeExcluir() ? `
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

function normalizarArray(valor) {
  if (Array.isArray(valor)) return valor;
  if (!valor) return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resumoClientes(clientes) {
  const lista = normalizarArray(clientes);
  if (!lista.length) return '-';
  return lista.map((cliente, index) => `${index + 1}. ${cliente.nome || '-'}${cliente.mercado_horario ? ' (horario)' : ''}`).join('\n');
}

function resumoHorarios(horarios) {
  const lista = normalizarArray(horarios);
  if (!lista.length) return '-';
  return lista.map(dia => {
    const cafeTotal = dia.cafe_total_minutos ?? calcularMinutos(dia.cafe_de, dia.cafe_ate);
    const almocoTotal = dia.almoco_total_minutos ?? calcularMinutos(dia.almoco_de, dia.almoco_ate);
    return `Dia ${dia.dia || 1}: fim ${dia.finalizacao_entregas || '-'} | cafe ${formatarDuracao(cafeTotal)} | almoco ${formatarDuracao(almocoTotal)}`;
  }).join('\n');
}

function formatarTipoRota(tipo) {
  return tipo === 'viagem' ? 'Rota Viagem' : 'Bate e Volta';
}

function formatarData(data) {
  if (!data) return '-';
  return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
}

function calcularMinutos(inicio, fim) {
  if (!inicio || !fim) return 0;
  const [hIni, mIni] = inicio.split(':').map(Number);
  const [hFim, mFim] = fim.split(':').map(Number);
  if ([hIni, mIni, hFim, mFim].some(Number.isNaN)) return 0;
  let total = (hFim * 60 + mFim) - (hIni * 60 + mIni);
  if (total < 0) total += 24 * 60;
  return total;
}

function formatarDuracao(minutos) {
  const total = Number(minutos) || 0;
  if (total <= 0) return '0min';
  const horas = Math.floor(total / 60);
  const mins = total % 60;
  return horas ? `${horas}h${String(mins).padStart(2, '0')}` : `${mins}min`;
}

function compartilharSugestaoWhatsapp() {
  const sugestao = coletarSugestaoRoteiro();
  if (!sugestao.length) return alert('Informe pelo menos um cliente na sugestao de roteiro.');

  const rota = document.getElementById('acompanhamentoRota').value.trim() || '-';
  const placa = document.getElementById('acompanhamentoPlaca').value.trim().toUpperCase() || '-';
  const motorista = document.getElementById('acompanhamentoMotorista').value.trim() || '-';
  const linhas = [
    '*Sugestao de Roteiro*',
    `Rota: ${rota}`,
    `Placa: ${placa}`,
    `Motorista: ${motorista}`,
    '',
    ...sugestao.map((cliente, index) => {
      const horario = cliente.mercado_horario && cliente.horario_recebimento_ate
        ? ` - recebimento ate ${cliente.horario_recebimento_ate}`
        : '';
      return `${index + 1}. ${cliente.nome}${cliente.mercado_horario ? ' (mercado de horario)' : ''}${horario}`;
    })
  ];

  window.open(`https://wa.me/?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank');
}

function compartilharRoteiroAtualWhatsapp() {
  const clientes = coletarClientes();
  if (!clientes.length) return alert('Informe pelo menos um cliente no Roteiro Atual.');

  const rota = document.getElementById('acompanhamentoRota').value.trim() || '-';
  const placa = document.getElementById('acompanhamentoPlaca').value.trim().toUpperCase() || '-';
  const motorista = document.getElementById('acompanhamentoMotorista').value.trim() || '-';
  const linhas = [
    '*Roteiro Atual*',
    `Rota: ${rota}`,
    `Placa: ${placa}`,
    `Motorista: ${motorista}`,
    '',
    ...clientes.map((cliente, index) => {
      const horario = cliente.mercado_horario && cliente.horario_recebimento_ate
        ? ` - recebimento ate ${cliente.horario_recebimento_ate}`
        : '';
      return `${index + 1}. ${cliente.nome}${cliente.mercado_horario ? ' (mercado de horario)' : ''}${horario}`;
    })
  ];

  window.open(`https://wa.me/?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank');
}

function obterAcompanhamentoDoFormulario() {
  return {
    id: acompanhamentoEditandoId,
    data_acompanhamento: document.getElementById('acompanhamentoData').value,
    rota: document.getElementById('acompanhamentoRota').value.trim(),
    qtd_entregas: getNumeroOuNull('acompanhamentoQtdEntregas'),
    supervisor: document.getElementById('acompanhamentoSupervisor').value.trim() || null,
    tipo_rota: document.getElementById('acompanhamentoTipoRota').value,
    placa: document.getElementById('acompanhamentoPlaca').value.trim().toUpperCase(),
    motorista: document.getElementById('acompanhamentoMotorista').value.trim(),
    auxiliar: document.getElementById('acompanhamentoAuxiliar').value.trim() || null,
    terceiro: document.getElementById('acompanhamentoTerceiro').value.trim() || null,
    clientes: coletarClientes(),
    sugestao_roteiro: coletarSugestaoRoteiro(),
    horarios: coletarHorarios(),
    observacoes: document.getElementById('acompanhamentoObservacoes').value.trim() || null
  };
}

function compartilharAcompanhamentoWhatsapp(acompanhamento = null) {
  const dados = acompanhamento || obterAcompanhamentoDoFormulario();
  if (!dados?.id && !acompanhamentoEditandoId) {
    alert('Salve o acompanhamento antes de compartilhar.');
    return;
  }

  const clientes = normalizarArray(dados.clientes);
  const horarios = normalizarArray(dados.horarios);
  const sugestao = normalizarArray(dados.sugestao_roteiro);
  const linhas = [
    '*Fiscalizacao - Acompanhamento de Rota*',
    `Data: ${formatarData(dados.data_acompanhamento)}`,
    `Rota: ${dados.rota || '-'}`,
    `Supervisor: ${dados.supervisor || '-'}`,
    `QTD de Entregas: ${dados.qtd_entregas ?? '-'}`,
    `Tipo: ${formatarTipoRota(dados.tipo_rota)}`,
    `Placa: ${dados.placa || '-'}`,
    `Motorista: ${dados.motorista || '-'}`,
    `Auxiliar: ${dados.auxiliar || '-'}`,
    `Terceiro: ${dados.terceiro || '-'}`,
    '',
    '*Clientes:*',
    ...(clientes.length ? clientes.map(formatarClienteWhatsapp) : ['-']),
    '',
    '*Horarios:*',
    ...(horarios.length ? horarios.map(formatarHorarioWhatsapp) : ['-'])
  ];

  if (dados.observacoes) {
    linhas.push('', '*Observacoes:*', dados.observacoes);
  }

  if (sugestao.length) {
    linhas.push('', '*Sugestao de Roteiro:*', ...sugestao.map(formatarClienteWhatsapp));
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank');
}

function formatarClienteWhatsapp(cliente, index) {
  const partes = [`${index + 1}. ${cliente.nome || '-'}`];
  if (cliente.mercado_horario) partes.push('mercado de horario');
  if (cliente.horario_recebimento_ate) partes.push(`recebimento ate ${cliente.horario_recebimento_ate}`);
  if (cliente.horario_chegada) partes.push(`chegada ${cliente.horario_chegada}`);
  if (cliente.chamou_descarga) partes.push(`chamou descarga ${cliente.chamou_descarga}`);
  if (cliente.termino_descarga) partes.push(`termino descarga ${cliente.termino_descarga}`);
  if (cliente.liberou_canhoto) partes.push(`liberou canhoto ${cliente.liberou_canhoto}`);
  return partes.join(' - ');
}

function formatarHorarioWhatsapp(dia) {
  const cafeTotal = dia.cafe_total_minutos ?? calcularMinutos(dia.cafe_de, dia.cafe_ate);
  const almocoTotal = dia.almoco_total_minutos ?? calcularMinutos(dia.almoco_de, dia.almoco_ate);
  return [
    `Dia ${dia.dia || 1}:`,
    `saida ${dia.saida_empresa || dia.saida_viagem || '-'}`,
    `cafe ${dia.cafe_de || '-'} ate ${dia.cafe_ate || '-'} (${formatarDuracao(cafeTotal)})`,
    `almoco ${dia.almoco_de || '-'} ate ${dia.almoco_ate || '-'} (${formatarDuracao(almocoTotal)})`,
    `finalizacao ${dia.finalizacao_entregas || '-'}`,
    `chegada ${dia.chegada_empresa || dia.chegada_viagem || '-'}`
  ].join(' ');
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
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
  return niveisComExclusao.includes(String(usuario.nivel || '').toLowerCase());
}

function dadosParaExportacao() {
  return getDadosGrid().map(item => ({
    Data: formatarData(item.data_acompanhamento),
    Usuario: item.usuario_nome || '',
    Rota: item.rota || '',
    Supervisor: item.supervisor || '',
    'QTD de Entregas': item.qtd_entregas ?? '',
    Tipo: formatarTipoRota(item.tipo_rota),
    Placa: item.placa || '',
    Motorista: item.motorista || '',
    Auxiliar: item.auxiliar || '',
    'Terceiro Motorista/Auxiliar': item.terceiro || '',
    Clientes: resumoClientes(item.clientes),
    'Sugestao de Roteiro': resumoClientes(item.sugestao_roteiro),
    Horarios: resumoHorarios(item.horarios),
    Observacoes: item.observacoes || ''
  }));
}

function exportarExcel() {
  const rows = dadosParaExportacao();
  if (!rows.length) return alert('Nenhum registro para exportar.');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Acompanhamentos');
  XLSX.writeFile(wb, `fiscalizacao_acompanhamentos_${Date.now()}.xlsx`);
}

function getNumeroOuNull(id) {
  const valor = document.getElementById(id).value;
  return valor === '' ? null : Number(valor);
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

async function gerarFormularioImpresso() {
  if (!window.jspdf) return alert('Biblioteca jsPDF nao carregada.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const logo = await getLogoBase64();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = 12;

  const addFooter = () => {
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text('GTSYSTEM - Marquespan', margin, pageHeight - 8);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  };

  const ensureSpace = (needed = 20) => {
    if (y + needed <= pageHeight - 14) return;
    addFooter();
    doc.addPage();
    y = 12;
  };

  const sectionTitle = (title) => {
    ensureSpace(12);
    doc.setFillColor(0, 106, 45);
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    doc.text(title, margin + 2, y + 5);
    y += 10;
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');
  };

  const lineField = (label, x, width, lineY = y) => {
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(label, x, lineY);
    doc.setDrawColor(80);
    doc.setLineWidth(0.15);
    doc.line(x, lineY + 5, x + width, lineY + 5);
  };

  const checkbox = (label, x, lineY = y) => {
    doc.rect(x, lineY - 3, 3, 3);
    doc.setFontSize(8);
    doc.setTextColor(40);
    doc.text(label, x + 5, lineY);
  };

  const header = () => {
    if (logo) {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, 40, 12, 'F');
      doc.addImage(logo, 'JPEG', margin, y, 38, 11);
    }
    doc.setTextColor(0, 106, 45);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('FORMULARIO DE ACOMPANHAMENTO', pageWidth / 2, y + 6, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.setFont(undefined, 'normal');
    doc.text('Preenchimento manual para posterior lancamento no sistema', pageWidth / 2, y + 11, { align: 'center' });
    y += 18;
  };

  const drawClienteTable = (title, rows, sugestao = false) => {
    sectionTitle(title);
    const head = sugestao
      ? [['#', 'Cliente', 'Mercado horario', 'Recebimento ate']]
      : [['#', 'Cliente', 'Mercado horario', 'Receb. ate', 'Chegada', 'Chamou descarga', 'Termino descarga', 'Liberou canhoto']];
    const body = Array.from({ length: rows }, (_, index) => sugestao
      ? [index + 1, '', 'Sim ( )  Nao ( )', '']
      : [index + 1, '', 'Sim ( )  Nao ( )', '', '', '', '', '']);

    doc.autoTable({
      startY: y,
      head,
      body,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 1.4, minCellHeight: 8, textColor: [30, 30, 30] },
      headStyles: { fillColor: [230, 240, 234], textColor: [0, 80, 35], fontStyle: 'bold' },
      columnStyles: sugestao
        ? { 0: { cellWidth: 9 }, 1: { cellWidth: 84 }, 2: { cellWidth: 42 }, 3: { cellWidth: 36 } }
        : { 0: { cellWidth: 7 }, 1: { cellWidth: 39 }, 2: { cellWidth: 24 }, 3: { cellWidth: 19 }, 4: { cellWidth: 18 }, 5: { cellWidth: 25 }, 6: { cellWidth: 27 }, 7: { cellWidth: 21 } }
    });
    y = doc.lastAutoTable.finalY + 8;
  };

  header();

  sectionTitle('Dados da Rota');
  lineField('Data', margin, 28);
  lineField('Rota', margin + 34, 28);
  lineField('Supervisor', margin + 68, 58);
  lineField('QTD de Entregas', margin + 132, 28);
  y += 13;
  lineField('Placa', margin, 28);
  lineField('Tipo de Rota', margin + 34, 42);
  lineField('Motorista', margin + 82, 50);
  lineField('Auxiliar', margin + 138, 44);
  y += 13;
  lineField('Terceiro Motorista/Auxiliar', margin, 70);
  y += 13;
  checkbox('Bate e Volta', margin);
  checkbox('Rota Viagem', margin + 40);
  y += 7;

  drawClienteTable('Quantidades de Entrega (Roteiro Atual)', 22, false);

  sectionTitle('Horario - Bate e Volta');
  lineField('Saida da empresa', margin, 34);
  lineField('Cafe de', margin + 40, 24);
  lineField('Cafe ate', margin + 70, 24);
  lineField('Almoco de', margin + 100, 24);
  lineField('Almoco ate', margin + 130, 24);
  y += 13;
  lineField('Finalizacao das Entregas', margin, 46);
  lineField('Chegada na empresa', margin + 54, 44);
  y += 13;

  sectionTitle('Horario - Rota Viagem');
  doc.setFontSize(8);
  doc.setTextColor(40);
  ['1 Dia', '2 Dia', '3 Dia', '4 Dia', '5 Dia'].forEach((diaLabel) => {
    ensureSpace(16);
    doc.setFont(undefined, 'bold');
    doc.text(diaLabel, margin, y);
    doc.setFont(undefined, 'normal');
    lineField('Saida empresa/hotel', margin + 17, 34, y);
    lineField('Cafe de', margin + 56, 22, y);
    lineField('Cafe ate', margin + 83, 22, y);
    lineField('Almoco de', margin + 110, 22, y);
    lineField('Almoco ate', margin + 137, 22, y);
    y += 10;
    lineField('Finalizacao Entregas', margin + 17, 42, y);
    lineField('Chegada hotel/empresa', margin + 66, 46, y);
    y += 12;
  });

  sectionTitle('Observacoes');
  ensureSpace(104);
  doc.setDrawColor(90);
  doc.setLineWidth(0.15);
  Array.from({ length: 16 }).forEach((_, index) => {
    const lineY = y + index * 6;
    doc.line(margin, lineY, pageWidth - margin, lineY);
  });
  y += 103;

  drawClienteTable('Sugestao de Roteiro - Clientes da Sugestao', 22, true);

  addFooter();
  doc.save(`formulario_acompanhamento_${new Date().toISOString().slice(0, 10)}.pdf`);
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
  doc.text('Fiscalizacao - Acompanhamentos', 60, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 18, { align: 'right' });

  doc.autoTable({
    head: [['Data', 'Rota', 'Supervisor', 'Tipo', 'Placa', 'Motorista', 'Clientes', 'Horarios']],
    body: rows.map(row => [row.Data, row.Rota, row.Supervisor, row.Tipo, row.Placa, row.Motorista, row.Clientes, row.Horarios]),
    startY: 30,
    theme: 'grid',
    headStyles: { fillColor: [0, 105, 55], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [240, 240, 240] },
    columnStyles: {
      6: { cellWidth: 50 },
      7: { cellWidth: 40 }
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Pagina ${i} de ${pageCount}`, 283, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
  }

  doc.save(`fiscalizacao_acompanhamentos_${Date.now()}.pdf`);
}
