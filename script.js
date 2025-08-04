document.addEventListener('DOMContentLoaded', () => {
  const supabase = window.supabase;

  if (!supabase) {
    console.error('❌ Supabase não foi inicializado corretamente.');
    return;
  }

  // CADASTRAR USUÁRIO
  const formUsuario = document.getElementById('formUsuario');
  if (formUsuario) {
    formUsuario.addEventListener('submit', async function (e) {
      e.preventDefault();

      const codigo = document.getElementById('codigo').value.trim();
      const nome = document.getElementById('nome').value.trim();
      const funcao = document.getElementById('funcao').value.trim();
      const senha = document.getElementById('senha').value.trim();

      if (!codigo || !nome || !funcao || !senha) {
        alert('⚠️ Preencha todos os campos!');
        return;
      }

      const { data, error } = await supabase
        .from('usuarios')
        .insert([{ codigo, nome, funcao, senha }]);

      if (error) {
        alert('❌ Erro ao cadastrar: ' + error.message);
      } else {
        alert('✅ Usuário cadastrado com sucesso!');
        this.reset();
        mostrarUsuarios();
        document.getElementById('btnAtualizar').style.display = 'none';
        document.getElementById('btnSalvar').style.display = 'inline-block';
      }
    });
  }

  // BUSCAR USUÁRIOS COM FILTRO
  window.mostrarUsuarios = async function () {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*');

    const corpoTabela = document.getElementById('corpoTabelaUsuarios');
    corpoTabela.innerHTML = '';

    if (error) {
      alert('❌ Erro ao buscar usuários: ' + error.message);
      return;
    }

    if (!data || data.length === 0) {
      corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    const termoBusca = document.getElementById('termoBusca')?.value.trim().toLowerCase() || '';

    const usuariosFiltrados = termoBusca
      ? data.filter(usuario =>
          usuario.nome.toLowerCase().includes(termoBusca) ||
          usuario.codigo.toLowerCase().includes(termoBusca)
        )
      : data;

    if (usuariosFiltrados.length === 0) {
      corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum usuário corresponde à busca.</td></tr>';
      return;
    }

    usuariosFiltrados.forEach(usuario => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td>${usuario.codigo}</td>
        <td>${usuario.nome}</td>
        <td>${usuario.funcao}</td>
        <td>
          <button onclick="preencherFormulario('${usuario.codigo}')">✏️ Editar</button>
          <button onclick="excluirUsuario('${usuario.codigo}')">🗑️ Excluir</button>
        </td>
      `;
      corpoTabela.appendChild(linha);
    });
  };

  // EDITAR USUÁRIO
  window.preencherFormulario = async function (codigo) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('codigo', codigo)
      .single();

    if (error) {
      alert('❌ Erro ao buscar usuário: ' + error.message);
      return;
    }

    document.getElementById('codigo').value = data.codigo;
    document.getElementById('nome').value = data.nome;
    document.getElementById('funcao').value = data.funcao;
    document.getElementById('senha').value = data.senha;

    document.getElementById('btnAtualizar').style.display = 'inline-block';
    document.getElementById('btnSalvar').style.display = 'none';
  };

  // ATUALIZAR USUÁRIO
  window.atualizarUsuario = async function () {
    const codigo = document.getElementById('codigo').value.trim();
    const nome = document.getElementById('nome').value.trim();
    const funcao = document.getElementById('funcao').value.trim();
    const senha = document.getElementById('senha').value.trim();

    const { error } = await supabase
      .from('usuarios')
      .update({ nome, funcao, senha })
      .eq('codigo', codigo);

    if (error) {
      alert('❌ Erro ao atualizar: ' + error.message);
    } else {
      alert('✅ Usuário atualizado com sucesso!');
      document.getElementById('formUsuario').reset();
      mostrarUsuarios();
      document.getElementById('btnAtualizar').style.display = 'none';
      document.getElementById('btnSalvar').style.display = 'inline-block';
    }
  };

  // EXCLUIR USUÁRIO
  window.excluirUsuario = async function (codigo) {
    if (!confirm('❗ Tem certeza que deseja excluir este usuário?')) return;

    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('codigo', codigo);

    if (error) {
      alert('❌ Erro ao excluir: ' + error.message);
    } else {
      alert('🗑️ Usuário excluído com sucesso!');
      mostrarUsuarios();
    }
  };
});
