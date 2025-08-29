<<<<<<< HEAD
// script/auth.js
import { supabase } from '/script/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
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
=======
// script/auth.js
import { supabase } from '/script/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
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
>>>>>>> 10558e27b8270be434cb5b3e3a21a0e039cc7ab9
];