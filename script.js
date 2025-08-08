// Inicializa Supabase
const supabase = supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY'
);

document.addEventListener('DOMContentLoaded', () => {
  // LOGIN
  const formLogin = document.getElementById('formLogin');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
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

        localStorage.setItem('usuarioLogado', data.nome || data.usuario);
        alert(`✅ Bem-vindo, ${data.nome || data.usuario}!`);
        window.location.href = 'dashboard.html';
      } catch (err) {
        console.error('Erro ao conectar com Supabase:', err);
        alert('⚠️ Erro de conexão. Tente novamente mais tarde.');
      }
    });
  }

  // EXIBE NOME DO USUÁRIO
  const nomeUsuario = localStorage.getItem('usuarioLogado');
  const divUsuario = document.getElementById('usuario-logado');
  if (nomeUsuario && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${nomeUsuario}`;
  }

  // FORMULÁRIO DE VEÍCULO
  const btnAddVeiculo = document.getElementById('btnAddVeiculo');
  const btnCancelar = document.getElementById('btnCancelar');
  const btnLimpar = document.getElementById('btnLimpar');
  const formSection = document.getElementById('formNovoVeiculo');
  const formVeiculo = document.getElementById('formVeiculo');

  // Oculta o formulário ao carregar
  if (formSection) {
    formSection.classList.add('hidden');
  }

  // Exibe o formulário ao clicar em "Add Veículo"
    btnAddVeiculo?.addEventListener('click', () => {
    formSection.classList.remove('hidden');
    formSection.scrollIntoView({ behavior: 'smooth' });
  });

  // Cancela e oculta o formulário
  btnCancelar?.addEventListener('click', () => {
    formSection.classList.add('hidden');
    formVeiculo.reset();
  });

  // Limpa o formulário
  btnLimpar?.addEventListener('click', () => {
    formVeiculo.reset();
  });

  // Força campos de texto a usar maiúsculas
  const camposTexto = formVeiculo?.querySelectorAll('input[type="text"], textarea');
  camposTexto?.forEach(campo => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.toUpperCase();
    });
  });

  // Submissão do formulário
  formVeiculo?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const veiculo = {
      placa: document.getElementById('placa').value.trim(),
      marca: document.getElementById('marca').value.trim(),
      modelo: document.getElementById('modelo').value.trim(),
      tipo: document.getElementById('tipo').value.trim(),
      situacao: document.getElementById('situacao').value.trim(),
      chassi: document.getElementById('chassi').value.trim(),
      renavan: document.getElementById('renavan').value.trim(),
      anofab: document.getElementById('anofab').value.trim(),
      anomod: document.getElementById('anomod').value.trim()
    };

    const { data, error } = await supabase
      .from('veiculos')
      .insert([veiculo]);

    if (error) {
      alert('Erro ao salvar veículo.');
    } else {
      alert('✅ Veículo salvo com sucesso!');
      formVeiculo.reset();
      formSection.classList.add('hidden');
    }
  });
});