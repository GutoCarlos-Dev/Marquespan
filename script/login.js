import { supabase } from './supabase.js';

/**
 * Script de Autenticação para a tela de Login
 */
document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('formLogin');
  const btnLogout = document.getElementById('btnLogout');

  // DIAGNÓSTICO: Confirma que o script correto está sendo executado.
  console.log('✅ Script de login v2.0 carregado.');

  // ETAPA DE LIMPEZA: Força o logout para limpar qualquer sessão inválida ou antiga.
  // Isso garante que estamos começando do zero a cada tentativa de login.
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert('Erro ao limpar sessão: ' + error.message);
      } else {
        localStorage.removeItem('usuarioLogado');
        alert('Sessão limpa com sucesso! Tente logar novamente.');
      }
    });
  }

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();

      const codigo = document.getElementById('codigo').value.trim();
      const senha = document.getElementById('senha').value.trim();

      try {
        // 1. Busca o e-mail correspondente ao código informado
        const { data: email, error: rpcError } = await supabase.rpc('get_email_by_codigo', { user_codigo: codigo });

        if (rpcError || !email) {
          console.error('Erro ao buscar e-mail pelo código:', rpcError);
          alert('❌ Usuário não encontrado.');
          return;
        }

        // 2. Tenta fazer o login com e-mail e senha
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password: senha });

        if (authError) {
          alert('❌ Senha inválida.');
          return;
        }

        // 3. Se o login for bem-sucedido, busca os dados do perfil para salvar localmente
        const { data: userData, error: userError } = await supabase.from('usuarios').select('id, codigo, nome, funcao').eq('codigo', codigo).single();

        if (userError || !userData) {
          alert('⚠️ Login bem-sucedido, mas não foi possível carregar os dados do perfil.');
          return;
        }

        localStorage.setItem('usuarioLogado', JSON.stringify(userData));
        alert(`✅ Acesso autorizado! Olá, ${userData.nome}`);
        window.location.href = 'dashboard.html';
      } catch (err) {
        console.error('Erro ao conectar com Supabase:', err);
        alert('⚠️ Erro de conexão. Tente novamente mais tarde.');
      }
    });
  }
});