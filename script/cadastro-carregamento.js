import { supabaseClient } from './supabase.js';

let clientesCarregamento = [];

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

  if (!codigo || !nome || !cidade || !estado) {
    alert('⚠️ Preencha todos os campos.');
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
