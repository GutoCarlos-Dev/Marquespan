import { supabaseClient } from './supabase.js';

const AUTH_VERSION = '2026-05-16-auth-v1';
const AUTH_VERSION_KEY = 'marquespan_auth_version';

function limparSessaoLocalAntiga() {
  localStorage.removeItem('usuarioLogado');
  localStorage.removeItem('usuario');
  localStorage.removeItem('perfil');
  localStorage.removeItem('empresa_id');
}

async function protegerPagina() {
  const versaoAuth = localStorage.getItem(AUTH_VERSION_KEY);

  if (versaoAuth !== AUTH_VERSION) {
    limparSessaoLocalAntiga();
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error || !session) {
    limparSessaoLocalAntiga();
    window.location.href = 'index.html';
    return;
  }

  const usuarioLocal = JSON.parse(localStorage.getItem('usuarioLogado'));

  if (!usuarioLocal) {
    limparSessaoLocalAntiga();
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  const divUsuario = document.getElementById('usuario-logado');
  if (divUsuario && usuarioLocal.nome) {
    divUsuario.textContent = `👤 Olá, ${usuarioLocal.nome}`;
  }
}

protegerPagina();
