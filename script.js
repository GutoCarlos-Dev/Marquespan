// Inicializa Supabase
const supabase = supabase.createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY'
);

document.addEventListener('DOMContentLoaded', () => {
  // Login
  const formLogin = document.getElementById('formLogin');
  if (formLogin) {
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

        localStorage.setItem('usuarioLogado', data.nome || data.usuario);
        alert(`✅ Bem-vindo, ${data.nome || data.usuario}!`);
        window.location.href = 'dashboard.html';
      } catch (err) {
        console.error('Erro ao conectar com Supabase:', err);
        alert('⚠️ Erro de conexão. Tente novamente mais tarde.');
      }
    });
  }

  // Exibe nome do usuário
  const nomeUsuario = localStorage.getItem('usuarioLogado');
  const divUsuario = document.getElementById('usuario-logado');
  if (nomeUsuario && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${nomeUsuario}`;
  }

  // Lógica de exibição do formulário de veículo
  const btnAddVeiculo = document.getElementById('btnAddVeiculo');
  const btnCancelar = document.getElementById('btnCancelar');
  const formSection = document.getElementById('formNovoVeiculo');
  const formVeiculo = document.getElementById('formVeiculo');

  if (btnAddVeiculo && formSection) {
    btnAddVeiculo.addEventListener('click', () => {
      formSection.style.display = 'block';
      formSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (btnCancelar && formSection) {
    btnCancelar.addEventListener('click', () => {
      formSection.style.display = 'none';
      formVeiculo.reset();
    });
  }

  // Força campos da tela de veículos a usar maiúsculas
  if (formVeiculo) {
    const camposVeiculo = formVeiculo.querySelectorAll('input[type="text"], textarea');
    camposVeiculo.forEach(campo => {
      campo.addEventListener('input', function () {
        this.value = this.value.toUpperCase();
      });
    });

    // Submissão do formulário de veículo
    formVeiculo.addEventListener('submit', async (e) => {
      e.preventDefault();

      const placa = document.getElementById('placa').value.trim();
      const marca = document.getElementById('marca').value.trim();
      const modelo = document.getElementById('modelo').value.trim();
      const tipo = document.getElementById('tipo').value.trim();
      const situacao = document.getElementById('situacao').value.trim();
      const chassi = document.getElementById('chassi').value.trim();
      const renavan = document.getElementById('renavan').value.trim();
      const anofab = document.getElementById('anofab').value.trim();
      const anomod = document.getElementById('anomod').value.trim();

      const { data, error } = await supabase
        .from('veiculos')
        .insert([{ placa, marca, modelo, tipo, situacao, chassi, renavan, anofab, anomod }]);

      if (error) {
        alert('Erro ao salvar veículo.');
      } else {
        alert('✅ Veículo salvo com sucesso!');
        e.target.reset();
        formSection.style.display = 'none';
      }
    });
  }
});
