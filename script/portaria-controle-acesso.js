import { supabaseClient } from './supabase.js';

let empresas = [];
let pessoas = [];
let setores = [];
let acessos = [];
let acessoEditandoId = null;
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
  document.getElementById('btnAbrirEmpresaNoAcesso').addEventListener('click', () => abrirModalCadastro('modalEmpresa'));
  document.getElementById('btnAbrirPessoaNoAcesso').addEventListener('click', () => abrirModalCadastro('modalPessoa'));
  document.getElementById('btnAbrirSetorNoAcesso').addEventListener('click', () => abrirModalCadastro('modalSetor'));
  document.getElementById('acessoEmpresa').addEventListener('change', preencherDadosEmpresa);
  document.getElementById('acessoPessoa').addEventListener('change', preencherDadosPessoa);
  document.getElementById('tbodyAcessos').addEventListener('click', handleTabelaClick);

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => fecharModalCadastro(btn.dataset.closeModal));
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.add('hidden');
    });
  });
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
  document.getElementById('modalAcesso').classList.add('hidden');
}

function abrirModalCadastro(id) {
  const modal = document.getElementById(id);
  modal.querySelector('form')?.reset();
  if (id === 'modalEmpresa') document.getElementById('empresaNome').value = document.getElementById('acessoEmpresa').value.split(' - ')[0] || '';
  if (id === 'modalPessoa') document.getElementById('pessoaNome').value = document.getElementById('acessoPessoa').value.split(' - ')[0] || '';
  if (id === 'modalSetor') document.getElementById('setorNome').value = document.getElementById('acessoSetor').value || '';
  modal.classList.remove('hidden');
}

function fecharModalCadastro(id) {
  document.getElementById(id).classList.add('hidden');
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
  const termo = normalizarBusca(document.getElementById('filtroBusca').value);
  const dados = acessos.filter(item => !termo || [
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

  document.getElementById('totalRegistros').textContent = dados.length;
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;">Nenhum registro encontrado.</td></tr>';
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
