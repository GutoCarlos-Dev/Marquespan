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
        // Corrigido: A coluna de login é 'nome', não 'usuario'
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

        // Corrigido: Salva o objeto completo do usuário para uso em outras páginas
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

const usuarios = [
  { nome: 'admin', senha: 'admin' },
  { nome: 'guto', senha: '123456' },
  { nome: 'jones', senha: '123456' },
  { nome: 'acacio', senha: '123456' }
];