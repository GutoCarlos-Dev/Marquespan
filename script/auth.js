
import { supabaseClient } from './supabase.js';

const DOMINIO_LOGIN = '@marquespan.local';
const AUTH_VERSION = '2026-05-16-auth-v1';
const AUTH_VERSION_KEY = 'marquespan_auth_version';

function gerarEmailInterno(nomeUsuario) {
  return `${nomeUsuario
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')}${DOMINIO_LOGIN}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const parametros = new URLSearchParams(window.location.search);
  if (parametros.get('motivo') === 'inatividade') {
    alert('Sua sessao foi encerrada por inatividade. Faca login novamente.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const formLogin = document.getElementById('login-form');

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();

      const usuario = document.getElementById('username').value.trim();
      const senha = document.getElementById('password').value.trim();

      if (!usuario || !senha) {
        alert('⚠️ Preencha usuário e senha!');
        return;
      }

      try {
        const emailInterno = gerarEmailInterno(usuario);

        console.log('Email interno usado no login:', emailInterno);

        const { data: authData, error: authError } =
          await supabaseClient.auth.signInWithPassword({
            email: emailInterno,
            password: senha
          });
        
        if (authError || !authData.user) {
          console.error('Erro Auth completo:', authError);
          alert('❌ Usuário ou senha inválidos.');
          return;
        }

        const { data: userData, error: userError } = await supabaseClient
          .from('usuarios')
          .select('id, auth_user_id, nome, nivel, filial, status, status_updated_at')
          .eq('auth_user_id', authData.user.id)
          .single();

        if (userError || !userData) {
          await supabaseClient.auth.signOut();
          alert('❌ Usuário sem perfil vinculado. Verifique o cadastro.');
          return;
        }

        let statusEfetivo = userData.status || 'ATIVO';

        if (statusEfetivo === 'TEMPORARIO' && userData.status_updated_at) {
          const dataInicio = new Date(userData.status_updated_at);
          const agora = new Date();
          const diffHoras = (agora - dataInicio) / (1000 * 60 * 60);

          if (diffHoras >= 24) {
            await supabaseClient
              .from('usuarios')
              .update({ status: 'INATIVO' })
              .eq('id', userData.id);

            statusEfetivo = 'INATIVO';
          }
        }

        if (statusEfetivo === 'INATIVO') {
          await supabaseClient.auth.signOut();
          alert('❌ Acesso negado: Usuário INATIVO ou acesso temporário expirado.');
          return;
        }

        const perfilUsuario = {
          id: userData.id,
          auth_user_id: userData.auth_user_id,
          nome: userData.nome,
          nivel: userData.nivel,
          filial: userData.filial
        };

        localStorage.setItem('usuarioLogado', JSON.stringify(perfilUsuario));
        localStorage.setItem(AUTH_VERSION_KEY, AUTH_VERSION);
        localStorage.setItem('marquespan_ultima_atividade', String(Date.now()));

        alert(`✅ Bem-vindo, ${userData.nome}!`);
        window.location.href = 'dashboard.html';

      } catch (err) {
        console.error('Erro ao conectar com Supabase:', err);
        alert('⚠️ Erro de conexão. Tente novamente mais tarde.');
      }
    });
  }

  const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
  const divUsuario = document.getElementById('usuario-logado');

  if (usuarioLogado && usuarioLogado.nome && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${usuarioLogado.nome}`;
  }
});
