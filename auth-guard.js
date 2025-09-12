import { supabase } from './supabase.js';

/**
 * Guarda de Autenticação
 * Verifica se o usuário tem uma sessão ativa no Supabase.
 * Se não tiver, redireciona para a página de login.
 * Se tiver, preenche as informações do usuário na página.
 */
async function protectPage() {
  // 1. Verifica a sessão atual com o Supabase
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // 2. Se NÃO houver sessão, redireciona para o login
    window.location.href = 'index.html';
    return;
  }

  // 3. Se HÁ uma sessão, busca os dados do perfil no localStorage e preenche a UI
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  const divUsuario = document.getElementById('usuario-logado');
  if (usuario && usuario.nome && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// Executa a proteção assim que o script é carregado
protectPage();