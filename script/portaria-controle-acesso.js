import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';
import { configurarFiltroFilialUsuario } from './shared/filtro-filial-usuario.js';
import { normalizarFilial } from './shared/filial-utils.js';
import XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

let empresas = [];
let pessoas = [];
let setores = [];
let acessos = [];
let acessoEditandoId = null;
let acessoSaidaId = null;
let empresaEditandoId = null;
let pessoaEditandoId = null;
let setorEditandoId = null;
let modalRetornoCadastro = null;
const niveisComExclusao = ['administrador', 'gerencia'];
const ordenacaoAcessos = { campo: null, ascendente: true };
const CAMPOS_DATA_ACESSOS = new Set(['created_at', 'entrada_em', 'saida_em']);

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date();
  document.getElementById('filtroDataDe').valueAsDate = hoje;
  document.getElementById('filtroDataAte').valueAsDate = hoje;

  bindEvents();
  await configurarFiliaisPortaria();
  await carregarCadastros();
  await buscarAcessos();
});

function bindEvents() {
  configurarCamposMaiusculos();
  document.getElementById('btnNovoAcesso').addEventListener('click', () => abrirModalAcesso());
  document.getElementById('btnBuscarAcessos').addEventListener('click', buscarAcessos);
  document.getElementById('filtroBusca').addEventListener('input', renderizarTabela);
  document.getElementById('filtroGridEmpresaPlaca').addEventListener('input', renderizarTabela);
  document.getElementById('filtroStatus').addEventListener('change', buscarAcessos);
  document.getElementById('filtroFilial').addEventListener('change', async () => {
    sincronizarFilialPadrao();
    await carregarCadastros();
    await buscarAcessos();
  });
  document.getElementById('formAcesso').addEventListener('submit', salvarAcesso);
  document.getElementById('formSaidaAcesso').addEventListener('submit', confirmarSaidaAcesso);
  document.getElementById('formEmpresa').addEventListener('submit', salvarEmpresa);
  document.getElementById('formPessoa').addEventListener('submit', salvarPessoa);
  document.getElementById('formSetor').addEventListener('submit', salvarSetor);
  document.getElementById('btnFecharAcesso').addEventListener('click', fecharModalAcesso);
  document.getElementById('btnCancelarAcesso').addEventListener('click', fecharModalAcesso);
  document.getElementById('btnFecharSaidaAcesso').addEventListener('click', fecharModalSaidaAcesso);
  document.getElementById('btnCancelarSaidaAcesso').addEventListener('click', fecharModalSaidaAcesso);
  document.getElementById('saidaPlacaVeiculo').addEventListener('input', atualizarResumoSaida);
  document.getElementById('saidaCarretaCacamba').addEventListener('input', atualizarResumoSaida);
  document.getElementById('btnCadastroEmpresa').addEventListener('click', () => abrirModalCadastro('modalEmpresa'));
  document.getElementById('btnCadastroPessoa').addEventListener('click', () => abrirModalCadastro('modalPessoa'));
  document.getElementById('btnCadastroSetor').addEventListener('click', () => abrirModalCadastro('modalSetor'));
  document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
  document.getElementById('btnExportarXLSX').addEventListener('click', exportarXLSX);
  document.getElementById('btnExportarGridPDF').addEventListener('click', exportarPDF);
  document.getElementById('btnExportarGridXLSX').addEventListener('click', exportarXLSX);
  document.getElementById('btnToggleMenuLateralPortaria')?.addEventListener('click', toggleMenuLateral);
  document.getElementById('btnAbrirEmpresaNoAcesso').addEventListener('click', () => abrirModalCadastro('modalEmpresa', 'modalAcesso'));
  document.getElementById('btnAbrirPessoaNoAcesso').addEventListener('click', () => abrirModalCadastro('modalPessoa', 'modalAcesso'));
  document.getElementById('btnAbrirSetorNoAcesso').addEventListener('click', () => abrirModalCadastro('modalSetor', 'modalAcesso'));
  document.getElementById('acessoEmpresa').addEventListener('change', preencherDadosEmpresa);
  document.getElementById('acessoPessoa').addEventListener('change', preencherDadosPessoa);
  document.getElementById('acessoDocumentoPessoa').addEventListener('input', preencherDadosPessoaPorDocumento);
  document.getElementById('buscaEmpresaCadastro').addEventListener('input', renderBuscaEmpresaCadastro);
  document.getElementById('buscaPessoaCadastro').addEventListener('input', renderBuscaPessoaCadastro);
  document.getElementById('buscaSetorCadastro').addEventListener('input', renderBuscaSetorCadastro);
  document.getElementById('btnBuscarEmpresasCadastro').addEventListener('click', () => renderGridCadastro('empresa'));
  document.getElementById('btnBuscarPessoasCadastro').addEventListener('click', () => renderGridCadastro('pessoa'));
  document.getElementById('btnBuscarSetoresCadastro').addEventListener('click', () => renderGridCadastro('setor'));
  document.getElementById('resultadoBuscaEmpresa').addEventListener('click', handleResultadoCadastroClick);
  document.getElementById('resultadoBuscaPessoa').addEventListener('click', handleResultadoCadastroClick);
  document.getElementById('resultadoBuscaSetor').addEventListener('click', handleResultadoCadastroClick);
  document.getElementById('gridEmpresasCadastro').addEventListener('click', handleGridCadastroClick);
  document.getElementById('gridPessoasCadastro').addEventListener('click', handleGridCadastroClick);
  document.getElementById('gridSetoresCadastro').addEventListener('click', handleGridCadastroClick);
  document.getElementById('tbodyAcessos').addEventListener('click', handleTabelaClick);
  document.querySelectorAll('table.data-grid thead th.sortable').forEach(th => {
    th.addEventListener('click', () => ordenarAcessosPor(th.dataset.sort));
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => fecharModalCadastro(btn.dataset.closeModal));
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target !== modal) return;
      if (modal.id === 'modalAcesso' || modal.id === 'modalSaidaAcesso') return;
      fecharModalCadastro(modal.id);
    });
  });
}

async function configurarFiliaisPortaria() {
  const filtroFilial = document.getElementById('filtroFilial');
  await configurarFiltroFilialUsuario(filtroFilial);
  sincronizarFilialPadrao();
}

function sincronizarFilialPadrao() {
  const filtro = document.getElementById('filtroFilial');
  const selects = ['acessoFilial', 'empresaFilial', 'pessoaFilial', 'setorFilial']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  selects.forEach(select => {
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecione a filial</option>';
    Array.from(filtro?.options || [])
      .filter(option => option.value)
      .forEach(option => select.add(new Option(option.textContent, option.value)));
    select.value = valorAtual && Array.from(select.options).some(option => option.value === valorAtual)
      ? valorAtual
      : (filtro?.value || '');
    select.disabled = Boolean(filtro?.disabled && filtro.value);
  });
}

function getFilialFiltro() {
  return normalizarFilial(document.getElementById('filtroFilial')?.value);
}

function getFilialDoCadastro(tipo) {
  const ids = {
    empresa: 'empresaFilial',
    pessoa: 'pessoaFilial',
    setor: 'setorFilial',
    acesso: 'acessoFilial'
  };
  return normalizarFilial(document.getElementById(ids[tipo])?.value || getFilialFiltro());
}

function configurarCamposMaiusculos() {
  document.querySelectorAll('#acessoProdutoServico, #acessoObservacoes, #formEmpresa input[type="text"], #formEmpresa textarea, #formPessoa input[type="text"], #formPessoa textarea, #formSetor input[type="text"], #formSetor textarea')
    .forEach(campo => {
      campo.addEventListener('input', () => {
        const inicioSelecao = campo.selectionStart;
        const fimSelecao = campo.selectionEnd;
        campo.value = String(campo.value || '').toLocaleUpperCase('pt-BR');
        campo.setSelectionRange?.(inicioSelecao, fimSelecao);
      });
    });
}

function textoMaiusculo(valor) {
  return String(valor || '').trim().toLocaleUpperCase('pt-BR');
}

function toggleMenuLateral() {
  document.body.classList.toggle('portaria-menu-oculto');
  const oculto = document.body.classList.contains('portaria-menu-oculto');
  const btn = document.getElementById('btnToggleMenuLateralPortaria');
  if (!btn) return;
  const titulo = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
}

async function carregarCadastros() {
  const [empresasRes, pessoasRes, setoresRes] = await Promise.all([
    supabaseClient.from('portaria_empresas').select('*').order('nome'),
    supabaseClient.from('portaria_pessoas').select('*').order('nome'),
    supabaseClient.from('portaria_setores').select('*').order('nome')
  ]);

  if (empresasRes.error) console.error('Erro ao carregar empresas:', empresasRes.error);
  if (pessoasRes.error) console.error('Erro ao carregar pessoas:', pessoasRes.error);
  if (setoresRes.error) console.error('Erro ao carregar setores:', setoresRes.error);

  const filial = getFilialFiltro();
  empresas = filtrarPorFilial(empresasRes.data || [], filial);
  pessoas = filtrarPorFilial(pessoasRes.data || [], filial);
  setores = filtrarPorFilial(setoresRes.data || [], filial);

  preencherDatalist('listaEmpresasPortaria', empresas.map(formatarEmpresaOpcao));
  preencherDatalist('listaPessoasPortaria', pessoas.map(formatarPessoaOpcao));
  preencherDatalist('listaSetoresPortaria', setores.map(setor => setor.nome));
}

function filtrarPorFilial(lista, filial) {
  if (!filial) return lista;
  return lista.filter(item => !normalizarFilial(item.filial) || normalizarFilial(item.filial) === filial);
}

function preencherDatalist(id, valores) {
  const datalist = document.getElementById(id);
  datalist.innerHTML = '';
  [...new Set(valores.filter(Boolean))].forEach(valor => {
    const option = document.createElement('option');
    option.value = valor;
    datalist.appendChild(option);
  });
}

function formatarEmpresaOpcao(empresa) {
  return [empresa.nome, empresa.documento].filter(Boolean).join(' - ');
}

function formatarPessoaOpcao(pessoa) {
  return [pessoa.nome, pessoa.documento].filter(Boolean).join(' - ');
}

function normalizarBusca(valor) {
  return String(valor || '').trim().toUpperCase();
}

function encontrarEmpresa(valor) {
  const busca = normalizarBusca(valor);
  const filial = getFilialContextoSelecao();
  return empresas.find(empresa => itemCompativelComFilial(empresa, filial) && (
    normalizarBusca(formatarEmpresaOpcao(empresa)) === busca ||
    normalizarBusca(empresa.nome) === busca ||
    normalizarBusca(empresa.documento) === busca
  ));
}

function encontrarPessoa(valor) {
  const busca = normalizarBusca(valor);
  const filial = getFilialContextoSelecao();
  return pessoas.find(pessoa => itemCompativelComFilial(pessoa, filial) && (
    normalizarBusca(formatarPessoaOpcao(pessoa)) === busca ||
    normalizarBusca(pessoa.nome) === busca ||
    normalizarBusca(pessoa.documento) === busca
  ));
}

function normalizarDocumento(valor) {
  return normalizarBusca(valor).replace(/[^A-Z0-9]/g, '');
}

function encontrarPessoaPorDocumento(valor) {
  const documento = normalizarDocumento(valor);
  if (!documento) return null;
  const filial = getFilialContextoSelecao();
  return pessoas.find(pessoa => itemCompativelComFilial(pessoa, filial) && normalizarDocumento(pessoa.documento) === documento) || null;
}

function encontrarSetor(valor) {
  const busca = normalizarBusca(valor);
  const filial = getFilialContextoSelecao();
  return setores.find(setor => itemCompativelComFilial(setor, filial) && normalizarBusca(setor.nome) === busca);
}

function getFilialContextoSelecao() {
  return normalizarFilial(document.getElementById('acessoFilial')?.value || getFilialFiltro());
}

function itemCompativelComFilial(item, filial) {
  const filialItem = normalizarFilial(item?.filial);
  return !filial || !filialItem || filialItem === filial;
}

function abrirModalAcesso(item = null) {
  modalRetornoCadastro = null;
  esconderTodosModais();
  document.getElementById('formAcesso').reset();
  acessoEditandoId = item?.id || null;
  document.querySelector('#modalAcesso .modal-header h3').textContent = acessoEditandoId ? 'Editar Acesso' : 'Controle de Acesso';
  document.getElementById('acessoFilial').value = normalizarFilial(item?.filial) || getFilialFiltro();
  document.getElementById('acessoEmpresa').value = item ? [item.empresa_nome, item.empresa_documento].filter(Boolean).join(' - ') : '';
  document.getElementById('acessoPessoa').value = item ? [item.pessoa_nome, item.pessoa_documento].filter(Boolean).join(' - ') : '';
  document.getElementById('acessoDocumentoPessoa').value = item?.pessoa_documento || '';
  document.getElementById('acessoPlacaVeiculo').value = item?.placa_veiculo || '';
  document.getElementById('acessoCarretaCacamba').value = item?.carreta_cacamba || '';
  document.getElementById('acessoSetor').value = item?.setor_nome || '';
  document.getElementById('acessoProdutoServico').value = item?.produto_servico || '';
  document.getElementById('acessoObservacoes').value = item?.observacoes || '';
  document.getElementById('modalAcesso').classList.remove('hidden');
  document.getElementById('acessoDocumentoPessoa').focus();
}

function fecharModalAcesso() {
  acessoEditandoId = null;
  modalRetornoCadastro = null;
  document.getElementById('modalAcesso').classList.add('hidden');
}

function abrirModalCadastro(id, modalRetorno = null) {
  modalRetornoCadastro = modalRetorno;
  esconderTodosModais();
  const modal = document.getElementById(id);
  modal.querySelector('form')?.reset();
  limparResultadosCadastro(id);
  if (id === 'modalEmpresa') empresaEditandoId = null;
  if (id === 'modalPessoa') pessoaEditandoId = null;
  if (id === 'modalSetor') setorEditandoId = null;
  if (id === 'modalEmpresa') document.getElementById('empresaFilial').value = getFilialFiltro();
  if (id === 'modalPessoa') document.getElementById('pessoaFilial').value = getFilialFiltro();
  if (id === 'modalSetor') document.getElementById('setorFilial').value = getFilialFiltro();
  if (id === 'modalEmpresa') document.getElementById('empresaNome').value = document.getElementById('acessoEmpresa').value.split(' - ')[0] || '';
  if (id === 'modalPessoa') document.getElementById('pessoaNome').value = document.getElementById('acessoPessoa').value.split(' - ')[0] || '';
  if (id === 'modalSetor') document.getElementById('setorNome').value = document.getElementById('acessoSetor').value || '';
  modal.classList.remove('hidden');
}

function fecharModalCadastro(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'modalEmpresa') empresaEditandoId = null;
  if (id === 'modalPessoa') pessoaEditandoId = null;
  if (id === 'modalSetor') setorEditandoId = null;
  if (modalRetornoCadastro) {
    document.getElementById(modalRetornoCadastro)?.classList.remove('hidden');
    modalRetornoCadastro = null;
  }
}

function esconderTodosModais() {
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden'));
}

function abrirModalSaidaAcesso(item) {
  acessoSaidaId = item.id;
  const placaEntrada = item.placa_entrada || item.placa_veiculo || '';
  const carretaEntrada = item.carreta_cacamba_entrada || item.carreta_cacamba || '';
  document.getElementById('saidaPlacaVeiculo').value = placaEntrada;
  document.getElementById('saidaCarretaCacamba').value = carretaEntrada;
  document.getElementById('modalSaidaAcesso').classList.remove('hidden');
  atualizarResumoSaida();
  document.getElementById('saidaPlacaVeiculo').focus();
}

function fecharModalSaidaAcesso() {
  acessoSaidaId = null;
  document.getElementById('modalSaidaAcesso').classList.add('hidden');
}

function atualizarResumoSaida() {
  const item = acessos.find(acesso => acesso.id === acessoSaidaId);
  if (!item) return;
  const placaEntrada = normalizarBusca(item.placa_entrada || item.placa_veiculo);
  const carretaEntrada = normalizarBusca(item.carreta_cacamba_entrada || item.carreta_cacamba);
  const placaSaida = normalizarBusca(document.getElementById('saidaPlacaVeiculo').value);
  const carretaSaida = normalizarBusca(document.getElementById('saidaCarretaCacamba').value);
  const divergente = placaEntrada !== placaSaida || carretaEntrada !== carretaSaida;
  const resumo = document.getElementById('resumoEntradaSaida');
  resumo.classList.toggle('divergente', divergente);
  resumo.innerHTML = `
    <strong>Entrada:</strong> Cavalo ${escapeHtml(placaEntrada || '-')} | Carreta/Cacamba ${escapeHtml(carretaEntrada || '-')}<br>
    <strong>Saida:</strong> Cavalo ${escapeHtml(placaSaida || '-')} | Carreta/Cacamba ${escapeHtml(carretaSaida || '-')}<br>
    <strong>Conferencia:</strong> ${divergente ? 'DIVERGENCIA IDENTIFICADA' : 'SEM DIVERGENCIA'}
  `;
}

async function confirmarSaidaAcesso(event) {
  event.preventDefault();
  const item = acessos.find(acesso => acesso.id === acessoSaidaId);
  if (!item) return;
  const payload = {
    status: 'saida',
    saida_em: new Date().toISOString(),
    placa_saida: textoMaiusculo(document.getElementById('saidaPlacaVeiculo').value) || null,
    carreta_cacamba_saida: textoMaiusculo(document.getElementById('saidaCarretaCacamba').value) || null
  };
  const { error } = await supabaseClient.from('portaria_acessos').update(payload).eq('id', item.id);
  if (error) return alert(`Erro ao registrar saida: ${error.message}`);
  registrarAuditoria('ALTERAR', 'Portaria', `Saída registrada: ${item.pessoa_nome || '-'} / ${item.empresa_nome || '-'}`);
  fecharModalSaidaAcesso();
  await buscarAcessos();
}

function preencherDadosEmpresa() {
  const empresa = encontrarEmpresa(document.getElementById('acessoEmpresa').value);
  if (empresa) document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(empresa);
}

function preencherDadosPessoa() {
  const pessoa = encontrarPessoa(document.getElementById('acessoPessoa').value);
  if (!pessoa) return;
  preencherDadosPessoaSelecionada(pessoa);
}

function preencherDadosPessoaPorDocumento() {
  const pessoa = encontrarPessoaPorDocumento(document.getElementById('acessoDocumentoPessoa').value);
  if (!pessoa) return;
  preencherDadosPessoaSelecionada(pessoa);
}

function preencherDadosPessoaSelecionada(pessoa) {
  document.getElementById('acessoPessoa').value = formatarPessoaOpcao(pessoa);
  document.getElementById('acessoDocumentoPessoa').value = pessoa.documento || '';
  const empresa = empresas.find(item => String(item.id) === String(pessoa.empresa_id))
    || encontrarEmpresa(pessoa.empresa_nome);
  document.getElementById('acessoEmpresa').value = empresa
    ? formatarEmpresaOpcao(empresa)
    : pessoa.empresa_nome || '';
}

function limparResultadosCadastro(modalId) {
  const mapa = {
    modalEmpresa: ['buscaEmpresaCadastro', 'resultadoBuscaEmpresa', 'gridEmpresasCadastro'],
    modalPessoa: ['buscaPessoaCadastro', 'resultadoBuscaPessoa', 'gridPessoasCadastro'],
    modalSetor: ['buscaSetorCadastro', 'resultadoBuscaSetor', 'gridSetoresCadastro']
  };
  const ids = mapa[modalId] || [];
  if (ids[0]) document.getElementById(ids[0]).value = '';
  if (ids[1]) document.getElementById(ids[1]).innerHTML = '';
  if (ids[2]) document.getElementById(ids[2]).innerHTML = '<tr><td colspan="5">Clique em Buscar para listar os cadastros.</td></tr>';
}

function filtrarPorTermo(lista, termo, campos) {
  const busca = normalizarBusca(termo);
  if (!busca) return [];
  return lista
    .filter(item => campos.some(campo => normalizarBusca(item[campo]).includes(busca)))
    .slice(0, 8);
}

function renderBuscaEmpresaCadastro() {
  const termo = document.getElementById('buscaEmpresaCadastro').value;
  const resultados = filtrarPorTermo(empresas, termo, ['nome', 'documento', 'telefone']);
  renderResultadosCadastro('resultadoBuscaEmpresa', resultados, 'empresa');
}

function renderBuscaPessoaCadastro() {
  const termo = document.getElementById('buscaPessoaCadastro').value;
  const resultados = filtrarPorTermo(pessoas, termo, ['nome', 'documento', 'telefone', 'empresa_nome']);
  renderResultadosCadastro('resultadoBuscaPessoa', resultados, 'pessoa');
}

function renderBuscaSetorCadastro() {
  const termo = document.getElementById('buscaSetorCadastro').value;
  const resultados = filtrarPorTermo(setores, termo, ['nome', 'responsavel', 'ramal']);
  renderResultadosCadastro('resultadoBuscaSetor', resultados, 'setor');
}

function renderResultadosCadastro(containerId, resultados, tipo) {
  const container = document.getElementById(containerId);
  if (!resultados.length) {
    container.innerHTML = '<div class="cadastro-search-empty">Nenhum cadastro encontrado.</div>';
    return;
  }

  container.innerHTML = resultados.map(item => {
    const titulo = item.nome || '-';
    const detalhe = tipo === 'setor'
      ? [item.responsavel, item.ramal].filter(Boolean).join(' - ')
      : [item.documento, item.telefone, item.empresa_nome].filter(Boolean).join(' - ');
    return `
      <button type="button" class="cadastro-search-item" data-cadastro-tipo="${tipo}" data-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(titulo)}</strong>
        <span>${escapeHtml(detalhe || 'Selecionar')}</span>
      </button>
    `;
  }).join('');
}

function handleResultadoCadastroClick(event) {
  const button = event.target.closest('[data-cadastro-tipo]');
  if (!button) return;
  const tipo = button.dataset.cadastroTipo;
  selecionarCadastro(tipo, button.dataset.id);
}

function selecionarCadastro(tipo, id) {
  if (!id) return;

  if (tipo === 'empresa') {
    const empresa = empresas.find(item => item.id === id);
    if (!empresa) return;
    preencherFormularioEmpresa(empresa);
    document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(empresa);
  }

  if (tipo === 'pessoa') {
    const pessoa = pessoas.find(item => item.id === id);
    if (!pessoa) return;
    preencherFormularioPessoa(pessoa);
    preencherDadosPessoaSelecionada(pessoa);
  }

  if (tipo === 'setor') {
    const setor = setores.find(item => item.id === id);
    if (!setor) return;
    preencherFormularioSetor(setor);
    document.getElementById('acessoSetor').value = setor.nome || '';
  }
}

function renderGridCadastro(tipo) {
  const config = getCadastroConfig(tipo);
  if (!config) return;

  const termo = normalizarBusca(document.getElementById(config.buscaId).value);
  const dados = config.lista.filter(item => !termo || config.campos.some(campo => normalizarBusca(item[campo]).includes(termo)));
  const tbody = document.getElementById(config.gridId);

  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum cadastro encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(item => {
    const colunas = config.colunas.map(campo => `<td>${escapeHtml(item[campo] || '-')}</td>`).join('');
    return `
      <tr>
        ${colunas}
        <td>
          <button type="button" class="btn-grid-action btn-edit" data-cadastro-action="selecionar" data-cadastro-tipo="${tipo}" data-id="${escapeHtml(item.id)}" title="Selecionar"><i class="fas fa-check"></i></button>
          ${usuarioAdministrador() ? `<button type="button" class="btn-grid-action btn-delete" data-cadastro-action="excluir" data-cadastro-tipo="${tipo}" data-id="${escapeHtml(item.id)}" title="Excluir cadastro"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function handleGridCadastroClick(event) {
  const button = event.target.closest('[data-cadastro-action]');
  if (!button) return;

  const tipo = button.dataset.cadastroTipo;
  const id = button.dataset.id;

  if (button.dataset.cadastroAction === 'selecionar') {
    selecionarCadastro(tipo, id);
    return;
  }

  if (button.dataset.cadastroAction === 'excluir') {
    await excluirCadastro(tipo, id);
  }
}

function getCadastroConfig(tipo) {
  const configs = {
    empresa: {
      lista: empresas,
      tabela: 'portaria_empresas',
      buscaId: 'buscaEmpresaCadastro',
      gridId: 'gridEmpresasCadastro',
      campos: ['nome', 'filial', 'documento', 'telefone'],
      colunas: ['nome', 'filial', 'documento', 'telefone'],
      label: 'empresa'
    },
    pessoa: {
      lista: pessoas,
      tabela: 'portaria_pessoas',
      buscaId: 'buscaPessoaCadastro',
      gridId: 'gridPessoasCadastro',
      campos: ['nome', 'filial', 'documento', 'telefone', 'empresa_nome'],
      colunas: ['nome', 'filial', 'documento', 'empresa_nome'],
      label: 'pessoa'
    },
    setor: {
      lista: setores,
      tabela: 'portaria_setores',
      buscaId: 'buscaSetorCadastro',
      gridId: 'gridSetoresCadastro',
      campos: ['nome', 'filial', 'responsavel', 'ramal'],
      colunas: ['nome', 'filial', 'responsavel', 'ramal'],
      label: 'setor'
    }
  };
  return configs[tipo] || null;
}

async function excluirCadastro(tipo, id) {
  if (!usuarioAdministrador()) {
    alert('Somente administrador pode excluir cadastros.');
    return;
  }

  const config = getCadastroConfig(tipo);
  const item = config?.lista.find(cadastro => cadastro.id === id);
  if (!config || !item) return;
  if (!confirm(`Deseja excluir o cadastro de ${item.nome || config.label}?`)) return;

  const { error } = await supabaseClient.from(config.tabela).delete().eq('id', id);
  if (error) return alert(`Erro ao excluir ${config.label}: ${error.message}`);

  const labelCapitalizado = config.label.charAt(0).toUpperCase() + config.label.slice(1);
  registrarAuditoria('EXCLUIR', `Portaria ${labelCapitalizado}`, `${labelCapitalizado} excluído: ${item.nome || '-'}`);
  await carregarCadastros();
  renderGridCadastro(tipo);
}

function preencherFormularioEmpresa(empresa) {
  empresaEditandoId = empresa?.id || null;
  document.getElementById('empresaNome').value = empresa.nome || '';
  document.getElementById('empresaFilial').value = normalizarFilial(empresa.filial) || getFilialFiltro();
  document.getElementById('empresaDocumento').value = empresa.documento || '';
  document.getElementById('empresaTelefone').value = empresa.telefone || '';
  document.getElementById('empresaObservacoes').value = empresa.observacoes || '';
}

function preencherFormularioPessoa(pessoa) {
  pessoaEditandoId = pessoa?.id || null;
  document.getElementById('pessoaNome').value = pessoa.nome || '';
  document.getElementById('pessoaFilial').value = normalizarFilial(pessoa.filial) || getFilialFiltro();
  document.getElementById('pessoaDocumento').value = pessoa.documento || '';
  document.getElementById('pessoaTelefone').value = pessoa.telefone || '';
  document.getElementById('pessoaEmpresa').value = pessoa.empresa_nome || '';
}

function preencherFormularioSetor(setor) {
  setorEditandoId = setor?.id || null;
  document.getElementById('setorNome').value = setor.nome || '';
  document.getElementById('setorFilial').value = normalizarFilial(setor.filial) || getFilialFiltro();
  document.getElementById('setorResponsavel').value = setor.responsavel || '';
  document.getElementById('setorRamal').value = setor.ramal || '';
}

async function salvarAcesso(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSalvarAcesso');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const estavaEditando = Boolean(acessoEditandoId);
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
    const empresa = encontrarEmpresa(document.getElementById('acessoEmpresa').value);
    const pessoa = encontrarPessoa(document.getElementById('acessoPessoa').value);
    const setor = encontrarSetor(document.getElementById('acessoSetor').value);

    const empresaValor = document.getElementById('acessoEmpresa').value.trim();
    const pessoaValor = document.getElementById('acessoPessoa').value.trim();
    const filial = getFilialDoCadastro('acesso');
    if (!filial) throw new Error('Selecione a filial do acesso.');
    const payload = {
      filial,
      empresa_id: empresa?.id || null,
      pessoa_id: pessoa?.id || null,
      setor_id: setor?.id || null,
      empresa_nome: empresa?.nome || empresaValor.split(' - ')[0] || empresaValor,
      empresa_documento: empresa?.documento || extrairDocumento(empresaValor),
      pessoa_nome: pessoa?.nome || pessoaValor.split(' - ')[0] || pessoaValor,
      pessoa_documento: document.getElementById('acessoDocumentoPessoa').value.trim() || pessoa?.documento || extrairDocumento(pessoaValor),
      placa_veiculo: document.getElementById('acessoPlacaVeiculo').value.trim().toUpperCase() || null,
      carreta_cacamba: document.getElementById('acessoCarretaCacamba').value.trim().toUpperCase() || null,
      setor_nome: setor?.nome || document.getElementById('acessoSetor').value.trim(),
      produto_servico: textoMaiusculo(document.getElementById('acessoProdutoServico').value) || null,
      observacoes: textoMaiusculo(document.getElementById('acessoObservacoes').value) || null
    };

    if (!acessoEditandoId) {
      payload.status = 'aguardando';
      payload.usuario_id = usuario.id || null;
      payload.usuario_nome = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
    }

    const { error } = estavaEditando
      ? await supabaseClient.from('portaria_acessos').update(payload).eq('id', acessoEditandoId)
      : await supabaseClient.from('portaria_acessos').insert([payload]);

    if (error) throw error;
    registrarAuditoria(
      estavaEditando ? 'ALTERAR' : 'INCLUIR',
      'Portaria',
      `${estavaEditando ? 'Acesso editado' : 'Novo acesso'}: ${payload.pessoa_nome || '-'} / ${payload.empresa_nome || '-'}`
    );
    fecharModalAcesso();
    await buscarAcessos();
    alert(estavaEditando ? 'Acesso atualizado com sucesso!' : 'Acesso registrado com sucesso!');
  } catch (error) {
    console.error('Erro ao salvar acesso:', error);
    alert(`Erro ao salvar acesso: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

function extrairDocumento(valor) {
  const partes = String(valor || '').split(' - ');
  return partes.length > 1 ? partes.at(-1).trim() : null;
}

async function salvarEmpresa(event) {
  event.preventDefault();
  const estavaEditando = Boolean(empresaEditandoId);
  const payload = {
    filial: getFilialDoCadastro('empresa'),
    nome: textoMaiusculo(document.getElementById('empresaNome').value),
    documento: textoMaiusculo(document.getElementById('empresaDocumento').value) || null,
    telefone: textoMaiusculo(document.getElementById('empresaTelefone').value) || null,
    observacoes: textoMaiusculo(document.getElementById('empresaObservacoes').value) || null
  };
  if (!payload.filial) return alert('Selecione a filial da empresa.');
  const existente = empresas.find(item =>
    String(item.id) !== String(empresaEditandoId || '') &&
    normalizarFilial(item.filial) === payload.filial && (
      (payload.documento && normalizarBusca(item.documento) === normalizarBusca(payload.documento)) ||
      normalizarBusca(item.nome) === normalizarBusca(payload.nome)
    )
  );
  if (existente) {
    alert('Ja existe outra empresa cadastrada com este nome/documento nesta filial. O cadastro existente foi selecionado.');
    document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(existente);
    preencherFormularioEmpresa(existente);
    return;
  }
  const { error } = estavaEditando
    ? await supabaseClient.from('portaria_empresas').update(payload).eq('id', empresaEditandoId)
    : await supabaseClient.from('portaria_empresas').insert([payload]);
  if (error) return alert(`Erro ao salvar empresa: ${error.message}`);

  if (estavaEditando) {
    const [{ error: pessoasError }, { error: acessosError }] = await Promise.all([
      supabaseClient
        .from('portaria_pessoas')
        .update({ empresa_nome: payload.nome })
        .eq('empresa_id', empresaEditandoId),
      supabaseClient
        .from('portaria_acessos')
        .update({ empresa_nome: payload.nome, empresa_documento: payload.documento })
        .eq('empresa_id', empresaEditandoId)
    ]);
    if (pessoasError) console.warn('Empresa atualizada, mas pessoas vinculadas nao foram sincronizadas:', pessoasError);
    if (acessosError) console.warn('Empresa atualizada, mas acessos anteriores nao foram sincronizados:', acessosError);
  }

  registrarAuditoria(
    estavaEditando ? 'ALTERAR' : 'INCLUIR',
    'Portaria Empresa',
    `${estavaEditando ? 'Empresa atualizada' : 'Empresa cadastrada'}: ${payload.nome}`
  );
  fecharModalCadastro('modalEmpresa');
  await carregarCadastros();
  document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(payload);
}

async function salvarPessoa(event) {
  event.preventDefault();
  const estavaEditando = Boolean(pessoaEditandoId);
  const empresa = encontrarEmpresa(document.getElementById('pessoaEmpresa').value);
  const payload = {
    filial: getFilialDoCadastro('pessoa'),
    nome: textoMaiusculo(document.getElementById('pessoaNome').value),
    documento: textoMaiusculo(document.getElementById('pessoaDocumento').value) || null,
    telefone: textoMaiusculo(document.getElementById('pessoaTelefone').value) || null,
    empresa_id: empresa?.id || null,
    empresa_nome: empresa?.nome || textoMaiusculo(document.getElementById('pessoaEmpresa').value) || null
  };
  if (!payload.filial) return alert('Selecione a filial da pessoa.');
  const existente = pessoas.find(item =>
    String(item.id) !== String(pessoaEditandoId || '') &&
    normalizarFilial(item.filial) === payload.filial && (
      (payload.documento && normalizarBusca(item.documento) === normalizarBusca(payload.documento)) ||
      normalizarBusca(item.nome) === normalizarBusca(payload.nome)
    )
  );
  if (existente) {
    alert('Ja existe outra pessoa cadastrada com este nome/documento nesta filial. O cadastro existente foi selecionado.');
    document.getElementById('acessoPessoa').value = formatarPessoaOpcao(existente);
    document.getElementById('acessoDocumentoPessoa').value = existente.documento || '';
    preencherFormularioPessoa(existente);
    return;
  }
  const { error } = estavaEditando
    ? await supabaseClient.from('portaria_pessoas').update(payload).eq('id', pessoaEditandoId)
    : await supabaseClient.from('portaria_pessoas').insert([payload]);
  if (error) return alert(`Erro ao salvar pessoa: ${error.message}`);

  if (estavaEditando) {
    const { error: acessosError } = await supabaseClient
      .from('portaria_acessos')
      .update({ pessoa_nome: payload.nome, pessoa_documento: payload.documento })
      .eq('pessoa_id', pessoaEditandoId);
    if (acessosError) console.warn('Pessoa atualizada, mas acessos anteriores nao foram sincronizados:', acessosError);
  }

  registrarAuditoria(
    estavaEditando ? 'ALTERAR' : 'INCLUIR',
    'Portaria Pessoa',
    `${estavaEditando ? 'Pessoa atualizada' : 'Pessoa cadastrada'}: ${payload.nome}`
  );
  fecharModalCadastro('modalPessoa');
  await carregarCadastros();
  document.getElementById('acessoPessoa').value = formatarPessoaOpcao(payload);
  document.getElementById('acessoDocumentoPessoa').value = payload.documento || '';
}

async function salvarSetor(event) {
  event.preventDefault();
  const estavaEditando = Boolean(setorEditandoId);
  const payload = {
    filial: getFilialDoCadastro('setor'),
    nome: textoMaiusculo(document.getElementById('setorNome').value),
    responsavel: textoMaiusculo(document.getElementById('setorResponsavel').value) || null,
    ramal: textoMaiusculo(document.getElementById('setorRamal').value) || null
  };
  if (!payload.filial) return alert('Selecione a filial do setor.');
  const existente = setores.find(item =>
    String(item.id) !== String(setorEditandoId || '') &&
    normalizarFilial(item.filial) === payload.filial &&
    normalizarBusca(item.nome) === normalizarBusca(payload.nome)
  );
  if (existente) {
    alert('Ja existe outro setor cadastrado com este nome nesta filial. O cadastro existente foi selecionado.');
    document.getElementById('acessoSetor').value = existente.nome || '';
    preencherFormularioSetor(existente);
    return;
  }
  const { error } = estavaEditando
    ? await supabaseClient.from('portaria_setores').update(payload).eq('id', setorEditandoId)
    : await supabaseClient.from('portaria_setores').insert([payload]);
  if (error) return alert(`Erro ao salvar setor: ${error.message}`);

  if (estavaEditando) {
    const { error: acessoError } = await supabaseClient
      .from('portaria_acessos')
      .update({ setor_nome: payload.nome })
      .eq('setor_id', setorEditandoId);
    if (acessoError) console.warn('Setor atualizado, mas acessos anteriores nao foram sincronizados:', acessoError);
  }

  registrarAuditoria(
    estavaEditando ? 'ALTERAR' : 'INCLUIR',
    'Portaria Setor',
    `${estavaEditando ? 'Setor atualizado' : 'Setor cadastrado'}: ${payload.nome}`
  );
  fecharModalCadastro('modalSetor');
  await carregarCadastros();
  document.getElementById('acessoSetor').value = payload.nome;
}

async function buscarAcessos() {
  const dataDe = document.getElementById('filtroDataDe').value;
  const dataAte = document.getElementById('filtroDataAte').value;
  const status = document.getElementById('filtroStatus').value;
  const filial = getFilialFiltro();

  let query = supabaseClient.from('portaria_acessos').select('*');
  if (dataDe) query = query.gte('created_at', `${dataDe}T00:00:00`);
  if (dataAte) query = query.lte('created_at', `${dataAte}T23:59:59`);
  if (status) query = query.eq('status', status);
  if (filial) query = query.eq('filial', filial);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return alert(`Erro ao buscar acessos: ${error.message}`);
  acessos = data || [];
  renderizarTabela();
}

function ordenarAcessosPor(campo) {
  if (!campo) return;
  if (ordenacaoAcessos.campo === campo) {
    ordenacaoAcessos.ascendente = !ordenacaoAcessos.ascendente;
  } else {
    ordenacaoAcessos.campo = campo;
    ordenacaoAcessos.ascendente = true;
  }
  renderizarTabela();
}

function ordenarAcessos(lista) {
  const { campo, ascendente } = ordenacaoAcessos;
  if (!campo) return lista;

  return [...lista].sort((a, b) => {
    let va = a[campo];
    let vb = b[campo];

    if (CAMPOS_DATA_ACESSOS.has(campo)) {
      va = va ? new Date(va).getTime() : 0;
      vb = vb ? new Date(vb).getTime() : 0;
    } else {
      va = normalizarBusca(va);
      vb = normalizarBusca(vb);
    }

    if (va < vb) return ascendente ? -1 : 1;
    if (va > vb) return ascendente ? 1 : -1;
    return 0;
  });
}

function atualizarIconesOrdenacaoAcessos() {
  document.querySelectorAll('table.data-grid thead th.sortable').forEach(th => {
    const icone = th.querySelector('i');
    if (!icone) return;
    const ativo = th.dataset.sort === ordenacaoAcessos.campo;
    icone.className = ativo ? `fas fa-sort-${ordenacaoAcessos.ascendente ? 'up' : 'down'}` : 'fas fa-sort';
  });
}

function renderizarTabela() {
  const tbody = document.getElementById('tbodyAcessos');
  const dados = ordenarAcessos(obterAcessosFiltrados());
  atualizarIconesOrdenacaoAcessos();

  document.getElementById('totalRegistros').textContent = dados.length;
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:20px;">Nenhum registro encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(item => `
    <tr>
      <td>${formatarDataHora(item.created_at)}</td>
      <td>${escapeHtml(item.filial || '-')}</td>
      <td>${escapeHtml(item.empresa_nome || '-')}</td>
      <td>${escapeHtml(item.empresa_documento || '-')}</td>
      <td>${escapeHtml(item.pessoa_nome || '-')}</td>
      <td>${escapeHtml(item.placa_veiculo || '-')}</td>
      <td>${escapeHtml(item.carreta_cacamba || '-')}</td>
      <td>${escapeHtml(item.setor_nome || '-')}</td>
      <td>${escapeHtml(item.produto_servico || '-')}</td>
      <td>${escapeHtml(formatarDataHoraCompleta(item.entrada_em))}</td>
      <td>${escapeHtml(formatarDataHoraCompleta(item.saida_em))}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || 'aguardando')}">${escapeHtml(formatarStatus(item.status))}</span></td>
      <td class="acoes-cell">
        <button type="button" class="btn-grid-action btn-edit" data-action="editar" data-id="${escapeHtml(item.id)}" title="Editar"><i class="fas fa-pen"></i></button>
        ${item.status === 'aguardando' ? `<button type="button" class="btn-grid-action btn-entry" data-action="entrada" data-id="${escapeHtml(item.id)}" title="Registrar entrada"><i class="fas fa-sign-in-alt"></i></button>` : ''}
        ${item.status === 'entrada' ? `<button type="button" class="btn-grid-action btn-exit" data-action="saida" data-id="${escapeHtml(item.id)}" title="Registrar saida"><i class="fas fa-sign-out-alt"></i></button>` : ''}
        ${usuarioPodeExcluir() ? `<button type="button" class="btn-grid-action btn-delete" data-action="excluir" data-id="${escapeHtml(item.id)}" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
      </td>
    </tr>
  `).join('');
}

function obterAcessosFiltrados() {
  const termo = normalizarBusca(document.getElementById('filtroBusca').value);
  const termoGrid = normalizarBusca(document.getElementById('filtroGridEmpresaPlaca').value);
  return acessos.filter(item => {
    const atendeBuscaGeral = !termo || [
      item.empresa_nome,
      item.empresa_documento,
      item.filial,
      item.pessoa_nome,
      item.pessoa_documento,
      item.placa_veiculo,
      item.placa_entrada,
      item.placa_saida,
      item.carreta_cacamba,
      item.carreta_cacamba_entrada,
      item.carreta_cacamba_saida,
      item.setor_nome,
      item.produto_servico,
      item.observacoes,
      item.status
    ].some(valor => normalizarBusca(valor).includes(termo));

    const atendeBuscaGrid = !termoGrid || [
      item.empresa_nome,
      item.empresa_documento,
      item.placa_veiculo,
      item.placa_entrada,
      item.placa_saida,
      item.carreta_cacamba,
      item.carreta_cacamba_entrada,
      item.carreta_cacamba_saida
    ].some(valor => normalizarBusca(valor).includes(termoGrid));

    return atendeBuscaGeral && atendeBuscaGrid;
  });
}

function montarLinhasExportacao() {
  return obterAcessosFiltrados().map(item => ({
    'Data/Hora': formatarDataHoraCompleta(item.created_at),
    Filial: item.filial || '',
    Empresa: item.empresa_nome || '',
    Documento: item.empresa_documento || '',
    Pessoa: item.pessoa_nome || '',
    'Documento Pessoa': item.pessoa_documento || '',
    'Placa/Cavalo': item.placa_veiculo || '',
    'Carreta/Caçamba': item.carreta_cacamba || '',
    Setor: item.setor_nome || '',
    'Produto/Servico': item.produto_servico || '',
    Entrada: formatarDataHoraCompleta(item.entrada_em),
    Saida: formatarDataHoraCompleta(item.saida_em),
    Status: formatarStatus(item.status),
    Observacoes: item.observacoes || '',
    Usuario: item.usuario_nome || ''
  }));
}

function exportarXLSX() {
  const linhas = montarLinhasExportacao();
  if (!linhas.length) return alert('Nenhum registro para exportar.');

  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 18 },
    { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 20 },
    { wch: 20 }, { wch: 16 }, { wch: 35 }, { wch: 20 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Controle de Acesso');
  XLSX.writeFile(wb, `Portaria_Controle_Acesso_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportarPDF() {
  const linhas = montarLinhasExportacao();
  if (!linhas.length) return alert('Nenhum registro para exportar.');
  if (!window.jspdf?.jsPDF) {
    return alert('Biblioteca jsPDF nao carregada. Verifique sua conexao.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  if (typeof doc.autoTable !== 'function') {
    return alert('Biblioteca jsPDF AutoTable nao carregada. Verifique sua conexao.');
  }
  const logo = await carregarLogoComFundoBranco();
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};

  if (logo) {
    doc.addImage(logo, 'JPEG', 14, 10, 40, 10);
  }

  doc.setTextColor(0, 105, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Relatorio de Portaria - Controle de Acesso', 14, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Exportado por: ${usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema'}`, 14, 34);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 39);
  doc.text(`Filtros: ${formatarPeriodoFiltro()} | Registros: ${linhas.length}`, 120, 39);

  doc.autoTable({
    startY: 45,
    head: [[
      'Data/Hora',
      'Filial',
      'Empresa',
      'Documento',
      'Pessoa',
      'Placa/Cavalo',
      'Carreta/Caçamba',
      'Setor',
      'Produto/Servico',
      'Entrada',
      'Saida',
      'Status'
    ]],
    body: linhas.map(item => [
      item['Data/Hora'],
      item.Filial,
      item.Empresa,
      item.Documento,
      item.Pessoa,
      item['Placa/Cavalo'],
      item['Carreta/Caçamba'],
      item.Setor,
      item['Produto/Servico'],
      item.Entrada,
      item.Saida,
      item.Status
    ]).concat([[
      {
        content: `Total de Registros: ${linhas.length}`,
        colSpan: 12,
        styles: {
          fillColor: [220, 220, 220],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'right'
        }
      }
    ]]),
    styles: {
      fontSize: 7,
      cellPadding: 1.4,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [0, 105, 55],
      textColor: [255, 255, 255]
    },
    alternateRowStyles: {
      fillColor: [245, 248, 246]
    },
    margin: { left: 8, right: 8 }
  });

  adicionarRodapePDF(doc);
  doc.save(`Portaria_Controle_Acesso_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function adicionarRodapePDF(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let pagina = 1; pagina <= pageCount; pagina += 1) {
    doc.setPage(pagina);
    doc.setFontSize(8);
    doc.setTextColor(100);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateText = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
    const pageText = `Pagina ${pagina} de ${pageCount}`;
    const textWidth = doc.getTextWidth(pageText);

    doc.text(dateText, 14, pageHeight - 10);
    doc.text(pageText, pageWidth - 14 - textWidth, pageHeight - 10);
  }
}

function carregarLogoComFundoBranco() {
  return new Promise(resolve => {
    const imagem = new Image();
    imagem.crossOrigin = 'anonymous';
    imagem.src = 'logo.png';
    imagem.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imagem.naturalWidth || imagem.width;
      canvas.height = imagem.naturalHeight || imagem.height;
      const contexto = canvas.getContext('2d');
      contexto.fillStyle = '#FFFFFF';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(imagem, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    imagem.onerror = () => {
      console.warn('Nao foi possivel carregar o logo para o PDF.');
      resolve(null);
    };
  });
}

function formatarPeriodoFiltro() {
  const dataDe = document.getElementById('filtroDataDe').value;
  const dataAte = document.getElementById('filtroDataAte').value;
  const status = document.getElementById('filtroStatus').value;
  const partes = [];
  if (dataDe) partes.push(`De ${formatarDataISO(dataDe)}`);
  if (dataAte) partes.push(`Ate ${formatarDataISO(dataAte)}`);
  if (status) partes.push(`Status ${formatarStatus(status)}`);
  return partes.join(' | ') || 'Todos';
}

function formatarDataISO(value) {
  if (!value) return '';
  const [ano, mes, dia] = value.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function handleTabelaClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const item = acessos.find(acesso => acesso.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'editar') {
    abrirModalAcesso(item);
    return;
  }

  if (button.dataset.action === 'entrada') {
    const ok = await atualizarStatusAcesso(item.id, {
      status: 'entrada',
      entrada_em: new Date().toISOString(),
      placa_entrada: item.placa_veiculo || null,
      carreta_cacamba_entrada: item.carreta_cacamba || null
    });
    if (ok) registrarAuditoria('ALTERAR', 'Portaria', `Entrada registrada: ${item.pessoa_nome || '-'} / ${item.empresa_nome || '-'}`);
  }

  if (button.dataset.action === 'saida') {
    abrirModalSaidaAcesso(item);
  }

  if (button.dataset.action === 'excluir') {
    await excluirAcesso(item);
  }
}

async function atualizarStatusAcesso(id, payload) {
  const { error } = await supabaseClient.from('portaria_acessos').update(payload).eq('id', id);
  if (error) { alert(`Erro ao atualizar acesso: ${error.message}`); return false; }
  await buscarAcessos();
  return true;
}

async function excluirAcesso(item) {
  if (!usuarioPodeExcluir()) {
    alert('Seu nivel de acesso nao permite excluir lancamentos.');
    return;
  }
  if (!confirm(`Deseja excluir o acesso de ${item.pessoa_nome || '-'} / ${item.empresa_nome || '-'}?`)) return;

  const { error } = await supabaseClient.from('portaria_acessos').delete().eq('id', item.id);
  if (error) return alert(`Erro ao excluir acesso: ${error.message}`);
  registrarAuditoria('EXCLUIR', 'Portaria', `Acesso excluído: ${item.pessoa_nome || '-'} / ${item.empresa_nome || '-'}`);
  await buscarAcessos();
}

function usuarioPodeExcluir() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
  return niveisComExclusao.includes(String(usuario.nivel || '').toLowerCase());
}

function usuarioAdministrador() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
  return String(usuario.nivel || '').toLowerCase() === 'administrador';
}

function formatarStatus(status) {
  return {
    aguardando: 'Aguardando',
    entrada: 'Entrada',
    saida: 'Saida'
  }[status] || status || '-';
}

function formatarDataHora(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function formatarDataHoraCompleta(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
