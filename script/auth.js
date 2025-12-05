// script/auth.js
import { supabase } from '/script/supabase.js';

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
        // ⚠️ AVISO DE SEGURANÇA: Este método não é seguro.
        // A senha está sendo comparada diretamente no banco de dados.
        // O ideal é usar `supabase.auth.signInWithPassword`.
        const { data, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('nome', usuario)
          .eq('senha', senha)
          .single();

        if (error || !data) {
          alert('❌ Usuário ou senha inválidos.');
          return;
        }

        localStorage.setItem('usuarioLogado', JSON.stringify(data));
        alert(`✅ Bem-vindo, ${data.nome}!`);
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