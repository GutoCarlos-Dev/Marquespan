import { supabase } from './supabase.js';

export async function mostrarUsuarios() {
  const termo = document.getElementById('termoBusca').value.trim().toLowerCase();
  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = '';

  let { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, nomecompleto, email, nivel');

  if (error) {
    corpoTabela.innerHTML = '<tr><td colspan="6">Erro ao carregar usuários.</td></tr>';
    return;
  }

  if (termo) {
    data = data.filter(u =>
      u.id.toString().toLowerCase().includes(termo) ||
      u.nome.toLowerCase().includes(termo) ||
      u.nomecompleto.toLowerCase().includes(termo) ||
      u.email.toLowerCase().includes(termo)
    );
  }

  if (data.length === 0) {
    corpoTabela.innerHTML = '<tr><td colspan="6">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  data.forEach(usuario => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${usuario.id}</td>
      <td>${usuario.nome}</td>
      <td>${usuario.nomecompleto}</td>
      <td>${usuario.email}</td>
      <td>${usuario.nivel}</td>
      <td>
        <button onclick="editarUsuario('${usuario.id}')">✏️</button>
        <button onclick="excluirUsuario('${usuario.id}')">🗑️</button>
      </td>
    `;
    corpoTabela.appendChild(linha);
  });
}

export async function cadastrarUsuario(event) {
  event.preventDefault(); // evita recarregar a página

  const nome = document.getElementById('nome').value.trim();
  const nomecompleto = document.getElementById('nomecompleto').value.trim();
  const email = document.getElementById('email').value.trim();
  const nivel = document.getElementById('nivel').value.trim().toLowerCase();
  const senha = document.getElementById('senha').value.trim();

  if (!nome || !nomecompleto || !email || !nivel || !senha) {
    alert('⚠️ Preencha todos os campos.');
    return;
  }

  const { error } = await supabase
    .from('usuarios')
    .insert([{ nome, nomecompleto, email, nivel, senha }]);

  if (error) {
    console.error(error);
    alert('❌ Erro ao cadastrar usuário.');
    return;
  }

  alert('✅ Usuário cadastrado com sucesso!');
  document.getElementById('formUsuario').reset();
  window.mostrarSecao('busca');
  mostrarUsuarios();
}


export async function editarUsuario(id) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    alert('❌ Erro ao carregar usuário.');
    return;
  }

  document.getElementById('nome').value = data.nome;
  document.getElementById('nomecompleto').value = data.nomecompleto;
  document.getElementById('email').value = data.email;
  document.getElementById('nivel').value = data.nivel;
  // Não carregar senha por segurança; deixar campo vazio para alteração opcional
  document.getElementById('senha').value = '';
  document.getElementById('formUsuario').dataset.usuarioId = data.id;

  document.getElementById('btnSalvar').classList.add('hidden');
  document.getElementById('btnAtualizar').classList.remove('hidden');
  window.mostrarSecao('cadastro');
}

export async function atualizarUsuario(event) {
  event.preventDefault();
  const id = document.getElementById('formUsuario').dataset.usuarioId;
  const nome = document.getElementById('nome').value.trim();
  const nomecompleto = document.getElementById('nomecompleto').value.trim();
  const email = document.getElementById('email').value.trim();
  const nivel = document.getElementById('nivel').value.trim().toLowerCase();
  const senha = document.getElementById('senha').value.trim();

  // Preparar dados para update, só incluir senha se não estiver vazia
  const updateData = { nome, nomecompleto, email, nivel };
  if (senha) {
    updateData.senha = senha;
  }

  const { error } = await supabase
    .from('usuarios')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error(error);
    alert('❌ Erro ao atualizar usuário.');
    return;
  }

  alert('✅ Usuário atualizado com sucesso!');
  document.getElementById('formUsuario').reset();
  document.getElementById('btnSalvar').classList.remove('hidden');
  document.getElementById('btnAtualizar').classList.add('hidden');
  document.getElementById('formUsuario').dataset.usuarioId = '';
  window.mostrarSecao('busca');
  mostrarUsuarios();
}

export async function excluirUsuario(id) {
  const confirmar = confirm('Tem certeza que deseja excluir este usuário?');

  if (!confirmar) return;

  const { error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id);

  if (error) {
    alert('❌ Erro ao excluir usuário.');
    console.error(error);
    return;
  }

  alert('✅ Usuário excluído com sucesso!');
  mostrarUsuarios();
}
