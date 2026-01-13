import { supabaseClient } from './supabase.js';

async function mostrarUsuarios() {
  const termo = document.getElementById('termoBusca').value.trim().toLowerCase();
  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = '';

  let { data, error } = await supabaseClient
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

async function cadastrarUsuario(event) {
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

  // Modificação: Chamar a função RPC 'criar_novo_usuario' em vez de insert direto
  const { error } = await supabaseClient
    .rpc('criar_novo_usuario', {
      p_nome: nome,
      p_nomecompleto: nomecompleto,
      p_email: email,
      p_nivel: nivel,
      p_senha: senha
    });

  if (error) {
    console.error(error);
    // Mensagem de erro mais detalhada para o desenvolvedor
    alert(`❌ Erro ao cadastrar usuário: ${error.message}`);
    return;
  }

  alert('✅ Usuário cadastrado com sucesso!');
  document.getElementById('formUsuario').reset();
  window.mostrarSecao('busca');
  mostrarUsuarios();
}


async function editarUsuario(id) {
  const { data, error } = await supabaseClient
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
  
  // CORREÇÃO: Seleção robusta do nível (Case Insensitive)
  const nivelSelect = document.getElementById('nivel');
  const nivelBanco = (data.nivel || '').trim();
  
  // Busca a opção correspondente ignorando case para garantir que o valor correto seja selecionado
  const option = Array.from(nivelSelect.options).find(opt => opt.value.toLowerCase() === nivelBanco.toLowerCase());
  if (option) {
      nivelSelect.value = option.value;
  } else {
      nivelSelect.value = nivelBanco; // Fallback para atribuição direta
  }

  // Não carregar senha por segurança; deixar campo vazio para alteração opcional
  document.getElementById('senha').value = '';
  document.getElementById('formUsuario').dataset.usuarioId = data.id;

  document.getElementById('btnSalvar').classList.add('hidden');
  document.getElementById('btnAtualizar').classList.remove('hidden');
  window.mostrarSecao('cadastro');
}

async function atualizarUsuario(event) {
  event.preventDefault();
  const id = document.getElementById('formUsuario').dataset.usuarioId;
  
  if (!id) {
    alert('Erro: ID do usuário não encontrado para atualização.');
    return;
  }

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

  // Adicionado .select() para confirmar a atualização e verificar erros
  const { data, error } = await supabaseClient
    .from('usuarios')
    .update(updateData)
    .eq('id', id)
    .select();

  if (error) {
    console.error(error);
    alert(`❌ Erro ao atualizar usuário: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    alert('⚠️ Nenhuma alteração foi salva. Verifique se o usuário ainda existe.');
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

async function excluirUsuario(id) {
  const confirmar = confirm('Tem certeza que deseja excluir este usuário?');

  if (!confirmar) return;

  const { error } = await supabaseClient
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

// Expor funções para o escopo global (window) para que os botões no HTML possam chamá-las
window.mostrarUsuarios = mostrarUsuarios;
window.cadastrarUsuario = cadastrarUsuario;
window.editarUsuario = editarUsuario;
window.atualizarUsuario = atualizarUsuario;
window.excluirUsuario = excluirUsuario;
 
function prepararNovoCadastro() {
    document.getElementById('formUsuario').reset();
    document.getElementById('btnSalvar').classList.remove('hidden');
    document.getElementById('btnAtualizar').classList.add('hidden');
    document.getElementById('formUsuario').dataset.usuarioId = '';
    mostrarSecao('cadastro');
}
window.prepararNovoCadastro = prepararNovoCadastro;
 
 
function mostrarSecao(id) {
  document.querySelectorAll('.secao').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
window.mostrarSecao = mostrarSecao;

/**
 * Carrega os níveis de permissão do banco de dados e preenche o select.
 */
async function carregarNiveisDisponiveis() {
  const nivelSelect = document.getElementById('nivel');
  if (!nivelSelect) return;

  const { data, error } = await supabaseClient
    .from('nivel_permissoes')
    .select('nivel')
    .order('nivel', { ascending: true });

  if (error) {
    console.error('Erro ao carregar níveis:', error);
    return;
  }

  data.forEach(item => {
    const option = document.createElement('option');
    option.value = (item.nivel || '').toLowerCase();
    // Formata para Capitalize (Primeira maiúscula, resto minúscula) para exibição amigável
    const texto = item.nivel || '';
    option.textContent = texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
    nivelSelect.appendChild(option);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnAtualizarLista')?.addEventListener('click', mostrarUsuarios);
  document.getElementById('termoBusca')?.addEventListener('input', mostrarUsuarios);
  document.getElementById('formUsuario')?.addEventListener('submit', (e) => {
    const id = document.getElementById('formUsuario').dataset.usuarioId;
    if (id) {
      atualizarUsuario(e);
    } else {
      cadastrarUsuario(e);
    }
  });
  document.getElementById('btnAdicionarNovo')?.addEventListener('click', prepararNovoCadastro);
  carregarNiveisDisponiveis();
  mostrarUsuarios();
});
