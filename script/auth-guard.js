import { supabaseClient } from './supabase.js';

async function protegerPagina() {
  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error || !session) {
    localStorage.removeItem('usuarioLogado');
    window.location.href = 'index.html';
    return;
  }

  const usuarioLocal = JSON.parse(localStorage.getItem('usuarioLogado'));

  if (!usuarioLocal) {
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