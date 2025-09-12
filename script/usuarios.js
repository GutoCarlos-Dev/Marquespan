import { supabase } from './supabase.js';

export async function mostrarUsuarios() {
  const termo = document.getElementById('termoBusca').value.trim().toLowerCase();
  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = '';

  let { data, error } = await supabase
    .from('usuarios')
    .select('id, codigo, nome, funcao, email');

  if (error) {
    corpoTabela.innerHTML = '<tr><td colspan="4">Erro ao carregar usuários.</td></tr>';
    return;
  }

  if (termo) {
    data = data.filter(u =>
      u.codigo.toLowerCase().includes(termo) ||
      u.nome.toLowerCase().includes(termo)
    );
  }

  if (data.length === 0) {
    corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  data.forEach(usuario => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${usuario.codigo}</td>
      <td>${usuario.nome}</td>
      <td>${usuario.funcao}</td>
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

  const codigo = document.getElementById('codigo').value.trim();
  const nome = document.getElementById('nome').value.trim();
  const funcao = document.getElementById('funcao').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!codigo || !nome || !funcao || !email) {
    alert('⚠️ Preencha todos os campos.');
    return;
  }

  // IMPORTANTE: A criação do usuário de autenticação (com senha)
  // deve ser feita no painel do Supabase em "Authentication" > "Users".
  // Este formulário apenas cadastra o PERFIL do usuário.
  // O e-mail aqui deve ser o mesmo cadastrado lá.

  const { error } = await supabase
    .from('usuarios')
    .insert([{ codigo, nome, funcao, email }]);

  if (error) {
    alert('❌ Erro ao cadastrar usuário.');
    console.error(error);
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

  document.getElementById('codigo').value = data.codigo;
  document.getElementById('nome').value = data.nome;
  document.getElementById('funcao').value = data.funcao;
  document.getElementById('email').value = data.email;
  document.getElementById('formUsuario').dataset.usuarioId = data.id;

  document.getElementById('btnSalvar').classList.add('hidden');
  document.getElementById('btnAtualizar').classList.remove('hidden');
  window.mostrarSecao('cadastro');
}

export async function atualizarUsuario(event) {
  event.preventDefault();
  const id = document.getElementById('formUsuario').dataset.usuarioId;
  const codigo = document.getElementById('codigo').value.trim();
  const nome = document.getElementById('nome').value.trim();
  const funcao = document.getElementById('funcao').value.trim();
  const email = document.getElementById('email').value.trim();

  const { error } = await supabase
    .from('usuarios')
    .update({ codigo, nome, funcao, email })
    .eq('id', id);

  if (error) {
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
