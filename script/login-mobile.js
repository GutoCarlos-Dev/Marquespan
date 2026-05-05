import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formLoginMobile');
    if (form) {
        form.addEventListener('submit', handleLogin);
    }
});

async function handleLogin(e) {
    e.preventDefault();
    
    const usuarioInput = document.getElementById('usuario').value.trim();
    const senhaInput = document.getElementById('senha').value;
    const btnLogin = e.target.querySelector('button[type="submit"]');

    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

    try {
        // Busca o usuário na tabela existente
        const { data: usuario, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('nome', usuarioInput)
            .eq('senha', senhaInput) // Nota: Recomenda-se o uso de hash no futuro
            .single();

        if (error || !usuario) {
            throw new Error('Usuário ou senha incorretos.');
        }

        // Monta o objeto de sessão compatível com menu.js e permissoes.js
        const sessao = {
            id: usuario.id,
            nome: usuario.nomecompleto || usuario.nome,
            usuario_login: usuario.nome,
            nivel: usuario.nivel,
            email: usuario.email
        };

        localStorage.setItem('usuarioLogado', JSON.stringify(sessao));
        window.location.href = '../dashboard.html'; // Redireciona para o painel principal

    } catch (err) {
        alert(err.message);
        btnLogin.disabled = false;
        btnLogin.textContent = 'ENTRAR';
    }
}