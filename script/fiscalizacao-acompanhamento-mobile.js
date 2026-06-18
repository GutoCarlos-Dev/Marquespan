import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

let acompanhamentos = [];
let acompanhamentoEditandoId = null;
let rotasCadastradas = [];
let carregandoHorariosModal = false;

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('mobileData').value = hoje;
  document.getElementById('mobileFiltroDataDe').value = hoje;
  document.getElementById('mobileFiltroDataAte').value = hoje;
  bindEvents();
  await carregarListas();
  await carregarAcompanhamentos();
});

function bindEvents() {
  document.getElementById('btnAdicionarAcompanhamento').addEventListener('click', abrirModal);
  document.getElementById('btnFecharModalMobile').addEventListener('click', fecharModal);
  document.getElementById('modalAcompanhamentoMobile').addEventListener('click', (event) => {
    if (event.target.id === 'modalAcompanhamentoMobile') fecharModal();
  });
  document.getElementById('formAcompanhamentoMobile').addEventListener('submit', salvarAcompanhamento);
  document.getElementById('btnAtualizarMobile').addEventListener('click', carregarAcompanhamentos);
  document.getElementById('mobileFiltroDataDe').addEventListener('change', carregarAcompanhamentos);
  document.getElementById('mobileFiltroDataAte').addEventListener('change', carregarAcompanhamentos);
  document.getElementById('mobileBusca').addEventListener('input', renderCards);
  document.getElementById('btnAdicionarClienteMobile').addEventListener('click', () => adicionarCliente());
  document.getElementById('btnAdicionarSugestaoClienteMobile').addEventListener('click', () => adicionarCliente({}, 'sugestaoClientesMobileContainer'));
  document.getElementById('btnAdicionarDiaMobile').addEventListener('click', () => adicionarDia());
  document.getElementById('btnCompartilharSugestaoWhatsappMobile').addEventListener('click', compartilharSugestaoWhatsapp);
  document.getElementById('mobileTipoRota').addEventListener('change', atualizarTipoRota);
  document.getElementById('mobileRota').addEventListener('change', preencherSupervisorDaRota);
  document.getElementById('mobileRota').addEventListener('blur', preencherSupervisorDaRota);
  document.getElementById('mobileHabilitarSugestaoRoteiro').addEventListener('change', atualizarSugestaoRoteiro);
  document.getElementById('clientesMobileContainer').addEventListener('change', handleClienteChange);
  document.getElementById('clientesMobileContainer').addEventListener('click', handleDynamicRemove);
  document.getElementById('sugestaoClientesMobileContainer').addEventListener('change', handleClienteChange);
  document.getElementById('sugestaoClientesMobileContainer').addEventListener('click', handleDynamicRemove);
  document.getElementById('horariosMobileContainer').addEventListener('input', handleHorarioInput);
  document.getElementById('horariosMobileContainer').addEventListener('click', handleDynamicRemove);
  document.getElementById('listaAcompanhamentosMobile').addEventListener('click', (event) => {
    const card = event.target.closest('.ocorrencia-card');
    if (!card) return;
    const item = acompanhamentos.find(acompanhamento => acompanhamento.id === card.dataset.id);
    if (item) abrirModal(item);
  });
}

function abrirModal(item = null) {
  document.getElementById('formAcompanhamentoMobile').reset();
  acompanhamentoEditandoId = item?.id || null;
  document.querySelector('#modalAcompanhamentoMobile .panel-header h3').innerHTML = acompanhamentoEditandoId
    ? '<i class="fas fa-pen"></i> Editar Acompanhamento'
    : '<i class="fas fa-clipboard-list"></i> Novo Acompanhamento';

  document.getElementById('mobileData').value = item?.data_acompanhamento || new Date().toISOString().split('T')[0];
  document.getElementById('mobileRota').value = item?.rota || '';
  document.getElementById('mobileQtdEntregas').value = item?.qtd_entregas ?? '';
  document.getElementById('mobileSupervisor').value = item?.supervisor || obterSupervisorDaRota(item?.rota) || '';
  document.getElementById('mobilePlaca').value = item?.placa || '';
  document.getElementById('mobileTipoRota').value = item?.tipo_rota || 'bate_volta';
  document.getElementById('mobileMotorista').value = item?.motorista || '';
  document.getElementById('mobileAuxiliar').value = item?.auxiliar || '';
  document.getElementById('mobileTerceiro').value = item?.terceiro || item?.terceiro_motorista || item?.terceiro_auxiliar || '';
  document.getElementById('mobileObservacoes').value = item?.observacoes || '';
  document.getElementById('clientesMobileContainer').innerHTML = '';
  document.getElementById('sugestaoClientesMobileContainer').innerHTML = '';
  document.getElementById('horariosMobileContainer').innerHTML = '';
  const clientes = normalizarArray(item?.clientes);
  const sugestaoRoteiro = normalizarArray(item?.sugestao_roteiro);
  const horarios = normalizarHorariosAcompanhamento(item?.horarios);
  (clientes.length ? clientes : [{}]).forEach(cliente => adicionarCliente(cliente));
  sugestaoRoteiro.forEach(cliente => adicionarCliente(cliente, 'sugestaoClientesMobileContainer'));
  document.getElementById('mobileHabilitarSugestaoRoteiro').checked = sugestaoRoteiro.length > 0;
  atualizarSugestaoRoteiro();
  carregandoHorariosModal = true;
  try {
    (horarios.length ? horarios : [{}]).forEach((dia) => adicionarDia(dia, dia.dia));
  } finally {
    carregandoHorariosModal = false;
  }
  atualizarTipoRota();
  document.getElementById('btnSalvarMobile').innerHTML = acompanhamentoEditandoId
    ? '<i class="fas fa-save"></i> SALVAR ALTERACOES'
    : '<i class="fas fa-save"></i> SALVAR ACOMPANHAMENTO';
  document.getElementById('modalAcompanhamentoMobile').classList.remove('hidden');
}

function fecharModal() {
  acompanhamentoEditandoId = null;
  document.getElementById('modalAcompanhamentoMobile').classList.add('hidden');
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
    preencherDatalist('listaPlacasMobile', veiculosRes.data?.map(v => v.placa));
    preencherDatalist('listaMotoristasMobile', motoristasRes.data?.map(nomeFuncionario));
    preencherDatalist('listaAuxiliaresMobile', auxiliaresRes.data?.map(nomeFuncionario));
    preencherDatalist('listaRotasMobile', rotasCadastradas.map(r => r.numero));
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
  const supervisor = obterSupervisorDaRota(document.getElementById('mobileRota').value);
  document.getElementById('mobileSupervisor').value = supervisor;
}

function adicionarCliente(cliente = {}, containerId = 'clientesMobileContainer') {
  const container = document.getElementById(containerId);
  const isSugestao = containerId === 'sugestaoClientesMobileContainer';
  const index = container.querySelectorAll('.cliente-item').length + 1;
  const item = document.createElement('div');
  item.className = 'mobile-dynamic-item cliente-item';
  item.innerHTML = `
    <div class="mobile-dynamic-header">
      <span class="mobile-dynamic-title">Cliente ${index}</span>
      <button type="button" class="btn-remove-mobile" data-remove="cliente"><i class="fas fa-trash"></i></button>
    </div>
    <div class="form-grid-mobile">
      <div class="form-group">
        <label>Nome do Cliente</label>
        <input type="text" class="cliente-nome" required>
      </div>
      <div class="form-group mobile-checkbox-line">
        <input type="checkbox" class="cliente-mercado-horario">
        <label>Mercado de horario?</label>
      </div>
      <div class="form-group mobile-horario-mercado hidden">
        <label>Horario de Recebimento ate</label>
        <input type="time" class="cliente-horario-recebimento">
      </div>
      ${isSugestao ? '' : `
      <div class="form-group">
        <label>Horario de chegada</label>
        <input type="time" class="cliente-horario-chegada">
      </div>
      <div class="form-group">
        <label>Chamou p/ Descarga</label>
        <input type="time" class="cliente-chamou-descarga">
      </div>
      <div class="form-group">
        <label>Termino da Descarga</label>
        <input type="time" class="cliente-termino-descarga">
      </div>
      <div class="form-group">
        <label>Liberou Canhoto</label>
        <input type="time" class="cliente-liberou-canhoto">
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
  const index = numeroInformado || document.querySelectorAll('#horariosMobileContainer .dia-item').length + 1;
  const item = document.createElement('div');
  item.className = 'mobile-dynamic-item dia-item';
  item.innerHTML = `
    <div class="mobile-dynamic-header">
      <span class="mobile-dynamic-title">${index} Dia</span>
      <button type="button" class="btn-remove-mobile" data-remove="dia"><i class="fas fa-trash"></i></button>
    </div>
    <div class="form-grid-mobile">
      <div class="form-group mobile-bate-volta-only">
        <label>Saida da empresa</label>
        <input type="time" class="dia-saida-empresa">
      </div>
      <div class="form-group mobile-viagem-only hidden">
        <label class="dia-saida-label">Saida da empresa</label>
        <input type="time" class="dia-saida-viagem">
      </div>
      <div class="form-group">
        <label>Cafe de</label>
        <input type="time" class="dia-cafe-de">
      </div>
      <div class="form-group">
        <label>Cafe ate</label>
        <input type="time" class="dia-cafe-ate">
      </div>
      <div class="form-group">
        <label>Total Cafe</label>
        <div class="tempo-totalizador dia-cafe-total">0min</div>
      </div>
      <div class="form-group">
        <label>Almoco de</label>
        <input type="time" class="dia-almoco-de">
      </div>
      <div class="form-group">
        <label>Almoco ate</label>
        <input type="time" class="dia-almoco-ate">
      </div>
      <div class="form-group">
        <label>Total Almoco</label>
        <div class="tempo-totalizador dia-almoco-total">0min</div>
      </div>
      <div class="form-group">
        <label>Finalizacao das Entregas</label>
        <input type="time" class="dia-finalizacao">
      </div>
      <div class="form-group mobile-bate-volta-only">
        <label>Chegada na empresa</label>
        <input type="time" class="dia-chegada-empresa">
      </div>
      <div class="form-group mobile-viagem-only hidden">
        <label class="dia-chegada-label">Chegada no Hotel</label>
        <input type="time" class="dia-chegada-viagem">
      </div>
    </div>
  `;
  document.getElementById('horariosMobileContainer').appendChild(item);
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
  if (!carregandoHorariosModal) atualizarTipoRota();
}

function handleClienteChange(event) {
  if (!event.target.classList.contains('cliente-mercado-horario')) return;
  atualizarMercadoHorario(event.target.closest('.cliente-item'));
}

function atualizarMercadoHorario(item) {
  item.querySelector('.mobile-horario-mercado').classList.toggle('hidden', !item.querySelector('.cliente-mercado-horario').checked);
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
  const habilitado = document.getElementById('mobileHabilitarSugestaoRoteiro').checked;
  const body = document.getElementById('mobileSugestaoRoteiroBody');
  const container = document.getElementById('sugestaoClientesMobileContainer');
  body.classList.toggle('hidden', !habilitado);
  if (habilitado && container.querySelectorAll('.cliente-item').length === 0) {
    adicionarCliente({}, 'sugestaoClientesMobileContainer');
  }
}

function handleDynamicRemove(event) {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  const container = button.closest('.mobile-dynamic-list');
  if (container.querySelectorAll('.mobile-dynamic-item').length <= 1) {
    alert('Mantenha pelo menos um item.');
    return;
  }
  button.closest('.mobile-dynamic-item').remove();
  renumerarItens(container);
}

function renumerarItens(container) {
  container.querySelectorAll('.mobile-dynamic-title').forEach((title, index) => {
    title.textContent = container.id === 'horariosMobileContainer' ? `${index + 1} Dia` : `Cliente ${index + 1}`;
  });
  atualizarTipoRota();
}

function atualizarTipoRota() {
  const tipo = document.getElementById('mobileTipoRota').value;
  const totalDias = document.querySelectorAll('#horariosMobileContainer .dia-item').length;
  if (!carregandoHorariosModal && tipo === 'viagem' && totalDias < 2) {
    for (let i = totalDias; i < 2; i += 1) adicionarDia();
    return;
  }

  document.querySelectorAll('.mobile-bate-volta-only').forEach(el => el.classList.toggle('hidden', tipo !== 'bate_volta'));
  document.querySelectorAll('.mobile-viagem-only').forEach(el => el.classList.toggle('hidden', tipo !== 'viagem'));
  document.getElementById('btnAdicionarDiaMobile').classList.toggle('hidden', tipo !== 'viagem');

  document.querySelectorAll('#horariosMobileContainer .dia-item').forEach((item, index) => {
    item.querySelector('.mobile-dynamic-title').textContent = tipo === 'viagem' ? `${index + 1} Dia` : 'Bate e Volta';
    item.querySelector('.dia-saida-label').textContent = index === 0 ? 'Saida da empresa' : 'Saida do Hotel';
    item.querySelector('.dia-chegada-label').textContent = index === 0 ? 'Chegada no Hotel' : 'Chegada no Hotel/Empresa';
  });
}

async function salvarAcompanhamento(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSalvarMobile');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
  const estavaEditando = Boolean(acompanhamentoEditandoId);

  try {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
    const payload = {
      data_acompanhamento: document.getElementById('mobileData').value,
      rota: document.getElementById('mobileRota').value.trim(),
      qtd_entregas: getNumeroOuNull('mobileQtdEntregas'),
      supervisor: document.getElementById('mobileSupervisor').value.trim() || null,
      tipo_rota: document.getElementById('mobileTipoRota').value,
      placa: document.getElementById('mobilePlaca').value.trim().toUpperCase(),
      motorista: document.getElementById('mobileMotorista').value.trim(),
      auxiliar: document.getElementById('mobileAuxiliar').value.trim() || null,
      terceiro: document.getElementById('mobileTerceiro').value.trim() || null,
      clientes: coletarClientes(),
      sugestao_roteiro: coletarSugestaoRoteiro(),
      horarios: coletarHorarios(),
      observacoes: document.getElementById('mobileObservacoes').value.trim() || null
    };

    if (!payload.clientes.length) throw new Error('Informe pelo menos um cliente.');
    if (!payload.horarios.length) throw new Error('Informe pelo menos um horario.');

    if (!estavaEditando) {
      payload.usuario_id = usuario.id || null;
      payload.usuario_nome = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
    }

    const { error } = estavaEditando
      ? await supabaseClient.from('fiscalizacao_acompanhamentos').update(payload).eq('id', acompanhamentoEditandoId)
      : await supabaseClient.from('fiscalizacao_acompanhamentos').insert([payload]);

    if (error) throw error;

    document.getElementById('mobileFiltroDataDe').value = payload.data_acompanhamento;
    document.getElementById('mobileFiltroDataAte').value = payload.data_acompanhamento;
    fecharModal();
    await carregarAcompanhamentos();
    registrarAuditoria(estavaEditando ? 'ALTERAR' : 'INCLUIR', 'Fiscalização Acompanhamento', `${estavaEditando ? 'Alteração' : 'Inclusão'} de acompanhamento via app mobile`);
    alert(estavaEditando ? 'Acompanhamento atualizado com sucesso!' : 'Acompanhamento registrado com sucesso!');
  } catch (error) {
    console.error('Erro ao salvar acompanhamento:', error);
    alert(`Erro ao salvar acompanhamento: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = estavaEditando
      ? '<i class="fas fa-save"></i> SALVAR ALTERACOES'
      : '<i class="fas fa-save"></i> SALVAR ACOMPANHAMENTO';
  }
}

function coletarClientes() {
  return coletarClientesDoContainer('clientesMobileContainer');
}

function coletarSugestaoRoteiro() {
  if (!document.getElementById('mobileHabilitarSugestaoRoteiro').checked) return [];
  return coletarClientesDoContainer('sugestaoClientesMobileContainer');
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
  const tipo = document.getElementById('mobileTipoRota').value;
  const horarios = [...document.querySelectorAll('#horariosMobileContainer .dia-item')].map((item, index) => ({
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
  return normalizarHorariosAcompanhamento(horarios);
}

async function carregarAcompanhamentos() {
  const container = document.getElementById('listaAcompanhamentosMobile');
  const dataDe = document.getElementById('mobileFiltroDataDe').value;
  const dataAte = document.getElementById('mobileFiltroDataAte').value;
  container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    let query = supabaseClient
      .from('fiscalizacao_acompanhamentos')
      .select('*')
      .order('created_at', { ascending: false });

    if (dataDe) query = query.gte('data_acompanhamento', dataDe);
    if (dataAte) query = query.lte('data_acompanhamento', dataAte);

    const { data: rows, error } = await query;
    if (error) throw error;

    acompanhamentos = rows || [];
    renderCards();
  } catch (error) {
    console.error('Erro ao carregar acompanhamentos:', error);
    container.innerHTML = '<div class="empty-state" style="color:#dc3545;">Erro ao carregar acompanhamentos.</div>';
  }
}

function renderCards() {
  const container = document.getElementById('listaAcompanhamentosMobile');
  const busca = document.getElementById('mobileBusca').value.trim().toUpperCase();

  const filtradas = acompanhamentos.filter(item => [
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
  ].some(valor => String(valor || '').toUpperCase().includes(busca)));

  document.getElementById('totalMobile').textContent = filtradas.length;

  if (!filtradas.length) {
    container.innerHTML = '<div class="empty-state">Nenhum acompanhamento encontrado.</div>';
    return;
  }

  container.innerHTML = filtradas.map(item => `
    <article class="ocorrencia-card" data-id="${escapeHtml(item.id)}">
      <div class="card-top">
        <h3>${escapeHtml(item.placa || 'Sem placa')}</h3>
        <span class="card-date">${formatarData(item.data_acompanhamento)}</span>
      </div>
      <div class="card-info">
        <span><i class="fas fa-route"></i><strong>Rota:</strong> ${escapeHtml(item.rota || '-')}</span>
        <span><i class="fas fa-user-shield"></i><strong>Supervisor:</strong> ${escapeHtml(item.supervisor || '-')}</span>
        <span><i class="fas fa-boxes-stacked"></i><strong>Entregas:</strong> ${escapeHtml(item.qtd_entregas ?? '-')}</span>
        <span><i class="fas fa-map-signs"></i><strong>Tipo:</strong> ${escapeHtml(formatarTipoRota(item.tipo_rota))}</span>
        <span><i class="fas fa-user-tie"></i><strong>Motorista:</strong> ${escapeHtml(item.motorista || '-')}</span>
        <span><i class="fas fa-user"></i><strong>Auxiliar:</strong> ${escapeHtml(item.auxiliar || '-')}</span>
      </div>
      <p class="card-report compact">${escapeHtml(resumoClientes(item.clientes))}</p>
      <p class="card-report compact">${escapeHtml(resumoHorarios(item.horarios))}</p>
      <div class="card-action-hint"><i class="fas fa-pen"></i> Tocar para editar</div>
    </article>
  `).join('');
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

function horarioTemDados(dia) {
  return [
    dia?.saida_empresa,
    dia?.saida_viagem,
    dia?.saida_hotel,
    dia?.cafe_de,
    dia?.cafe,
    dia?.cafe_ate,
    dia?.almoco_de,
    dia?.almoco,
    dia?.almoco_ate,
    dia?.finalizacao_entregas,
    dia?.chegada_empresa,
    dia?.chegada_viagem,
    dia?.chegada_hotel,
    dia?.chegada_hotel_empresa
  ].some(valor => String(valor || '').trim());
}

function normalizarHorariosAcompanhamento(horarios) {
  return normalizarArray(horarios)
    .filter(horarioTemDados)
    .sort((a, b) => (Number(a.dia) || 999) - (Number(b.dia) || 999))
    .map((dia, index) => ({
      ...dia,
      dia: index + 1,
      cafe_total_minutos: dia.cafe_total_minutos ?? calcularMinutos(dia.cafe_de || dia.cafe, dia.cafe_ate),
      almoco_total_minutos: dia.almoco_total_minutos ?? calcularMinutos(dia.almoco_de || dia.almoco, dia.almoco_ate)
    }));
}

function getNumeroOuNull(id) {
  const valor = document.getElementById(id).value;
  return valor === '' ? null : Number(valor);
}

function resumoClientes(clientes) {
  const lista = normalizarArray(clientes);
  if (!lista.length) return '-';
  return lista.map((cliente, index) => `${index + 1}. ${cliente.nome || '-'}${cliente.mercado_horario ? ' (horario)' : ''}`).join('\n');
}

function resumoHorarios(horarios) {
  const lista = normalizarHorariosAcompanhamento(horarios);
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

  const rota = document.getElementById('mobileRota').value.trim() || '-';
  const placa = document.getElementById('mobilePlaca').value.trim().toUpperCase() || '-';
  const motorista = document.getElementById('mobileMotorista').value.trim() || '-';
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
