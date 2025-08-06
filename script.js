// Inicializa Supabase
const supabase = supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'public-anon-key' // substitua pela sua chave pública real
);

document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('formLogin');

  formLogin.addEventListener('submit', async function (e) {
    e.preventDefault();

    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value.trim();

    if (!usuario || !senha) {
      alert('⚠️ Preencha usuário e senha!');
      return;
    }

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

    alert('✅ Login realizado com sucesso!');
    window.location.href = 'dashboard.html';
  });
});
