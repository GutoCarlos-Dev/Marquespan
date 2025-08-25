import { supabase } from './supabase.js';

export async function mostrarUsuarios() {
  const termo = document.getElementById('termoBusca').value.trim().toLowerCase();
  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = ''; // limpa a tabela

  let { data, error } = await supabase
    .from('usuarios')
    .select('id, codigo, nome, funcao');

  if (error) {
    console.error('Erro ao buscar usuários:', error);
    corpoTabela.innerHTML = '<tr><td colspan="4">Erro ao carregar usuários.</td></tr>';
    return;
  }

  // ✅ Se houver termo, filtra localmente
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

  // ✅ Renderiza os usuários
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
