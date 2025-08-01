// Inicializa o cliente Supabase
const supabase = supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY'
);

// Evento de cadastro de usuário
document.getElementById('formUsuario').addEventListener('submit', async function(e) {
  e.preventDefault();

  const codigo = document.getElementById('codigo').value;
  const nome = document.getElementById('nome').value;
  const funcao = document.getElementById('funcao').value;
  const senha = document.getElementById('senha').value;

  const { data, error } = await supabase
  .from('usuarios')
  .insert([{ codigo, nome, funcao, senha }])
  .select();

  if (error) {
    alert('❌ Erro ao cadastrar: ' + error.message);
  } else {
    alert('✅ Usuário cadastrado com sucesso!');
    console.log('Dados salvos:', data);
    this.reset();
    mostrarUsuarios();
  }
});

// Evento de busca com botão
document.getElementById('botaoBusca').addEventListener('click', mostrarUsuarios);

// Busca automática ao digitar (opcional)
document.getElementById('busca').addEventListener('input', mostrarUsuarios);

// Função para buscar e exibir usuários
async function mostrarUsuarios() {
  const termo = document.getElementById('busca').value.toLowerCase();
  const lista = document.getElementById('resultados');
  lista.innerHTML = '';

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .ilike('nome', `%${termo}%`);

  if (error) {
    console.error('Erro ao buscar usuários:', error.message);
    return;
  }

  if (data.length === 0) {
    lista.innerHTML = '<li>Nenhum usuário encontrado.</li>';
    return;
  }

  data.forEach(u => {
    const item = document.createElement('li');
    item.innerHTML = `
      ${u.codigo} - ${u.nome} (${u.funcao})
      <button onclick="editarUsuario('${u.id}')">Editar</button>
      <button onclick="excluirUsuario('${u.id}')">Excluir</button>
    `;
    lista.appendChild(item);
  });
}

// Função de exclusão de usuário
async function excluirUsuario(id) {
  if (confirm('Tem certeza que deseja excluir este usuário?')) {
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (error) {
      alert('❌ Erro ao excluir: ' + error.message);
    } else {
      alert('✅ Usuário excluído com sucesso!');
      mostrarUsuarios();
    }
  }
}

// Função de edição (ainda não implementada)
function editarUsuario(id) {
  alert('Função de edição ainda não implementada. ID: ' + id);
}
