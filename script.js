const supabase = supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co', // substitua pela URL do seu projeto
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY' // substitua pela sua chave pública
);

document.getElementById('formUsuario').addEventListener('submit', async function(e) {
  e.preventDefault();
  const { codigo, nome, funcao, senha } = {
    codigo: document.getElementById('codigo').value,
    nome: document.getElementById('nome').value,
    funcao: document.getElementById('funcao').value,
    senha: document.getElementById('senha').value
  };

  const { error } = await supabase
    .from('usuarios')
    .insert([{ codigo, nome, funcao, senha }]);

  if (error) {
    alert('Erro ao cadastrar: ' + error.message);
  } else {
    alert('Usuário cadastrado com sucesso!');
    this.reset();
  }
});
document.getElementById('busca').addEventListener('input', async function() {
  const termo = this.value.toLowerCase();
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .ilike('nome', `%${termo}%`);

  const lista = document.getElementById('resultados');
  lista.innerHTML = '';

  if (data) {
    data.forEach(u => {
      const item = document.createElement('li');
      item.textContent = `${u.codigo} - ${u.nome} (${u.funcao})`;
      lista.appendChild(item);
    });
  }
});

