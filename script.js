// Inicializa Supabase
const supabase = supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY' // substitua pela sua chave pública real
);

document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('formLogin');

  if (!formLogin) return; // evita erro se não estiver na página de login

  formLogin.addEventListener('submit', async function (e) {
    e.preventDefault();

    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value.trim();

    if (!usuario || !senha) {
      alert('⚠️ Preencha usuário e senha!');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('usuario', usuario)
        .eq('senha', senha)
        .single();

      if (error || !data) {
        alert('❌ Usuário ou senha inválidos.');
        return;
      }

      // Salva o nome ou usuário logado no localStorage
      localStorage.setItem('usuarioLogado', data.nome || data.usuario);

      alert(`✅ Bem-vindo, ${data.nome || data.usuario}!`);
      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error('Erro ao conectar com Supabase:', err);
      alert('⚠️ Erro de conexão. Tente novamente mais tarde.');
    }
  });
});
