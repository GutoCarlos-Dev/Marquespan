// Usa o cliente Supabase já criado no HTML
const supabase = window.supabase;

// CADASTRAR USUÁRIo
if (document.getElementById('formUsuario')) {
  document.getElementById('formUsuario').addEventListener('submit', async function (e) {
    e.preventDefault();

    const codigo = document.getElementById('codigo').value;
    const nome = document.getElementById('nome').value;
    const funcao = document.getElementById('funcao').value;
    const senha = document.getElementById('senha').value;

    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ codigo, nome, funcao, senha }]);

    if (error) {
      alert('❌ Erro ao cadastrar: ' + error.message);
    } else {
      alert('✅ Usuário cadastrado com sucesso!');
      this.reset();
      mostrarUsuarios();
    }
  });
}

// BUSCAR USUÁRIOS
async function mostrarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*');

  const corpoTabela = document.getElementById('corpoTabelaUsuarios');
  corpoTabela.innerHTML = '';

  if (error) {
    alert('❌ Erro ao buscar usuários: ' + error.message);
    return;
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
      <td><button onclick="preencherFormulario('${usuario.codigo}')">✏️ Editar</button></td>
    `;
    corpoTabela.appendChild(linha);
  });
}

// EDITAR USUÁRIO
async function preencherFormulario(codigo) {
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
}

// ATUALIZAR USUÁRIO
async function atualizarUsuario() {
  const codigo = document.getElementById('codigo').value;
  const nome = document.getElementById('nome').value;
  const funcao = document.getElementById('funcao').value;
  const senha = document.getElementById('senha').value;

  const { data, error } = await supabase
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
}
