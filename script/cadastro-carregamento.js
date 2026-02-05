import { supabaseClient } from './supabase.js';
// === FUNÇÕES AUXILIARES ===

/**
 * Busca o último código da tabela de itens e retorna o próximo número.
 * @returns {Promise<string>} O próximo código como string.
 */
async function obterProximoCodigoItem() {
  const { data, error } = await supabaseClient
    .from('itens')
    .select('codigo')
    .order('codigo', { ascending: false, nullsFirst: false, foreignTable: undefined }) // Ordena como número
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
    console.error('Erro ao obter o próximo código:', error);
    return null;
  }

  if (!data || !data.codigo) {
    return '1'; // Se não houver itens, começa com 1
  }

  const codigoInt = parseInt(data.codigo, '');
  return !isNaN(codigoInt) ? (codigoInt + 1).toString() : '1';
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
        <button onclick="editarItem('${item.id}')">✏️</button>
        <button onclick="excluirItem('${item.id}')">🗑️</button>
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

  const { data, error } = await supabaseClient
    .from('clientes')
    .select('*')
    .order('codigo', { ascending: true });

  if (error) {
    corpoTabela.innerHTML = '<tr><td colspan="5">Erro ao carregar clientes.</td></tr>';
    console.error(error);
    return;
  }

  if (data.length === 0) {
    corpoTabela.innerHTML = '<tr><td colspan="5">Nenhum cliente encontrado.</td></tr>';
    return;
  }

  data.forEach(cliente => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${cliente.codigo}</td>
      <td>${cliente.nome}</td>
      <td>${cliente.cidade}</td>
      <td>${cliente.estado}</td>
      <td>
        <button onclick="editarCliente('${cliente.id}')">✏️</button>
        <button onclick="excluirCliente('${cliente.id}')">🗑️</button>
      </td>
    `;
    corpoTabela.appendChild(linha);
  });
}

export async function salvarCliente(event) {
  event.preventDefault();

  const id = document.getElementById('formCliente').dataset.clienteId;
  const codigo = document.getElementById('codCliente').value.trim();
  const nome = document.getElementById('nomeCliente').value.trim();
  const cidade = document.getElementById('cidadeCliente').value.trim();
  const estado = document.getElementById('estadoCliente').value.trim();

  if (!codigo || !nome || !cidade || !estado) {
    alert('⚠️ Preencha todos os campos.');
    return;
  }

  let result;
  if (id) {
    // Update
    result = await supabaseClient
      .from('clientes')
      .update({ codigo, nome, cidade, estado })
      .eq('id', id);
  } else {
    // Insert
    result = await supabaseClient
      .from('clientes')
      .insert([{ codigo, nome, cidade, estado }]);
  }

  if (result.error) {
    alert('❌ Erro ao salvar cliente.');
    console.error(result.error);
    return;
  }

  alert('✅ Cliente salvo com sucesso!');
  document.getElementById('formCliente').reset();
  document.getElementById('formCliente').dataset.clienteId = '';
  carregarClientes();
}

export async function editarCliente(id) {
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    alert('❌ Erro ao carregar cliente.');
    return;
  }

  document.getElementById('codCliente').value = data.codigo;
  document.getElementById('nomeCliente').value = data.nome;
  document.getElementById('cidadeCliente').value = data.cidade;
  document.getElementById('estadoCliente').value = data.estado;
  document.getElementById('formCliente').dataset.clienteId = data.id;
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
  carregarClientes();
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
        <button onclick="editarMotorista('${motorista.id}')">✏️</button>
        <button onclick="excluirMotorista('${motorista.id}')">🗑️</button>
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
