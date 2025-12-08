// script/auth.js

document.addEventListener('DOMContentLoaded', () => {
  // Corrigido: ID do formulário é 'login-form'
  const formLogin = document.getElementById('login-form');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Corrigido: IDs dos campos são 'username' e 'password'
      const usuario = document.getElementById('username').value.trim();
      const senha = document.getElementById('password').value.trim();

      if (!usuario || !senha) {
        alert('⚠️ Preencha usuário e senha!');
        return;
      }

      try {
        // Passo 1: Buscar o e-mail do usuário com base no nome de usuário fornecido.
        // Esta consulta é anônima e precisa que a RLS permita a leitura da coluna 'email' e 'nome'.
        const { data: userData, error: userError } = await supabaseClient
          .from('usuarios')
          .select('email, nome, nivel') // Seleciona apenas os dados necessários
          .eq('nome', usuario)
          .single();

        if (userError || !userData) {
          console.error('Erro ao buscar usuário ou usuário não encontrado:', userError);
          alert('❌ Usuário ou senha inválidos.');
          return;
        }

        // Passo 2: Usar o e-mail encontrado para fazer o login seguro com Supabase Auth.
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
          email: userData.email,
          password: senha,
        });

        if (authError) {
          console.error('Erro de autenticação:', authError);
          alert('❌ Usuário ou senha inválidos.');
          return;
        }

        // Passo 3: Se o login for bem-sucedido, armazena os dados do perfil do usuário.
        // É uma boa prática armazenar apenas os dados do perfil, não os dados de autenticação.
        const perfilUsuario = {
          nome: userData.nome,
          nivel: userData.nivel,
        };
        localStorage.setItem('usuarioLogado', JSON.stringify(perfilUsuario));
        alert(`✅ Bem-vindo, ${userData.nome}!`);
        window.location.href = 'dashboard.html';
      } catch (err) {
        console.error('Erro ao conectar com Supabase:', err);
        alert('⚠️ Erro de conexão. Tente novamente mais tarde.');
      }
    });
  }

  const nomeUsuario = localStorage.getItem('usuarioLogado');
  const divUsuario = document.getElementById('usuario-logado');
  if (nomeUsuario && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${nomeUsuario}`;
  }
});