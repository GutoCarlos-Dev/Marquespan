import { supabaseClient } from './supabase.js';
import XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

let empresas = [];
let pessoas = [];
let setores = [];
let acessos = [];
let acessoEditandoId = null;
let modalRetornoCadastro = null;
const niveisComExclusao = ['administrador', 'gerencia'];

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date();
  document.getElementById('filtroDataDe').valueAsDate = hoje;
  document.getElementById('filtroDataAte').valueAsDate = hoje;

  bindEvents();
  await carregarCadastros();
  await buscarAcessos();
});

function bindEvents() {
  document.getElementById('btnNovoAcesso').addEventListener('click', () => abrirModalAcesso());
  document.getElementById('btnBuscarAcessos').addEventListener('click', buscarAcessos);
  document.getElementById('filtroBusca').addEventListener('input', renderizarTabela);
  document.getElementById('filtroStatus').addEventListener('change', buscarAcessos);
  document.getElementById('formAcesso').addEventListener('submit', salvarAcesso);
  document.getElementById('formEmpresa').addEventListener('submit', salvarEmpresa);
  document.getElementById('formPessoa').addEventListener('submit', salvarPessoa);
  document.getElementById('formSetor').addEventListener('submit', salvarSetor);
  document.getElementById('btnFecharAcesso').addEventListener('click', fecharModalAcesso);
  document.getElementById('btnCancelarAcesso').addEventListener('click', fecharModalAcesso);
  document.getElementById('btnCadastroEmpresa').addEventListener('click', () => abrirModalCadastro('modalEmpresa'));
  document.getElementById('btnCadastroPessoa').addEventListener('click', () => abrirModalCadastro('modalPessoa'));
  document.getElementById('btnCadastroSetor').addEventListener('click', () => abrirModalCadastro('modalSetor'));
  document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
  document.getElementById('btnExportarXLSX').addEventListener('click', exportarXLSX);
  document.getElementById('btnToggleMenuLateralPortaria')?.addEventListener('click', toggleMenuLateral);
  document.getElementById('btnAbrirEmpresaNoAcesso').addEventListener('click', () => abrirModalCadastro('modalEmpresa', 'modalAcesso'));
  document.getElementById('btnAbrirPessoaNoAcesso').addEventListener('click', () => abrirModalCadastro('modalPessoa', 'modalAcesso'));
  document.getElementById('btnAbrirSetorNoAcesso').addEventListener('click', () => abrirModalCadastro('modalSetor', 'modalAcesso'));
  document.getElementById('acessoEmpresa').addEventListener('change', preencherDadosEmpresa);
  document.getElementById('acessoPessoa').addEventListener('change', preencherDadosPessoa);
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

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => fecharModalCadastro(btn.dataset.closeModal));
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target !== modal) return;
      if (modal.id === 'modalAcesso') {
        fecharModalAcesso();
      } else {
        fecharModalCadastro(modal.id);
      }
    });
  });
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

  empresas = empresasRes.data || [];
  pessoas = pessoasRes.data || [];
  setores = setoresRes.data || [];

  preencherDatalist('listaEmpresasPortaria', empresas.map(formatarEmpresaOpcao));
  preencherDatalist('listaPessoasPortaria', pessoas.map(formatarPessoaOpcao));
  preencherDatalist('listaSetoresPortaria', setores.map(setor => setor.nome));
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
  return empresas.find(empresa =>
    normalizarBusca(formatarEmpresaOpcao(empresa)) === busca ||
    normalizarBusca(empresa.nome) === busca ||
    normalizarBusca(empresa.documento) === busca
  );
}

function encontrarPessoa(valor) {
  const busca = normalizarBusca(valor);
  return pessoas.find(pessoa =>
    normalizarBusca(formatarPessoaOpcao(pessoa)) === busca ||
    normalizarBusca(pessoa.nome) === busca ||
    normalizarBusca(pessoa.documento) === busca
  );
}

function encontrarSetor(valor) {
  const busca = normalizarBusca(valor);
  return setores.find(setor => normalizarBusca(setor.nome) === busca);
}

function abrirModalAcesso(item = null) {
  modalRetornoCadastro = null;
  esconderTodosModais();
  document.getElementById('formAcesso').reset();
  acessoEditandoId = item?.id || null;
  document.querySelector('#modalAcesso .modal-header h3').textContent = acessoEditandoId ? 'Editar Acesso' : 'Controle de Acesso';
  document.getElementById('acessoEmpresa').value = item ? [item.empresa_nome, item.empresa_documento].filter(Boolean).join(' - ') : '';
  document.getElementById('acessoPessoa').value = item ? [item.pessoa_nome, item.pessoa_documento].filter(Boolean).join(' - ') : '';
  document.getElementById('acessoDocumentoPessoa').value = item?.pessoa_documento || '';
  document.getElementById('acessoPlacaVeiculo').value = item?.placa_veiculo || '';
  document.getElementById('acessoSetor').value = item?.setor_nome || '';
  document.getElementById('acessoProdutoServico').value = item?.produto_servico || '';
  document.getElementById('acessoObservacoes').value = item?.observacoes || '';
  document.getElementById('modalAcesso').classList.remove('hidden');
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
  if (id === 'modalEmpresa') document.getElementById('empresaNome').value = document.getElementById('acessoEmpresa').value.split(' - ')[0] || '';
  if (id === 'modalPessoa') document.getElementById('pessoaNome').value = document.getElementById('acessoPessoa').value.split(' - ')[0] || '';
  if (id === 'modalSetor') document.getElementById('setorNome').value = document.getElementById('acessoSetor').value || '';
  modal.classList.remove('hidden');
}

function fecharModalCadastro(id) {
  document.getElementById(id).classList.add('hidden');
  if (modalRetornoCadastro) {
    document.getElementById(modalRetornoCadastro)?.classList.remove('hidden');
    modalRetornoCadastro = null;
  }
}

function esconderTodosModais() {
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden'));
}

function preencherDadosEmpresa() {
  const empresa = encontrarEmpresa(document.getElementById('acessoEmpresa').value);
  if (empresa) document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(empresa);
}

function preencherDadosPessoa() {
  const pessoa = encontrarPessoa(document.getElementById('acessoPessoa').value);
  if (!pessoa) return;
  document.getElementById('acessoPessoa').value = formatarPessoaOpcao(pessoa);
  document.getElementById('acessoDocumentoPessoa').value = pessoa.documento || '';
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
  if (ids[2]) document.getElementById(ids[2]).innerHTML = '<tr><td colspan="4">Clique em Buscar para listar os cadastros.</td></tr>';
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
    document.getElementById('acessoPessoa').value = formatarPessoaOpcao(pessoa);
    document.getElementById('acessoDocumentoPessoa').value = pessoa.documento || '';
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
    tbody.innerHTML = '<tr><td colspan="4">Nenhum cadastro encontrado.</td></tr>';
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
      campos: ['nome', 'documento', 'telefone'],
      colunas: ['nome', 'documento', 'telefone'],
      label: 'empresa'
    },
    pessoa: {
      lista: pessoas,
      tabela: 'portaria_pessoas',
      buscaId: 'buscaPessoaCadastro',
      gridId: 'gridPessoasCadastro',
      campos: ['nome', 'documento', 'telefone', 'empresa_nome'],
      colunas: ['nome', 'documento', 'empresa_nome'],
      label: 'pessoa'
    },
    setor: {
      lista: setores,
      tabela: 'portaria_setores',
      buscaId: 'buscaSetorCadastro',
      gridId: 'gridSetoresCadastro',
      campos: ['nome', 'responsavel', 'ramal'],
      colunas: ['nome', 'responsavel', 'ramal'],
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

  await carregarCadastros();
  renderGridCadastro(tipo);
}

function preencherFormularioEmpresa(empresa) {
  document.getElementById('empresaNome').value = empresa.nome || '';
  document.getElementById('empresaDocumento').value = empresa.documento || '';
  document.getElementById('empresaTelefone').value = empresa.telefone || '';
  document.getElementById('empresaObservacoes').value = empresa.observacoes || '';
}

function preencherFormularioPessoa(pessoa) {
  document.getElementById('pessoaNome').value = pessoa.nome || '';
  document.getElementById('pessoaDocumento').value = pessoa.documento || '';
  document.getElementById('pessoaTelefone').value = pessoa.telefone || '';
  document.getElementById('pessoaEmpresa').value = pessoa.empresa_nome || '';
}

function preencherFormularioSetor(setor) {
  document.getElementById('setorNome').value = setor.nome || '';
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
    const payload = {
      empresa_id: empresa?.id || null,
      pessoa_id: pessoa?.id || null,
      setor_id: setor?.id || null,
      empresa_nome: empresa?.nome || empresaValor.split(' - ')[0] || empresaValor,
      empresa_documento: empresa?.documento || extrairDocumento(empresaValor),
      pessoa_nome: pessoa?.nome || pessoaValor.split(' - ')[0] || pessoaValor,
      pessoa_documento: document.getElementById('acessoDocumentoPessoa').value.trim() || pessoa?.documento || extrairDocumento(pessoaValor),
      placa_veiculo: document.getElementById('acessoPlacaVeiculo').value.trim().toUpperCase() || null,
      setor_nome: setor?.nome || document.getElementById('acessoSetor').value.trim(),
      produto_servico: document.getElementById('acessoProdutoServico').value.trim() || null,
      observacoes: document.getElementById('acessoObservacoes').value.trim() || null
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
  const payload = {
    nome: document.getElementById('empresaNome').value.trim().toUpperCase(),
    documento: document.getElementById('empresaDocumento').value.trim() || null,
    telefone: document.getElementById('empresaTelefone').value.trim() || null,
    observacoes: document.getElementById('empresaObservacoes').value.trim() || null
  };
  const existente = empresas.find(item =>
    (payload.documento && normalizarBusca(item.documento) === normalizarBusca(payload.documento)) ||
    normalizarBusca(item.nome) === normalizarBusca(payload.nome)
  );
  if (existente) {
    alert('Empresa ja cadastrada. O cadastro existente foi selecionado.');
    document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(existente);
    preencherFormularioEmpresa(existente);
    return;
  }
  const { error } = await supabaseClient.from('portaria_empresas').insert([payload]);
  if (error) return alert(`Erro ao salvar empresa: ${error.message}`);
  fecharModalCadastro('modalEmpresa');
  await carregarCadastros();
  document.getElementById('acessoEmpresa').value = formatarEmpresaOpcao(payload);
}

async function salvarPessoa(event) {
  event.preventDefault();
  const empresa = encontrarEmpresa(document.getElementById('pessoaEmpresa').value);
  const payload = {
    nome: document.getElementById('pessoaNome').value.trim().toUpperCase(),
    documento: document.getElementById('pessoaDocumento').value.trim() || null,
    telefone: document.getElementById('pessoaTelefone').value.trim() || null,
    empresa_id: empresa?.id || null,
    empresa_nome: empresa?.nome || document.getElementById('pessoaEmpresa').value.trim() || null
  };
  const existente = pessoas.find(item =>
    (payload.documento && normalizarBusca(item.documento) === normalizarBusca(payload.documento)) ||
    normalizarBusca(item.nome) === normalizarBusca(payload.nome)
  );
  if (existente) {
    alert('Pessoa ja cadastrada. O cadastro existente foi selecionado.');
    document.getElementById('acessoPessoa').value = formatarPessoaOpcao(existente);
    document.getElementById('acessoDocumentoPessoa').value = existente.documento || '';
    preencherFormularioPessoa(existente);
    return;
  }
  const { error } = await supabaseClient.from('portaria_pessoas').insert([payload]);
  if (error) return alert(`Erro ao salvar pessoa: ${error.message}`);
  fecharModalCadastro('modalPessoa');
  await carregarCadastros();
  document.getElementById('acessoPessoa').value = formatarPessoaOpcao(payload);
  document.getElementById('acessoDocumentoPessoa').value = payload.documento || '';
}

async function salvarSetor(event) {
  event.preventDefault();
  const payload = {
    nome: document.getElementById('setorNome').value.trim().toUpperCase(),
    responsavel: document.getElementById('setorResponsavel').value.trim() || null,
    ramal: document.getElementById('setorRamal').value.trim() || null
  };
  const existente = setores.find(item => normalizarBusca(item.nome) === normalizarBusca(payload.nome));
  if (existente) {
    alert('Setor ja cadastrado. O cadastro existente foi selecionado.');
    document.getElementById('acessoSetor').value = existente.nome || '';
    preencherFormularioSetor(existente);
    return;
  }
  const { error } = await supabaseClient.from('portaria_setores').insert([payload]);
  if (error) return alert(`Erro ao salvar setor: ${error.message}`);
  fecharModalCadastro('modalSetor');
  await carregarCadastros();
  document.getElementById('acessoSetor').value = payload.nome;
}

async function buscarAcessos() {
  const dataDe = document.getElementById('filtroDataDe').value;
  const dataAte = document.getElementById('filtroDataAte').value;
  const status = document.getElementById('filtroStatus').value;

  let query = supabaseClient.from('portaria_acessos').select('*');
  if (dataDe) query = query.gte('created_at', `${dataDe}T00:00:00`);
  if (dataAte) query = query.lte('created_at', `${dataAte}T23:59:59`);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return alert(`Erro ao buscar acessos: ${error.message}`);
  acessos = data || [];
  renderizarTabela();
}

function renderizarTabela() {
  const tbody = document.getElementById('tbodyAcessos');
  const dados = obterAcessosFiltrados();

  document.getElementById('totalRegistros').textContent = dados.length;
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">Nenhum registro encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(item => `
    <tr>
      <td>${formatarDataHora(item.created_at)}</td>
      <td>${escapeHtml(item.empresa_nome || '-')}</td>
      <td>${escapeHtml(item.empresa_documento || '-')}</td>
      <td>${escapeHtml(item.pessoa_nome || '-')}</td>
      <td>${escapeHtml(item.placa_veiculo || '-')}</td>
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
  return acessos.filter(item => !termo || [
    item.empresa_nome,
    item.empresa_documento,
    item.pessoa_nome,
    item.pessoa_documento,
    item.placa_veiculo,
    item.setor_nome,
    item.produto_servico,
    item.observacoes,
    item.status
  ].some(valor => normalizarBusca(valor).includes(termo)));
}

function montarLinhasExportacao() {
  return obterAcessosFiltrados().map(item => ({
    'Data/Hora': formatarDataHoraCompleta(item.created_at),
    Empresa: item.empresa_nome || '',
    Documento: item.empresa_documento || '',
    Pessoa: item.pessoa_nome || '',
    'Documento Pessoa': item.pessoa_documento || '',
    Placa: item.placa_veiculo || '',
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
    { wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 18 },
    { wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 20 },
    { wch: 16 }, { wch: 35 }, { wch: 20 }
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
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await carregarLogoBase64();

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 34, 'F');
  if (logo) doc.addImage(logo, 'PNG', 12, 7, 26, 18);

  doc.setTextColor(0, 106, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('MARQUESPAN', pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Relatorio - Portaria Controle de Acesso', pageWidth / 2, 20, { align: 'center' });
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 12, 12, { align: 'right' });
  doc.text(`Periodo: ${formatarPeriodoFiltro()} | Registros: ${linhas.length}`, pageWidth / 2, 27, { align: 'center' });

  doc.autoTable({
    startY: 38,
    head: [[
      'Data/Hora',
      'Empresa',
      'Documento',
      'Pessoa',
      'Placa',
      'Setor',
      'Produto/Servico',
      'Entrada',
      'Saida',
      'Status'
    ]],
    body: linhas.map(item => [
      item['Data/Hora'],
      item.Empresa,
      item.Documento,
      item.Pessoa,
      item.Placa,
      item.Setor,
      item['Produto/Servico'],
      item.Entrada,
      item.Saida,
      item.Status
    ]),
    styles: {
      fontSize: 7,
      cellPadding: 1.8,
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [0, 106, 45],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [245, 248, 246]
    },
    margin: { left: 8, right: 8 },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, pageWidth - 12, pageHeight - 8, { align: 'right' });
    }
  });

  doc.save(`Portaria_Controle_Acesso_${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function carregarLogoBase64() {
  try {
    const response = await fetch('logo.png');
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Nao foi possivel carregar o logo para o PDF:', error);
    return null;
  }
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
    await atualizarStatusAcesso(item.id, { status: 'entrada', entrada_em: new Date().toISOString() });
  }

  if (button.dataset.action === 'saida') {
    await atualizarStatusAcesso(item.id, { status: 'saida', saida_em: new Date().toISOString() });
  }

  if (button.dataset.action === 'excluir') {
    await excluirAcesso(item);
  }
}

async function atualizarStatusAcesso(id, payload) {
  const { error } = await supabaseClient.from('portaria_acessos').update(payload).eq('id', id);
  if (error) return alert(`Erro ao atualizar acesso: ${error.message}`);
  await buscarAcessos();
}

async function excluirAcesso(item) {
  if (!usuarioPodeExcluir()) {
    alert('Seu nivel de acesso nao permite excluir lancamentos.');
    return;
  }
  if (!confirm(`Deseja excluir o acesso de ${item.pessoa_nome || '-'} / ${item.empresa_nome || '-'}?`)) return;

  const { error } = await supabaseClient.from('portaria_acessos').delete().eq('id', item.id);
  if (error) return alert(`Erro ao excluir acesso: ${error.message}`);
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
