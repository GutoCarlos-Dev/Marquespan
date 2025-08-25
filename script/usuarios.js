import { supabase } from './supabase.js';

export async function mostrarUsuarios() {
  const termo = document.getElementById('termoBusca').value.trim().toLowerCase();
  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = '';

  let { data, error } = await supabase
    .from('usuarios')
    .select('id, codigo, nome, funcao');

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
  document.getElementById('senha').value = data.senha;
  document.getElementById('formUsuario').dataset.usuarioId = data.id;

  document.getElementById('btnSalvar').classList.add('hidden');
  document.getElementById('btnAtualizar').classList.remove('hidden');
  document.getElementById('inicio')?.style.display = 'none';
  document.querySelectorAll('.secao').forEach(sec => sec.classList.add('hidden'));
  document.getElementById('cadastro').classList.remove('hidden');
}

export async function atualizarUsuario() {
  const id = document.getElementById('formUsuario').dataset.usuarioId;
  const codigo = document.getElementById('codigo').value.trim();
  const nome = document.getElementById('nome').value.trim();
  const funcao = document.getElementById('funcao').value.trim();
  const senha = document.getElementById('senha').value.trim();

  const { error } = await supabase
    .from('usuarios')
    .update({ codigo, nome, funcao, senha })
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
  window.mostrarSecao('busca'); // ✅ agora funciona dentro do módulo
  mostrarUsuarios();
}
