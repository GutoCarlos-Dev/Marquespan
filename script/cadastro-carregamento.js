import { supabase } from './supabase.js';

// === ITENS ===

export async function carregarItens() {
  const corpoTabela = document.getElementById('corpoTabelaItens');
  corpoTabela.innerHTML = '';

  const { data, error } = await supabase
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

  if (!codigo) {
    // Buscar o último código cadastrado e incrementar 1
    const { data, error } = await supabase
      .from('itens')
      .select('codigo')
      .order('codigo', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      alert('❌ Erro ao obter o próximo código.');
      console.error(error);
      return;
    }

    codigo = (parseInt(data.codigo, 10) + 1).toString();
  }

  let result;
  if (id) {
    // Update
    result = await supabase
      .from('itens')
      .update({ nome, tipo })
      .eq('id', id);
  } else {
    // Insert
    result = await supabase
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
  const { data, error } = await supabase
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
  document.getElementById('codigoItem').disabled = true; // Código sempre desabilitado
  document.getElementById('nomeItem').disabled = false;
  document.getElementById('tipoItem').disabled = false;
  document.getElementById('btnSalvarItem').disabled = false;
}

export async function incluirItem() {
  // Buscar o último código cadastrado e incrementar 1
  const { data, error } = await supabase
    .from('itens')
    .select('codigo')
    .order('codigo', { ascending: false })
    .limit(1);

  let nextCodigo = '1'; // Se não houver nenhum, começa com 1

  if (error) {
    console.error('Erro ao obter o próximo código:', error);
  } else if (data && data.length > 0) {
    nextCodigo = (parseInt(data[0].codigo, 10) + 1).toString();
  }

  // Preencher o código e habilitar os campos
  document.getElementById('codigoItem').value = nextCodigo;
  document.getElementById('codigoItem').disabled = true; // Código sempre desabilitado
  document.getElementById('nomeItem').disabled = false;
  document.getElementById('tipoItem').disabled = false;
  document.getElementById('btnSalvarItem').disabled = false;

  // Limpar outros campos
  document.getElementById('nomeItem').value = '';
  document.getElementById('tipoItem').value = '';
  document.getElementById('formItem').dataset.itemId = '';
}

export async function excluirItem(id) {
  const confirmar = confirm('Tem certeza que deseja excluir este item?');

  if (!confirmar) return;

  const { error } = await supabase
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

  const { data, error } = await supabase
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
    result = await supabase
      .from('clientes')
      .update({ codigo, nome, cidade, estado })
      .eq('id', id);
  } else {
    // Insert
    result = await supabase
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
  const { data, error } = await supabase
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

  const { error } = await supabase
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
