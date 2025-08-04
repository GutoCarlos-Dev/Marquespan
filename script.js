const supabase = window.supabase;

if (!supabase) {
  console.error('❌ Supabase não foi inicializado corretamente.');
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

    console.log('🔄 Enviando dados para o Supabase:', { codigo, nome, funcao, senha });

    const { data: insertData, error: insertError } = await supabase
      .from('usuarios')
      .insert([{ codigo, nome, funcao, senha }]);

    console.log('📥 Resposta Supabase:', { insertData, insertError });

    if (insertError) {
      alert('❌ Erro ao cadastrar: ' + insertError.message);
    } else {
      alert('✅ Usuário cadastrado com sucesso!');
      this.reset();
      mostrarUsuarios();
      document.getElementById('btnAtualizar').style.display = 'none';
      document.getElementById('btnSalvar').style.display = 'inline-block';
    }
  });
}

// BUSCAR USUÁRIOS
window.mostrarUsuarios = async function () {
  const { data: usersData, error: usersError } = await supabase
    .from('usuarios')
    .select('*');

  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = '';

  if (usersError) {
    alert('❌ Erro ao buscar usuários: ' + usersError.message);
    return;
  }

  if (!usersData || usersData.length === 0) {
    corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  usersData.forEach(usuario => {
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
  const { data: userData, error: userError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('codigo', codigo)
    .single();

  if (userError) {
    alert('❌ Erro ao buscar usuário: ' + userError.message);
    return;
  }

  document.getElementById('codigo').value = userData.codigo;
  document.getElementById('nome').value = userData.nome;
  document.getElementById('funcao').value = userData.funcao;
  document.getElementById('senha').value = userData.senha;

  document.getElementById('btnAtualizar').style.display = 'inline-block';
  document.getElementById('btnSalvar').style.display = 'none';
};

// ATUALIZAR USUÁRIO
window.atualizarUsuario = async function () {
  const codigo = document.getElementById('codigo').value.trim();
  const nome = document.getElementById('nome').value.trim();
  const funcao = document.getElementById('funcao').value.trim();
  const senha = document.getElementById('senha').value.trim();

  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ nome, funcao, senha })
    .eq('codigo', codigo);

  if (updateError) {
    alert('❌ Erro ao atualizar: ' + updateError.message);
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

  const { error: deleteError } = await supabase
    .from('usuarios')
    .delete()
    .eq('codigo', codigo);

  if (deleteError) {
    alert('❌ Erro ao excluir: ' + deleteError.message);
  } else {
    alert('🗑️ Usuário excluído com sucesso!');
    mostrarUsuarios();
  }
};
