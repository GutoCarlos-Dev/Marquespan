// script/auth.js
import { supabaseClient } from './supabase.js';

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
        // AVISO DE SEGURANÇA: Este método não é o ideal.
        // A senha está sendo comparada diretamente no banco de dados.
        // O correto é migrar o cadastro de usuários para usar `supabase.auth.signUp()`.
        const { data: userData, error: userError } = await supabaseClient
          .from('usuarios')
          .select('nome, nivel, senha') // Seleciona a senha para verificação
          .eq('nome', usuario)
          .single();

        // Verifica se o usuário existe e se a senha corresponde
        if (userError || !userData || userData.senha !== senha) {
          console.error('Erro ao buscar usuário ou usuário não encontrado:', userError);
          alert('❌ Usuário ou senha inválidos.');
          return;
        }

        // Se a verificação for bem-sucedida, armazena os dados do perfil do usuário.
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