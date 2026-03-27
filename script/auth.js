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
          .select('id, nome, nivel, senha, filial, status, status_updated_at')
          .eq('nome', usuario)
          .single();

        // Verifica se o usuário existe e se a senha corresponde
        if (userError || !userData || userData.senha !== senha) {
          console.error('Erro ao buscar usuário ou usuário não encontrado:', userError);
          alert('❌ Usuário ou senha inválidos.');
          return;
        }

        // Validação de Status e Expiração de 24h
        let statusEfetivo = userData.status || 'ATIVO';
        if (statusEfetivo === 'TEMPORARIO' && userData.status_updated_at) {
            const dataInicio = new Date(userData.status_updated_at);
            const agora = new Date();
            const diffHoras = (agora - dataInicio) / (1000 * 60 * 60);
            
            if (diffHoras >= 24) {
                await supabaseClient.from('usuarios').update({ status: 'INATIVO' }).eq('id', userData.id);
                statusEfetivo = 'INATIVO';
            }
        }

        if (statusEfetivo === 'INATIVO') {
            alert('❌ Acesso negado: Usuário INATIVO ou acesso temporário expirado.');
            return;
        }

        // Se a verificação for bem-sucedida, armazena os dados do perfil do usuário.
        const perfilUsuario = {
          id: userData.id, // Adiciona o ID do usuário
          nome: userData.nome,
          nivel: userData.nivel,
          filial: userData.filial // Salva a filial no perfil local
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

  // Correção: Parse do JSON para exibir apenas o nome
  const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
  const divUsuario = document.getElementById('usuario-logado');
  if (usuarioLogado && usuarioLogado.nome && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${usuarioLogado.nome}`;
  }
});