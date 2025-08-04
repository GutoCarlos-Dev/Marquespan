const supabase = window.supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJz...'
);

// CADASTRAR USUÁRIO
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

  const resultado = document.getElementById('resultadoBusca');
  resultado.innerHTML = '';

  if (error) {
    alert('❌ Erro ao buscar usuários: ' + error.message);
    return;
  }

  if (data.length === 0) {
    resultado.innerHTML = '<p>Nenhum usuário encontrado.</p>';
    return;
  }

  data.forEach(usuario => {
    const div = document.createElement('div');
    div.innerHTML = `
      <p><strong>Código:</strong> ${usuario.codigo}</p>
      <p><strong>Nome:</strong> ${usuario.nome}</p>
      <p><strong>Função:</strong> ${usuario.funcao}</p>
      <button onclick="preencherFormulario(${usuario.codigo})">✏️ Editar</button>
      <hr>
    `;
    resultado.appendChild(div);
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

  // Mostrar botão Atualizar, esconder botão Salvar
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

    // Esconder botão Atualizar, mostrar botão Salvar
    document.getElementById('btnAtualizar').style.display = 'none';
    document.getElementById('btnSalvar').style.display = 'inline-block';
  }
}
